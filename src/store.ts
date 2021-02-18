import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { v4 as uuid } from 'uuid';
import { createNanoEvents } from 'nanoevents';
import { io, Socket } from 'socket.io-client';
import {
  BroadcastChannel,
  createLeaderElection,
  LeaderElector,
} from 'broadcast-channel';

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
  token?: string;
}

type EventCallback = (operation: Operation) => void;

interface OperationsMessage {
  type: 'invalidate';
  payload: {
    operations: Operation[];
  };
}

interface SubscribeMessage {
  type: 'subscribe';
  payload: {
    type: string;
    id: ID;
    options?: { include?: string[] };
  };
}

interface UnsubscribeMessage {
  type: 'unsubscribe';
  payload: {
    type: string;
    id: ID;
    options?: { include?: string[] };
  };
}

type BroadcastChannelMessage =
  | OperationsMessage
  | SubscribeMessage
  | UnsubscribeMessage;

class SocketChannel {
  #emitter = createNanoEvents();
  #channel = new BroadcastChannel<BroadcastChannelMessage>('store', {
    webWorkerSupport: false,
  });
  #elector: LeaderElector;
  #subscriptions = new Map<
    string,
    { type: string; id: ID; options?: { include?: string[] } }
  >();
  #url: string;
  #token: string;
  #socket?: Socket;

  constructor(url: string, token: string) {
    this.#elector = createLeaderElection(this.#channel);
    this.#url = url;
    this.#token = token;
  }

  init(node: string) {
    this.#elector.awaitLeadership().then(() => {
      this.connect(node);
    });
    this.#channel.addEventListener('message', (message) => {
      switch (message.type) {
        case 'invalidate':
          this.#emitter.emit('invalidate', message.payload.operations);
          break;
        case 'subscribe':
          this.onSubscribe(
            message.payload.type,
            message.payload.id,
            message.payload.options
          );
          break;
        case 'unsubscribe':
          this.onUnsubscribe(
            message.payload.type,
            message.payload.id,
            message.payload.options
          );
      }
    });
  }

  private connect(node: string) {
    const socket = io(this.#url, {
      auth: {
        token: this.#token,
      },
      transports: ['websocket'],
      query: {
        'client-id': node,
        'client-version': `${DB_VERSION}`,
      },
    });

    socket.on('atomic:operations', (operations: Operation[]) => {
      this.#emitter.emit('push', operations);
      for (const [, { type, id }] of this.#subscriptions) {
        this.#emitter.emit('invalidate', [
          {
            ref: {
              type,
              id,
            },
          },
        ]);
      }
    });

    socket.on('connect', () => {
      for (const [, { type, id, options }] of this.#subscriptions) {
        socket.emit('subscribe', { type, id, ...options });
      }
    });

    this.#socket = socket;
  }

  on(
    event: 'invalidate' | 'push',
    callback: (operations: Operation[]) => void
  ) {
    return this.#emitter.on(event, callback);
  }

  invalidate(operations: Operation[]) {
    this.#channel.postMessage({
      type: 'invalidate',
      payload: {
        operations,
      },
    });
  }

  subscribe(type: string, id: ID, options?: { include?: string[] }) {
    this.#channel.postMessage({
      type: 'subscribe',
      payload: {
        type,
        id,
        options,
      },
    });
    this.onSubscribe(type, id, options);
    return () => this.unsubscribe(type, id, options);
  }

  unsubscribe(type: string, id: ID, options?: { include?: string[] }) {
    this.#channel.postMessage({
      type: 'subscribe',
      payload: {
        type,
        id,
        options,
      },
    });
    this.onUnsubscribe(type, id, options);
  }

  private onSubscribe(type: string, id: ID, options?: { include?: string[] }) {
    const key = [type, id, ...(options?.include ?? [])].join(':');
    this.#subscriptions.set(key, {
      type,
      id,
      options,
    });
    if (this.#socket?.connected) {
      this.#socket.emit('subscribe', { type, id, ...options });
    }
  }

  private onUnsubscribe(
    type: string,
    id: ID,
    options?: { include?: string[] }
  ) {
    const key = [type, id, ...(options?.include ?? [])].join(':');
    this.#subscriptions.delete(key);
    if (this.#socket?.connected) {
      this.#socket.emit('unsubscribe', { type, id, ...options });
    }
  }
}

