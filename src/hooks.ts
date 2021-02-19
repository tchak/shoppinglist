import { createContext, useContext, useEffect } from 'react';
import {
  useQuery,
  useMutation,
  QueryObserverResult,
  QueryClient,
} from 'react-query';
import { RecordTransformOrOperations, RecordOperation } from '@orbit/records';

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

  return useQuery(['records', type, include], () =>
    store.find(modelClass, { include })
  );
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

  return useQuery<T>(['record', type, id, include], () =>
    store.findOneOrFail(modelClass, id, { fetch, include })
  );
}

export function useRecordMutation() {
  const store = useStore();
  return useMutation((transformOrOperations: RecordTransformOrOperations) =>
    store.update(transformOrOperations)
  );
}

export function invalidateQueries(store: Store, queryClient: QueryClient) {
  function invalidateInverseQueries(type: string) {
    store.schema.eachRelationship(type, (_, { type, inverse }) => {
      if (inverse) {
        queryClient.invalidateQueries(['records', type, inverse]);
        queryClient.invalidateQueries(['record', type]);
      }
    });
  }

  store.on('patch', (operation: RecordOperation) => {
    const { type, id } = operation.record;
    if (operation.op == 'addRecord') {
      queryClient.invalidateQueries(['records', type]);
      invalidateInverseQueries(type);
    } else if (operation.op == 'removeRecord') {
      queryClient.invalidateQueries(['records', type]);
      queryClient.invalidateQueries(['record', type, id]);
      invalidateInverseQueries(type);
    } else {
      queryClient.invalidateQueries(['record', type, id]);
      if (
        operation.op == 'updateRecord' ||
        operation.op == 'replaceAttribute'
      ) {
        invalidateInverseQueries(type);
      }
    }
  });
}
