import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { v4 as uuid } from 'uuid';

import { Clock, cmp, unpack } from './hlc';
import {
  AddEntityOperation,
  RemoveEntityOperation,
  ID,
  Operation,
  UpdateEntityOperation,
  AddToHasManyOperation,
  RemoveFromHasManyOperation,
  isAddToHasManyOperation,
  isRemoveFromHasManyOperation,
} from './operations';
import { Identifier, Entity, materializeEntity } from './entity';

export interface StoreSettings {
  name?: string;
  node?: string;
  url?: string;
  headers?: Record<string, string>;
}

type EventCallback = (operation: Operation) => void;

export class Store {
  #name: string;
  #node: string;
  #url: string;
  #headers?: Record<string, string>;

  #operations = new Map<string, Operation[]>();
  #events = new Map<string, Set<EventCallback>>();
  #clock: Clock;
  #db?: DB;

  constructor(settings?: StoreSettings) {
    this.#name = settings?.name ?? 'store';
    this.#node = settings?.node ?? clientId();
    this.#url = settings?.url ?? '/operations';
    this.#headers = settings?.headers;
    this.#clock = new Clock(this.#node);
  }

  get node() {
    return this.#node;
  }

  async db() {
    if (!this.#db) {
      this.#db = await createDB(this.#name);
    }
    return this.#db;
  }

  async find<T = Entity>(
    type: string,
    options?: { include?: string[] }
  ): Promise<T[]> {
    const db = await this.db();
    const operations = await db.getAllFromIndex('operations', 'type', type);
    const operationsByEntity: Record<string, Operation[]> = {};
    for (const operation of operations) {
      operationsByEntity[operation.ref.id] ||= [];
      operationsByEntity[operation.ref.id].push(operation);
    }
    const entities: T[] = [];
    for (const [id, operations] of Object.entries(operationsByEntity)) {
      this.#operations.set(id, operations.sort(sortByTimestamp));
      const entity = await this.materializeEntity<T>(id, options?.include);
      if (entity) {
        entities.push(entity);
      }
    }

    return entities;
  }

  async findOne<T = Entity>(
    { type, id }: Identifier,
    options?: { fetch?: boolean; include?: string[] }
  ): Promise<T | null> {
    if (options?.fetch) {
      await this.fetchEntity(id, options?.include);
    }
    return this.materializeEntity<T>(id, options?.include);
  }

  async findOneOrFail<T = Entity>(
    { type, id }: Identifier,
    options?: { fetch?: boolean; include?: string[] }
  ) {
    if (options?.fetch) {
      console.log('fetch!');
      await this.fetchEntity(id, options?.include);
      console.log('fetched!');
    }
    const entity = await this.materializeEntity<T>(id, options?.include);
    if (entity) {
      return entity;
    }
    throw new Error('Not Found');
  }

  async add(type: string, attributes?: Record<string, unknown>): Promise<ID> {
    const operation: AddEntityOperation = {
      op: 'add',
      ref: {
        type,
        id: uuid(),
      },
      data: {
        attributes,
      },
      meta: this.meta(),
    };

    await this.transform(operation);

    return operation.ref.id;
  }

  async update(
    { type, id }: Identifier,
    attributes: Record<string, unknown>
  ): Promise<void> {
    const entity = await this.findOneOrFail({ type, id });
    const operations: UpdateEntityOperation[] = Object.entries(attributes)
      .filter(([key, value]) => entity[key] !== value)
      .map(([key, value]) => ({
        op: 'update',
        ref: {
          type,
          id,
        },
        data: {
          attributes: {
            [key]: value,
          },
        },
        meta: this.meta(),
      }));

    await this.transform(operations);
  }

  async remove({ type, id }: Identifier): Promise<void> {
    const operation: RemoveEntityOperation = {
      op: 'remove',
      ref: {
        type,
        id,
      },
      meta: this.meta(),
    };

    await this.transform(operation);
  }

  async addToHasManyEntities(
    { type, id }: Identifier,
    relationship: string,
    data: Identifier
  ) {
    const operation: AddToHasManyOperation = {
      op: 'add',
      ref: {
        type,
        id,
        relationship,
      },
      data,
      meta: this.meta(),
    };

    await this.transform(operation);
  }

  async removeFromHasManyEntities(
    { type, id }: Identifier,
    relationship: string,
    data: Identifier
  ) {
    const operation: RemoveFromHasManyOperation = {
      op: 'remove',
      ref: {
        type,
        id,
        relationship,
      },
      data,
      meta: this.meta(),
    };

    await this.transform(operation);
  }

