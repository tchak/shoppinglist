import { createContext, useContext, useEffect } from 'react';
import {
  useQuery,
  useMutation,
  QueryObserverResult,
  QueryClient,
} from 'react-query';
import {
  RecordTransformOrOperations,
  RecordOperation,
  RecordIdentity,
} from '@orbit/records';

import { Model, ModelClass, Store } from './store';

const StoreContext = createContext<Store | undefined>(undefined);
const StoreProvider = StoreContext.Provider;

export { Store, StoreProvider };

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (store) {
    return store;
  }
  throw new Error('Store is undefined');
}

export interface UseRecordQueryOptions {
  include?: string[];
}

export function useRecordsQuery<T extends Model>(
  modelClass: ModelClass<T>,
  options?: UseRecordQueryOptions
): QueryObserverResult<T[]> {
  const store = useStore();
  const type = modelClass.modelName;
  const include = options?.include ?? [];

  return useQuery(['records', type], () => store.find(modelClass, { include }));
}

export interface UseRecordsQueryOptions {
  include?: string[];
  fetch?: boolean;
  subscribe?: boolean;
}

export function useRecordQuery<T extends Model>(
  modelClass: ModelClass<T>,
  id: string,
  options?: UseRecordsQueryOptions
): QueryObserverResult<T> {
  const store = useStore();
  const type = modelClass.modelName;
  const include = options?.include ?? [];
  const subscribe = options?.subscribe !== false;
  const fetch = options?.fetch !== false;

  useEffect(() => {
    if (subscribe) {
      return store.subscribe(modelClass, id, { include });
    }
  }, [type, id, subscribe, include.join(',')]);

  return useQuery<T>(['record', type, id], () =>
    store.findOneOrFail(modelClass, id, { fetch, include })
  );
}

export function useRecordMutation() {
  const store = useStore();
  return useMutation((transformOrOperations: RecordTransformOrOperations) =>
    store.update(transformOrOperations)
  );
}

interface Invalidate {
  records: Set<string>;
  record: Map<string, string>;
}

export function invalidateQueries(store: Store, queryClient: QueryClient) {
  store.on('patch', (operation: RecordOperation) => {
    const { type, id } = operation.record;
    const invalidate: Invalidate = {
      records: new Set(),
      record: new Map(),
    };

    if (operation.op == 'addRecord') {
      invalidate.records.add(type);
      invalidateInverseQueries(store, operation.record, invalidate);
    } else if (operation.op == 'removeRecord') {
      invalidate.records.add(type);
      invalidate.record.set(type, id);
      invalidateInverseQueries(store, operation.record, invalidate);
    } else {
      invalidate.record.set(type, id);
      if (
        operation.op == 'updateRecord' ||
        operation.op == 'replaceAttribute'
      ) {
        invalidateInverseQueries(store, operation.record, invalidate);
      }
    }

    for (const type of invalidate.records) {
      queryClient.invalidateQueries(['records', type]);
    }
    for (const [type, id] of invalidate.record) {
      queryClient.invalidateQueries(['record', type, id]);
    }
  });
}

function invalidateInverseQueries(
  store: Store,
  record: RecordIdentity,
  invalidate: Invalidate
) {
  store.schema.eachRelationship(record.type, (_, { type, inverse }) => {
    if (type && inverse) {
      const types = Array.isArray(type) ? type : [type];
      for (const type of types) {
        invalidate.records.add(type);

        for (const { id } of findInverseRecords(store, type, inverse, record)) {
          invalidate.record.set(type, id);
        }
      }
    }
  });
}

function findInverseRecords(
  store: Store,
  type: string,
  relation: string,
  record: RecordIdentity
) {
  const relationship = store.schema.getRelationship(type, relation);
  switch (relationship?.kind) {
    case 'hasMany':
      return store.cache.query<RecordIdentity[]>((q) =>
        q.findRecords(type).filter({
          kind: 'relatedRecords',
          op: 'some',
          relation,
          records: [record],
        })
      );
    case 'hasOne':
      return store.cache.query<RecordIdentity[]>((q) =>
        q.findRecords(type).filter({
          kind: 'relatedRecord',
          op: 'equal',
          relation,
          record,
        })
      );
    default:
      return [];
  }
}