export class Store {
  #name: string;
  #url: string;
  #endpoint: string;
  #headers?: Record<string, string>;
  #token?: string;

  #operations = new Map<string, Operation[]>();
  #emitter = createNanoEvents();

  #node?: string;
  #clock?: Clock;
  #db?: Promise<DB>;
  #channel: SocketChannel;

  constructor(settings?: StoreSettings) {
    this.#name = settings?.name ?? 'store';
    this.#url = settings?.url ?? '/';
    this.#endpoint = settings?.endpoint ?? 'operations';
    this.#headers = settings?.headers;
    this.#token = settings?.token;
    this.#channel = new SocketChannel(this.#url, this.#token ?? '');
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

  get channel() {
    if (!this.#channel) {
      throw new Error('Store failed to initialize');
    }
    return this.#channel;
  }

  db(): Promise<DB> {
    if (!this.#db) {
      this.#db = this.ready();
    }
    return this.#db;
  }

  private async ready() {
    const db = await this.initDB();
    this.#clock = new Clock(this.node);
    this.initChannel();
    return db;
  }

  private async initDB(): Promise<DB> {
    const db = await createDB(this.#name);
    const node = await db.get('meta', 'node');
    if (node) {
      this.#node = node;
    } else {
      this.#node = uuid();
      await db.put('meta', this.#node, 'node');
    }
    return db;
  }

  private initChannel() {
    this.#channel.init(this.node);
    this.#channel.on('push', (operations) => this.push(operations));
    this.#channel.on('invalidate', (operations) => this.invalidate(operations));
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
    { id }: Identifier,
    options?: { fetch?: boolean; include?: string[] }
  ): Promise<T | null> {
    if (options?.fetch) {
      await this.fetchEntity(id, options?.include);
    }
    return this.materializeEntity<T>(id, options?.include);
  }

  async findOneOrFail<T = Entity>(
    { id }: Identifier,
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
    const callback = (maybeCallback
      ? maybeCallback
      : optionsOrCallback) as () => void;

    const off = [
      this.on(type, id, callback),
      this.channel.subscribe(type, id, options),
    ];

    return () => {
      for (const cb of off) {
        cb();
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
      console.debug(
        sync == 'pending'
          ? 'apply local operation:'
          : 'apply operation from remote:',
        operation
      );
      await tx.store.add({
        ...operation,
        meta: {
          ...operation.meta,
          sync,
        },
      });
    }
    await tx.done;
    this.invalidate(operations);
    this.channel.invalidate(operations);

    requestAnimationFrame(() => this.sync());
  }

  private invalidate(operations: Operation[]) {
    for (const operation of operations) {
      this.#operations.delete(operation.ref.id);
      this.#emitter.emit(`change:${operation.ref.type}`, operation);
      this.#emitter.emit(
        `change:${operation.ref.type}:${operation.ref.id}`,
        operation
      );
    }
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
          'x-client-id': this.node,
          'x-client-version': `${DB_VERSION}`,
          ...(this.#token
            ? { authorization: `Bearer ${this.#token}` }
            : undefined),
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

const DB_VERSION = 2;

function createDB(name: string) {
  return openDB<Schema>(name, DB_VERSION, {
    upgrade(db, oldVersion, newVersion) {
      if (oldVersion == 1 && newVersion == 2) {
        db.deleteObjectStore('operations');
      }

      if (oldVersion == 0) {
        db.createObjectStore('meta');
      }

      if (oldVersion == 0 || oldVersion == 1) {
        const store = db.createObjectStore('operations', {
          keyPath: 'meta.id',
        });
        store.createIndex('op', 'op');
        store.createIndex('type', 'ref.type');
        store.createIndex('id', 'ref.id');
        store.createIndex('sync', 'meta.sync');
        store.createIndex('timestamp', 'meta.timestamp');
      }
    },
  });
}

function sortByTimestamp(a: Operation, b: Operation) {
  return cmp(unpack(a.meta.timestamp), unpack(b.meta.timestamp));
}

function identity({ type, id }: { type: string; id: ID }) {
  return `${type}:${id}`;
}