  async push(operations: Operation[]) {
    for (const operation of operations) {
      this.#clock.recv(operation.meta.timestamp);
    }
    await this.transform(operations, this.#clock.inc());
  }

  async sync() {
    const db = await this.db();
    const operations = await db.getAllFromIndex(
      'operations',
      'sync',
      'pending'
    );

    const response = await this.request('post', {
      'atomic:operations': operations,
    });
    if (!response) {
      return false;
    }

    const tx = db.transaction('operations', 'readwrite');
    const sync = this.#clock.inc();
    for (const operation of operations) {
      await tx.store.put({ ...operation, meta: { ...operation.meta, sync } });
    }
    await tx.done;
    return true;
  }

  subscribe(callback: EventCallback, type: string, id?: ID): () => void {
    this.eventHandlersFor(type, id).add(callback);

    return () => {
      this.eventHandlersFor(type, id).delete(callback);
    };
  }

  private meta() {
    return {
      id: uuid(),
      timestamp: this.#clock.inc(),
    };
  }

  private async fetchEntity(id: ID, include?: string[]) {
    const response = await this.request('get', { id, include });
    if (!response) {
      return false;
    }

    const data: { 'atomic:operations': Operation[] } = await response.json();

    if (data['atomic:operations'].length) {
      const db = await this.db();
      const keys = await db.getAllKeysFromIndex('operations', 'id', id);
      const includedKeys = await db.getAllKeysFromIndex(
        'operations',
        'type',
        'item'
      );
      const existingKeys = [...new Set([...keys, ...includedKeys])];

      const operations = data['atomic:operations'].filter(
        (operation) => !existingKeys.includes(operation.meta.id)
      );
      await this.push(operations);
    }
  }

  private async operationsFor(
    id: ID,
    include: string[] = []
  ): Promise<Operation[]> {
    console.time(`operationsFor: ${id}`);
    let operations = this.#operations.get(id);
    if (!operations) {
      const db = await this.db();
      const data = await db.getAllFromIndex('operations', 'id', id);
      operations = data.sort(sortByTimestamp);
      this.#operations.set(id, operations);
    }
    if (include.length) {
      const relatedEntities: Record<string, Set<string>> = {};
      for (const operation of operations) {
        if (
          isAddToHasManyOperation(operation) &&
          include.includes(operation.ref.relationship)
        ) {
          relatedEntities[operation.ref.relationship] ||= new Set();
          relatedEntities[operation.ref.relationship].add(operation.data.id);
        } else if (
          isRemoveFromHasManyOperation(operation) &&
          include.includes(operation.ref.relationship)
        ) {
          if (relatedEntities[operation.ref.relationship]) {
            relatedEntities[operation.ref.relationship].delete(
              operation.data.id
            );
          }
        }
      }
      for (const id of Object.values(relatedEntities).flatMap((ids) => [
        ...ids,
      ])) {
        operations.push(...(await this.operationsFor(id)));
      }
    }
    console.timeEnd(`operationsFor: ${id}`);
    return operations;
  }

  private async materializeEntity<T = Entity>(
    id: ID,
    include?: string[]
  ): Promise<T | null> {
    const operations = await this.operationsFor(id, include);
    if (operations.length) {
      const entity = materializeEntity(id, operations);
      if (entity) {
        return Object.freeze(entity) as T;
      }
    }
    return null;
  }

  private async transform(
    operation: Operation | Operation[],
    sync = 'pending'
  ) {
    const db = await this.db();
    const tx = db.transaction('operations', 'readwrite');
    const operations = Array.isArray(operation) ? operation : [operation];
    operations.sort(sortByTimestamp);
    for (const operation of operations) {
      console.log('apply operation:', operation);
      await tx.store.add({
        ...operation,
        meta: {
          ...operation.meta,
          sync,
        },
      });
    }
    await tx.done;
    for (const operation of operations) {
      this.#operations.delete(operation.ref.id);

      for (const handler of this.eventHandlersFor(operation.ref.type)) {
        handler(operation);
      }
      for (const handler of this.eventHandlersFor(
        operation.ref.type,
        operation.ref.id
      )) {
        handler(operation);
      }
    }

    requestAnimationFrame(() => this.sync());
  }

  private async request(method: 'get' | 'post' = 'get', data?: unknown) {
    try {
      const isPost = method === 'post';
      const response = await fetch(
        isPost ? this.#url : this.buildRequestURL(data),
        {
          method,
          headers: {
            ...this.#headers,
            'x-store-node': this.#node,
            ...(isPost ? { 'content-type': 'application/json' } : undefined),
          },
          ...(isPost ? { body: JSON.stringify(data) } : undefined),
        }
      );

      if (response.ok) {
        return response;
      }
    } catch (e) {
      console.error(e);
      return false;
    }

    return false;
  }

  private buildRequestURL(data?: unknown) {
    if (data) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(
        data as Record<string, string>
      )) {
        params.set(key, value);
      }
      return `${this.#url}?${params.toString()}`;
    }
    return this.#url;
  }

  private eventHandlersFor(type: string, id?: ID): Set<EventCallback> {
    const key = id ? identity({ type, id }) : type;
    let handlers = this.#events.get(key);
    if (!handlers) {
      handlers = new Set();
      this.#events.set(key, handlers);
    }
    return handlers;
  }
}

interface Schema extends DBSchema {
  operations: {
    key: string;
    value: Operation;
    indexes: {
      op: string;
      id: string;
      type: string;
      sync: string;
      timestamp: string;
    };
  };
}

type DB = IDBPDatabase<Schema>;

function createDB(name: string) {
  return openDB<Schema>(name, 1, {
    upgrade(db) {
      const store = db.createObjectStore('operations', {
        keyPath: 'meta.id',
      });
      store.createIndex('op', 'op');
      store.createIndex('type', 'ref.type');
      store.createIndex('id', 'ref.id');
      store.createIndex('sync', 'meta.sync');
      store.createIndex('timestamp', 'meta.timestamp');
    },
  });
}

function sortByTimestamp(a: Operation, b: Operation) {
  return cmp(unpack(a.meta.timestamp), unpack(b.meta.timestamp));
}

function identity({ type, id }: { type: string; id: ID }) {
  return `${type}:${id}`;
}

const CLIENT_ID = 'store-client-id';
function clientId(): string {
  let id = localStorage.getItem(CLIENT_ID);
  if (!id) {
    id = uuid();
    localStorage.setItem(CLIENT_ID, id);
  }
  return id;
}
