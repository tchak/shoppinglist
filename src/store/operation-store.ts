import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { v4 as uuid } from 'uuid';
import {
  RecordIdentity,
  Record,
  RecordOperation,
  UpdateRecordOperation,
  RemoveRecordOperation,
} from '@orbit/records';
import { Dict } from '@orbit/utils';
import { createNanoEvents } from 'nanoevents';

import { Channel } from './channel';
import { Clock, cmp, unpack } from './hlc';
import {
  JSONOperation,
  isAddToRelatedRecordsJSONOperation,
  isRemoveFromRelatedRecordsJSONOperation,
  toJSONOperation,
} from './operation';
import { materializeRecord, RecordDocument } from './record';

export interface StoreSettings {
  name?: string;
  url?: string;
  endpoint?: string;
  headers?: Dict<string>;
  token?: string;
}

export class OperationStore {
  #name: string;
  #url: string;
  #endpoint: string;
  #headers?: Dict<string>;
  #token?: string;

  #channel: Channel;
  #operations = new Map<string, JSONOperation[]>();
  #emitter = createNanoEvents();

  #node?: string;
  #clock?: Clock;
  #db?: Promise<DB>;

  constructor(settings?: StoreSettings) {
    this.#name = settings?.name ?? 'store';
    this.#url = settings?.url ?? '/';
    this.#endpoint = settings?.endpoint ?? 'operations';
    this.#headers = settings?.headers;
    this.#token = settings?.token;
    this.#channel = new Channel();
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
    this.#channel.init({
      node: this.node,
      url: this.#url,
      token: this.#token,
      version: DB_VERSION,
    });
    this.#channel.on('push', (operations) => this.push(operations));
    this.#channel.on('invalidate', (operations) => this.invalidate(operations));
  }

  async findRecords(
    type: string,
    options?: { include?: string[] }
  ): Promise<{ data: Record[]; included: Record[] }> {
    const db = await this.db();
    const operations = await db.getAllFromIndex('operations', 'type', type);
    const operationsByEntity: Dict<JSONOperation[]> = {};
    for (const operation of operations) {
      operationsByEntity[operation.ref.id] ||= [];
      operationsByEntity[operation.ref.id].push(operation);
    }
    const data: Record[] = [];
    const included: Record[] = [];
    for (const [id, operations] of Object.entries(operationsByEntity)) {
      this.#operations.set(id, operations.sort(sortByTimestamp));
      const result = await this.materializeRecord(id, options?.include);
      if (result.data) {
        data.push(result.data);
      }
      included.push(...result.included);
    }

    return { data, included };
  }

  async findRecord(
    id: string,
    options?: { include?: string[] }
  ): Promise<RecordDocument> {
    return this.materializeRecord(id, options?.include);
  }

  async fetchRecord(id: string, options?: { include?: string[] }) {
    const include = options?.include ?? [];
    const response = await this.request('get', { id, include });
    if (!response) {
      return false;
    }

    const data: {
      'atomic:operations': JSONOperation[];
    } = await response.json();

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

  async push(operations: JSONOperation[]) {
    for (const operation of operations) {
      this.clock.recv(operation.meta.timestamp);
    }
    await this.transform(operations, this.clock.inc());
  }

  async update(operations: RecordOperation[]) {
    await this.transform(
      toJSONOperation(operations).map((operation) => ({
        ...operation,
        meta: {
          id: uuid(),
          timestamp: this.clock.inc(),
        },
      }))
    );
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

  subscribe(
    { type, id }: RecordIdentity,
    options?: { include?: string[] }
  ): () => void {
    return this.#channel.subscribe(type, id, options);
  }

  on(event: 'update', callback: (operations: RecordOperation[]) => void) {
    this.#emitter.on(event, callback);
  }

  private async transform(operations: JSONOperation[], sync = 'pending') {
    const db = await this.db();
    const tx = db.transaction('operations', 'readwrite');
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
    this.#channel.invalidate(operations);

    if (operations.length > 0 && sync == 'pending') {
      requestAnimationFrame(() => this.sync());
    }
  }

  private async operationsFor(
    id: string,
    include: string[] = []
  ): Promise<JSONOperation[]> {
    let operations = this.#operations.get(id);
    if (!operations) {
      const db = await this.db();
      const data = await db.getAllFromIndex('operations', 'id', id);
      operations = data.sort(sortByTimestamp);
      this.#operations.set(id, operations);
    }
    if (include.length) {
      const relatedRecords: Dict<Set<string>> = {};
      for (const operation of operations) {
        if (
          isAddToRelatedRecordsJSONOperation(operation) &&
          include.includes(operation.ref.relationship)
        ) {
          relatedRecords[operation.ref.relationship] ||= new Set();
          relatedRecords[operation.ref.relationship].add(operation.data.id);
        } else if (
          isRemoveFromRelatedRecordsJSONOperation(operation) &&
          include.includes(operation.ref.relationship)
        ) {
          if (relatedRecords[operation.ref.relationship]) {
            relatedRecords[operation.ref.relationship].delete(
              operation.data.id
            );
          }
        }
      }
      for (const id of Object.values(relatedRecords).flatMap((ids) => [
        ...ids,
      ])) {
        operations.push(...(await this.operationsFor(id)));
      }
    }
    return operations;
  }

  private async materializeRecord(
    id: string,
    include?: string[]
  ): Promise<RecordDocument> {
    const operations = await this.operationsFor(id, include);
    if (operations.length) {
      return materializeRecord(id, operations);
    }
    return { data: null, included: [] };
  }

  private async invalidate(operations: JSONOperation[]) {
    for (const operation of operations) {
      this.#operations.delete(operation.ref.id);
    }

    const recordOperations: (
      | UpdateRecordOperation
      | RemoveRecordOperation
    )[] = [];

    const ops = new Map(operations.map(({ ref: { id, type } }) => [id, type]));

    for (const [id, type] of [...ops]) {
      const { data } = await this.findRecord(id);
      if (data) {
        recordOperations.push({
          op: 'updateRecord',
          record: data,
        });
      } else {
        recordOperations.push({
          op: 'removeRecord',
          record: {
            id,
            type,
          },
        });
      }
    }

    this.#emitter.emit('update', recordOperations);
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
      for (const [key, value] of Object.entries(data as Dict<string>)) {
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
    value: JSONOperation;
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

function sortByTimestamp(a: JSONOperation, b: JSONOperation) {
  return cmp(unpack(a.meta.timestamp), unpack(b.meta.timestamp));
}
