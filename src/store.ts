import localforage from 'localforage';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { v4 as uuid } from 'uuid';

import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';

localforage.config({
  version: 1,
  name: 'shoppinglist',
  storeName: 'lists',
});

export interface List {
  id: string;
  title: string;
}

export interface Item {
  title: string;
  checked: boolean;
}

export function useListFindAll() {
  return useQuery<List[]>('lists', getAll);
}

export function useListFindOne(id: string) {
  return useQuery<Y.Doc>(['list', id], () => getYDoc(id));
}

export function useListCreate(defaultTitle: string) {
  const queryClient = useQueryClient();
  const mutation = useMutation<{ id: string }>(() => createList(defaultTitle), {
    onSuccess() {
      queryClient.invalidateQueries('lists');
    },
  });
  return () => mutation.mutate();
}

export function useListDestroy() {
  const queryClient = useQueryClient();
  const mutation = useMutation<{ id: string }, void, string>(
    (id) => destroyList(id),
    {
      onSuccess() {
        queryClient.invalidateQueries('lists');
      },
    }
  );
  return (id: string) => mutation.mutate(id);
}

export function useListChangeTitle(id: string) {
  const queryClient = useQueryClient();
  const mutation = useMutation<{ id: string }, void, string>(
    (title) => updateList({ id, title }),
    {
      onSuccess() {
        queryClient.invalidateQueries('lists');
      },
    }
  );
  return (title: string) => mutation.mutate(title);
}

async function getOne(id: string) {
  const list = await localforage.getItem<List>(id);
  if (list) {
    list.id = id;
    return list;
  }
  throw new Error('Not Found');
}

async function getYDoc(id: string) {
  const { title } = await getOne(id);
  const [doc] = await findOrCreatePersistedYDoc(id);
  const text = doc.getText('title');
  if (text.length === 0) {
    text.insert(0, title);
  }
  return doc;
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

async function updateList({ id, title }: List) {
  await localforage.setItem(id, { title });
  const [doc] = await findOrCreatePersistedYDoc(id);
  const text = doc.getText('title');
  text.delete(0, text.length);
  text.insert(0, title);
  return { id };
}

async function destroyList(id: string) {
  await localforage.removeItem(id);
  await destroyPersistedYDoc(id);
  return { id };
}

async function findOrCreatePersistedYDoc(
  id: string
): Promise<[Y.Doc, IndexeddbPersistence]> {
  let doc = docs.get(id);
  if (!doc) {
    doc = new Y.Doc();
    docs.set(id, doc);
  }

  let index = storage.get(doc);
  if (!index) {
    index = new IndexeddbPersistence(id, doc);
    storage.set(doc, index);
    await index.whenSynced;
  }

  return [doc, index];
}

async function destroyPersistedYDoc(id: string) {
  const [, index] = await findOrCreatePersistedYDoc(id);
  await index.clearData();
  await disconnectPersistedYDoc(id);
}

async function disconnectPersistedYDoc(id: string) {
  const [doc, index] = await findOrCreatePersistedYDoc(id);
  index.destroy();
  doc.destroy();
  docs.delete(id);
  storage.delete(doc);
}

const docs = new Map<string, Y.Doc>();
const storage = new WeakMap<Y.Doc, IndexeddbPersistence>();
