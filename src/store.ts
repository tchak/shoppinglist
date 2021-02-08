import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { v4 as uuid } from 'uuid';
import { createNanoEvents } from 'nanoevents';
import { io, Socket } from 'socket.io-client';

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
  url?: string;
  endpoint?: string;
  headers?: Record<string, string>;
}

type EventCallback = (operation: Operation) => void;

export class Store {
  #name: string;
  #url: string;
  #endpoint: string;
  #headers?: Record<string, string>;

  #operations = new Map<string, Operation[]>();
  #emitter = createNanoEvents();

  #node?: string;
  #clock?: Clock;
  #db?: DB;
  #socket?: Socket;

  constructor(settings?: StoreSettings) {
    this.#name = settings?.name ?? 'store';
    this.#url = settings?.url ?? '/';
    this.#endpoint = settings?.endpoint ?? 'operations';
    this.#headers = settings?.headers;
  }

  get node() {
    if (!this.#node) {
      throw new Error('Store failed to initialize');
    }
    return this.#node;
  }

  get clock() {
    if (!this.#clock) {
      throw new Error('Store failed to initialize');
    }
    return this.#clock;
  }

  async db() {
    if (!this.#db) {
      this.#db = await createDB(this.#name);
      const node = await this.#db.get('meta', 'node');
      if (node) {
        this.#node = node;
      } else {
        this.#node = uuid();
        await this.#db.put('meta', this.#node, 'node');
      }
      this.#socket = io(this.#url, {
        transports: ['websocket'],
        query: {
          'node-id': this.#node,
          'db-version': `${DB_VERSION}`,
        },
      });
      this.#clock = new Clock(this.#node);
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
      await this.fetchEntity(id, options?.include);
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
      this.clock.recv(operation.meta.timestamp);
    }
    await this.transform(operations, this.clock.inc());
  }

  async sync() {
    const db = await this.db();
    const operations = await db.getAllFromIndex(
      'operations',
      'sync',
      'pending'
    );

    if (operations.length === 0) {
      return true;
    }

    const response = await this.request('post', {
      'atomic:operations': operations,
    });
    if (!response) {
      return false;
    }

    const tx = db.transaction('operations', 'readwrite');
    const sync = this.clock.inc();
    for (const operation of operations) {
      await tx.store.put({ ...operation, meta: { ...operation.meta, sync } });
    }
    await tx.done;
    return true;
  }

  on(type: string, callback: EventCallback): () => void;
  on(type: string, id: ID, callback: EventCallback): () => void;
  on(
    type: string,
    idOrCallback: ID | EventCallback,
    callback?: EventCallback
  ): () => void {
    if (typeof idOrCallback === 'function') {
      return this.#emitter.on(`change:${type}`, idOrCallback);
    }
    return this.#emitter.on(
      `change:${type}:${idOrCallback}`,
      callback as EventCallback
    );
  }

  subscribe(type: string, id: ID, callback: () => void): () => void;
  subscribe(
    type: string,
    id: ID,
    options: { include?: string[] },
    callback: () => void
  ): () => void;
  subscribe(
    type: string,
    id: ID,
    optionsOrCallback?: { include?: string[] } | (() => void),
    maybeCallback?: () => void
  ): () => void {
    const options =
      typeof optionsOrCallback == 'function' ? undefined : optionsOrCallback;
    const callback = maybeCallback ? maybeCallback : optionsOrCallback;

    const _callback = async (operations: Operation[]) => {
      await this.push(operations);
      (callback as () => void)();
    };

    if (this.#socket) {
      this.#socket.emit('subscribe', { type, id, ...options });
      this.#socket.on('operations', _callback);
    }
    return () => {
      if (this.#socket) {
        this.#socket.emit('unsubscribe', { type, id, ...options });
        this.#socket.off('operations', _callback);
      }
    };
  }

  private meta() {
    return {
      id: uuid(),
      timestamp: this.clock.inc(),
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
      this.#emitter.emit(`change:${operation.ref.type}`, operation);
      this.#emitter.emit(
        `change:${operation.ref.type}:${operation.ref.id}`,
        operation
      );
    }

    requestAnimationFrame(() => this.sync());
  }

  private async request(method: 'get' | 'post' = 'get', data?: unknown) {
    if (!this.#url) {
      return false;
    }
    await this.db();
    try {
      const isPost = method == 'post';
      const response = await fetch(this.buildRequestURL(method, data), {
        method,
        headers: {
          ...this.#headers,
          'x-node-id': this.node,
          'x-db-version': `${DB_VERSION}`,
          ...(isPost ? { 'content-type': 'application/json' } : undefined),
        },
        ...(isPost ? { body: JSON.stringify(data) } : undefined),
      });

      if (response.ok) {
        return response;
      }
    } catch (e) {
      console.error(e);
      return false;
    }

    return false;
  }

  private buildRequestURL(method: 'get' | 'post', data?: unknown) {
    const url = `${this.#url}/${this.#endpoint}`;

    if (method == 'get' && data) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(
        data as Record<string, string>
      )) {
        params.set(key, value);
      }
      return `${url}?${params.toString()}`;
    }

    return url;
  }
}

interface Schema extends DBSchema {
  meta: {
    key: string;
    value: string;
  };
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

const DB_VERSION = 1;

function createDB(name: string) {
  return openDB<Schema>(name, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore('meta');

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
