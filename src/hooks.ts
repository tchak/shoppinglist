import { useMemo } from 'react';
import {
  useQuery,
  useMutation,
  useQueryClient,
  QueryObserverResult,
  UseMutationResult,
  QueryClient,
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

const store = new Store({ name: 'shoppinglist' });

export function useEntitiesQuery<T = Entity>(
  type: string
): QueryObserverResult<T[]> {
  return useQuery<T[]>(type, () => store.find<T>(type));
}

export function useEntityQuery<T = Entity>(
  type: string,
  id: ID
): QueryObserverResult<T> {
  return useQuery<T>([type, id], () => store.findOneOrFail<T>({ type, id }));
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
  #type: string;
  #id?: ID;

  constructor(type: string, id?: ID) {
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
    const id = await store.add(this.#type, mutation.attributes);
    return this.identifier(id);
  }

  async [MutationOp.update](mutation: UpdateMutation): Promise<Identifier> {
    const identifier = this.identifier(mutation.id);
    await store.update(identifier, mutation.attributes);
    return identifier;
  }

  async [MutationOp.remove](mutation: RemoveMutation): Promise<Identifier> {
    const identifier = this.identifier(mutation.id);
    await store.remove(identifier);
    return identifier;
  }

  async [MutationOp.addTo](mutation: AddToMutation): Promise<Identifier> {
    const identifier = this.identifier(mutation.id);
    await store.addToHasManyEntities(identifier, mutation.field, {
      type: mutation.data.type,
      id: await store.add(mutation.data.type, mutation.data.attributes),
    });
    return identifier;
  }

  async [MutationOp.removeFrom](
    mutation: RemoveFromMutation
  ): Promise<Identifier> {
    const identifier = this.identifier(mutation.id);
    await store.removeFromHasManyEntities(
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
  queryClient: QueryClient;

  constructor(
    mutation: UseMutationResult<Identifier, void, Mutation>,
    queryClient: QueryClient
  ) {
    this.#mutation = mutation;
    this.queryClient = queryClient;
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
  const storeMutation = useMemo(() => new StoreMutation(type, id), [type, id]);
  const mutation = useMutation<Identifier, void, Mutation>(
    (mutation) => storeMutation.run(mutation),
    {
      onSuccess({ type, id }) {
        queryClient.invalidateQueries(type);
        queryClient.invalidateQueries([type, id]);
      },
    }
  );
  return useMemo(() => new MutationResult(mutation, queryClient), [mutation]);
}
