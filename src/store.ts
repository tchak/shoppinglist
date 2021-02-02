import localforage from 'localforage';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { v4 as uuid } from 'uuid';

localforage.config({
  version: 1,
  name: 'shoppinglist',
  storeName: 'lists',
});

export interface List {
  id: string;
  title: string;
}

export function useListFindAll() {
  return useQuery<List[]>('lists', getAll);
}

export function useListFindOne(id: string) {
  return useQuery<List>(['list', id], () => getOne(id));
}

export function useListCreate(defaultTitle: string) {
  const queryClient = useQueryClient();

  return useMutation<{ id: string }>(() => createList(defaultTitle), {
    onSuccess() {
      queryClient.invalidateQueries('lists');
    },
  });
}

export function useListDestroy() {
  const queryClient = useQueryClient();

  return useMutation<{ id: string }, void, string>((id) => destroyList(id), {
    onSuccess({ id }) {
      queryClient.invalidateQueries('lists');
      queryClient.invalidateQueries(['list', id]);
    },
  });
}

async function getOne(id: string) {
  const list = await localforage.getItem<List>(id);
  if (list) {
    list.id = id;
    return list;
  }
  throw new Error('Not Found');
}

async function getAll() {
  const ids = await localforage.keys();
  return Promise.all(ids.map((id) => getOne(id)));
}

async function createList(title: string) {
  const id = uuid();
  await localforage.setItem(id, {
    title,
  });
  return { id };
}

async function destroyList(id: string) {
  await localforage.removeItem(id);
  return { id };
}
