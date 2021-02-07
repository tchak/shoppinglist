import { useMemo, createContext, useContext, useEffect } from 'react';
import {
  useQuery,
  useMutation,
  useQueryClient,
  QueryObserverResult,
  UseMutationResult,
} from 'react-query';

import { Store } from './store';
import { ID } from './operations';
import { Entity, Attributes, Identifier } from './entity';

export type { ID };

export interface List {
  id: ID;
  title: string;
  items: Item[];
}

export interface Item {
  id: ID;
  title: string;
  checked: boolean;
}

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

export function useEntitiesQuery<T = Entity>(
  type: string,
  options?: { include?: string[] }
): QueryObserverResult<T[]> {
  const store = useStore();
  return useQuery<T[]>([type, 'all', options], () =>
    store.find<T>(type, options)
  );
}

export function useEntityQuery<T = Entity>(
  type: string,
  id: ID,
  options?: { include?: string[]; fetch?: boolean; subscribe?: boolean }
): QueryObserverResult<T> {
  const queryClient = useQueryClient();
  const store = useStore();
  useEffect(() => {
    if (options?.subscribe) {
      return store.subscribe(type, id, { include: options?.include }, () => {
        queryClient.invalidateQueries([type, id]);
      });
    }
  });
  return useQuery<T>([type, id, options], () =>
    store.findOneOrFail<T>({ type, id }, options)
  );
}

enum MutationOp {
  add,
  update,
  remove,
  touch,
  addTo,
  removeFrom,
}

interface AddMutation {
  op: MutationOp.add;
  attributes: Attributes;
}

interface UpdateMutation {
  op: MutationOp.update;
  id?: ID;
  attributes: Attributes;
}

interface RemoveMutation {
  op: MutationOp.remove;
  id?: ID;
}

interface AddToMutation {
  op: MutationOp.addTo;
  id?: ID;
  field: string;
  data: {
    type: string;
    attributes: Attributes;
  };
}

interface RemoveFromMutation {
  op: MutationOp.removeFrom;
  id?: ID;
  field: string;
  data: Identifier;
}

type Mutation =
  | AddMutation
  | UpdateMutation
  | RemoveMutation
  | AddToMutation
  | RemoveFromMutation;

class StoreMutation {
  #store: Store;
  #type: string;
  #id?: ID;

  constructor(store: Store, type: string, id?: ID) {
    this.#store = store;
    this.#type = type;
    this.#id = id;
  }

  run(mutation: Mutation): Promise<Identifier> {
    switch (mutation.op) {
      case MutationOp.add:
        return this[MutationOp.add](mutation);
      case MutationOp.update:
        return this[MutationOp.update](mutation);
      case MutationOp.remove:
        return this[MutationOp.remove](mutation);
      case MutationOp.addTo:
        return this[MutationOp.addTo](mutation);
      case MutationOp.removeFrom:
        return this[MutationOp.removeFrom](mutation);
    }
  }

  async [MutationOp.add](mutation: AddMutation): Promise<Identifier> {
    const id = await this.#store.add(this.#type, mutation.attributes);
    return this.identifier(id);
  }

  async [MutationOp.update](mutation: UpdateMutation): Promise<Identifier> {
    const identifier = this.identifier(mutation.id);
    await this.#store.update(identifier, mutation.attributes);
    return identifier;
  }

  async [MutationOp.remove](mutation: RemoveMutation): Promise<Identifier> {
    const identifier = this.identifier(mutation.id);
    await this.#store.remove(identifier);
    return identifier;
  }

  async [MutationOp.addTo](mutation: AddToMutation): Promise<Identifier> {
    const identifier = this.identifier(mutation.id);
    await this.#store.addToHasManyEntities(identifier, mutation.field, {
      type: mutation.data.type,
      id: await this.#store.add(mutation.data.type, mutation.data.attributes),
    });
    return identifier;
  }

  async [MutationOp.removeFrom](
    mutation: RemoveFromMutation
  ): Promise<Identifier> {
    const identifier = this.identifier(mutation.id);
    await this.#store.removeFromHasManyEntities(
      identifier,
      mutation.field,
      mutation.data
    );
    return identifier;
  }

  private identifier(id?: ID) {
    if (id) {
      return { type: this.#type, id };
    } else if (this.#id) {
      return { type: this.#type, id: this.#id };
    }
    throw new Error('ID is required');
  }
}

class MutationResult {
  #mutation: UseMutationResult<Identifier, void, Mutation>;

  constructor(mutation: UseMutationResult<Identifier, void, Mutation>) {
    this.#mutation = mutation;
  }

  add(attributes: Attributes) {
    return this.#mutation.mutate({
      op: MutationOp.add,
      attributes,
    });
  }

  update(attributes: Attributes, id?: ID) {
    return this.#mutation.mutate({
      op: MutationOp.update,
      id,
      attributes,
    });
  }

  remove(id?: ID) {
    return this.#mutation.mutate({
      op: MutationOp.remove,
      id,
    });
  }

  hasMany(name: string, id?: ID) {
    const mutation = this.#mutation;
    return {
      add(type: string, attributes: Attributes) {
        return mutation.mutate({
          op: MutationOp.addTo,
          field: name,
          data: { type, attributes },
        });
      },

      remove(data: Identifier) {
        return mutation.mutate({
          op: MutationOp.removeFrom,
          id,
          field: name,
          data: data,
        });
      },
    };
  }
}

export function useEntityMutation(type: string, id?: ID) {
  const queryClient = useQueryClient();
  const store = useStore();
  const storeMutation = useMemo(() => new StoreMutation(store, type, id), [
    type,
    id,
  ]);
  const mutation = useMutation<Identifier, void, Mutation>(
    (mutation) => storeMutation.run(mutation),
    {
      onSuccess({ type, id }) {
        queryClient.invalidateQueries([type, 'all']);
        queryClient.invalidateQueries([type, id]);
      },
    }
  );
  return useMemo(() => new MutationResult(mutation), [mutation]);
}
