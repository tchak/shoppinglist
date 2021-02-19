import {
  RecordSchema,
  RecordIdentity,
  RecordNotFoundException,
  RecordTransformOrOperations,
  RecordOperation,
  cloneRecordIdentity,
} from '@orbit/records';
import MemorySource from '@orbit/memory';

import { camelCase } from './utils';
import { OperationStore } from './operation-store';

export interface StoreSettings {
  schema: RecordSchema;
  name?: string;
  url?: string;
  endpoint?: string;
  headers?: Record<string, string>;
  token?: string;
}

export interface FindOneOptions {
  include?: string[];
  fetch?: boolean;
}

export interface FindOptions {
  include?: string[];
}

export interface SubscribeOptions {
  include?: string[];
}

export class Store {
  #source: MemorySource;
  #store: OperationStore;

  constructor({ schema, ...settings }: StoreSettings) {
    this.#source = new MemorySource({ schema });
    this.#store = new OperationStore(settings);

    this.#source.on(
      'update',
      ({ operations }: { operations: RecordOperation[] }) => {
        this.#store.update(operations);
      }
    );
    this.#store.on('update', (operations) => {
      this.#source.cache.update(operations);
    });
  }

  get schema() {
    return this.#source.schema;
  }

  on(event: 'patch', callback: (operation: RecordOperation) => void) {
    return this.#source.cache.on(event, callback);
  }

  async findOneOrFail<T extends Model>(
    modelClass: ModelClass<T>,
    id: string,
    options?: FindOneOptions
  ): Promise<T> {
    const record = await this.findOne(modelClass, id, options);
    if (!record) {
      throw new RecordNotFoundException(modelClass.modelName, id);
    }
    return record;
  }

  async findOne<T extends Model>(
    modelClass: ModelClass<T>,
    id: string,
    options?: FindOneOptions
  ): Promise<T | undefined> {
    if (options?.fetch != false) {
      await this.findRecord(modelClass.modelName, id, options?.include);
    }

    const record = await this.#source.query<RecordIdentity | undefined>(
      (q) => q.findRecord({ type: modelClass.modelName, id }),
      { include: options?.include }
    );
    if (record) {
      return new modelClass(record, this.#source);
    }
    return record;
  }

  async find<T extends Model>(
    modelClass: ModelClass<T>,
    options?: FindOptions
  ): Promise<T[]> {
    await this.findRecords(modelClass.modelName, options?.include);

    const records = await this.#source.query<RecordIdentity[]>(
      (q) => q.findRecords(modelClass.modelName),
      { include: options?.include }
    );
    if (records) {
      return records.map((identity) => new modelClass(identity, this.#source));
    }
    return [];
  }

  update(t: RecordTransformOrOperations) {
    return this.#source.update(t);
  }

  subscribe<T extends Model>(
    modelClass: ModelClass<T>,
    id: string,
    options?: SubscribeOptions
  ) {
    this.#store.subscribe({ type: modelClass.modelName, id }, options);
  }

  private async findRecords(type: string, include?: string[]) {
    const { data, included } = await this.#store.findRecords(type, { include });
    this.#source.cache.update((t) =>
      [...included, ...data].map((record) => t.updateRecord(record))
    );
  }

  private async findRecord(type: string, id: string, include?: string[]) {
    if (!this.#source.cache.getRecordSync({ type, id })) {
      await this.#store.fetchRecord(id, { include });
      const { data, included } = await this.#store.findRecord(id, { include });
      if (data) {
        this.#source.cache.update((t) =>
          [...included, data].map((record) => t.updateRecord(record))
        );
      }
    }
  }
}

export class Model {
  #identity: RecordIdentity;
  #source: MemorySource;

  constructor(identity: RecordIdentity, source: MemorySource) {
    this.#identity = cloneRecordIdentity(identity);
    this.#source = source;
  }

  get identity() {
    return this.#identity;
  }

  get id() {
    return this.#identity.id;
  }

  static get modelName() {
    return camelCase(this.name);
  }

  protected getAttribute<T>(name: string): T | undefined {
    const record = this.#source.cache.getRecordSync(this.#identity);
    if (record?.attributes) {
      return record.attributes[name];
    }
  }

  protected getRelatedRecords<T extends Model>(
    relationship: string,
    hydrate: (identity: RecordIdentity, source: MemorySource) => T
  ) {
    const records = this.#source.cache.getRelatedRecordsSync(
      this.#identity,
      relationship
    );
    if (records) {
      return records.map((identity) => hydrate(identity, this.#source));
    }
    return [];
  }

  protected getRelatedRecord<T extends Model>(
    relationship: string,
    hydrate: (identity: RecordIdentity, source: MemorySource) => T
  ) {
    const record = this.#source.cache.getRelatedRecordSync(
      this.#identity,
      relationship
    );
    if (record) {
      return hydrate(record, this.#source);
    }
    return null;
  }
}

export type ModelClass<T extends Model> = {
  new (identity: RecordIdentity, source: MemorySource): T;
  modelName: string;
};
