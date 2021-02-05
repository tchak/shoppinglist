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
} from './operations';
import {
  Identifier,
  Entity,
  materializeEntity,
  materializeEntityLink,
  collectEntityLinks,
} from './entity';

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

  async find<T = Entity>(type: string): Promise<T[]> {
    const db = await this.db();
    const operations = await db.getAllFromIndex('operations', 'type', type);
    const operationsByEntity: Record<string, Operation[]> = {};
    for (const operation of operations) {
      operationsByEntity[operation.ref.id] ||= [];
      operationsByEntity[operation.ref.id].push(operation);
    }
    const entities: T[] = [];
    for (const [id, operations] of Object.entries(operationsByEntity)) {
      this.#operations.set(
        identity({ type, id }),
        operations.sort(sortByTimestamp)
      );
      const entity = await this._materialize<T>(type, id);
      if (entity) {
        entities.push(entity);
      }
    }

    return entities;
  }

  async findOne<T = Entity>(
    { type, id }: Identifier,
    options?: { fetch?: boolean }
  ): Promise<T | null> {
    if (options?.fetch) {
      await this._fetch(type, id);
    }
    return this._materialize<T>(type, id);
  }

  async findOneOrFail<T = Entity>({ type, id }: Identifier) {
    const entity = await this._materialize<T>(type, id);
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
      meta: this._meta(),
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
        meta: this._meta(),
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
      meta: this._meta(),
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
      meta: this._meta(),
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
      meta: this._meta(),
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
    const tx = db.transaction('operations', 'readwrite');
    const operations = await tx.store.index('sync').getAll();

    const response = await this.request('post', {
      'atomic:operations': operations,
    });
    if (!response) {
      tx.abort();
      return false;
    }

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

  _meta() {
    return {
      id: uuid(),
      timestamp: this.#clock.inc(),
    };
  }

  async _fetch(type: string, id: ID) {
    const response = await this.request('get', { id });
    if (!response) {
      return false;
    }

    const data: { 'atomic:operations': Operation[] } = await response.json();

    const db = await this.db();
    const keys = await db.getAllKeysFromIndex('operations', 'id', id);

    const operations = data['atomic:operations'].filter(
      (operation) => !keys.includes(operation.meta.id)
    );
    await this.push(operations);
  }

  async _operationsFor(type: string, id: ID): Promise<Operation[]> {
    const key = identity({ type, id });
    let operations = this.#operations.get(key);
    if (!operations) {
      const db = await this.db();
      const data = await db.getAllFromIndex('operations', 'id', id);
      operations = data.sort(sortByTimestamp);
      this.#operations.set(key, operations);
    }
    return operations;
  }

  async _materialize<T = Entity>(type: string, id: ID): Promise<T | null> {
    const operations = await this._operationsFor(type, id);
    if (operations.length) {
      const entity = materializeEntity(id, operations);
      if (entity) {
        for (const [parent, field, { type, id }] of collectEntityLinks(
          entity
        )) {
          const operations = await this._operationsFor(type, id);
          materializeEntityLink([parent, field, { type, id }], operations);
        }
        return Object.freeze(entity) as T;
      }
    }
    return null;
  }

  async transform(operation: Operation | Operation[], sync?: string) {
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
      const key = identity(operation.ref);
      this.#operations.delete(key);

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
  }

  private async request(method: 'get' | 'post' = 'get', data?: unknown) {
    try {
      const response = await fetch(
        method === 'post' ? this.#url : this.buildRequestURL(data),
        {
          method,
          headers: {
            ...this.#headers,
            'x-store-node': this.#node,
            ...(data ? { 'content-type': 'application/json' } : undefined),
          },
          body: data ? JSON.stringify(data) : undefined,
        }
      );

      if (response.ok) {
        return response;
      }
    } catch {
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
      return this.#url + params.toString();
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
