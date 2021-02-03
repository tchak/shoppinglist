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

type ID = string;

interface List {
  id: ID;
  title: string;
  items: Item[];
}

interface Item {
  id: ID;
  title: string;
  checked: boolean;
}

export function useListFindAll() {
  return useQuery<List[]>('lists', getAll);
}

export function useListFindOne(id: ID) {
  return useQuery<List>(['list', id], () => getYDoc(id));
}

export function useListCreate(defaultTitle: string) {
  const queryClient = useQueryClient();
  const mutation = useMutation<{ id: ID }>(() => createList(defaultTitle), {
    onSuccess() {
      queryClient.invalidateQueries('lists');
    },
  });
  return () => mutation.mutate();
}

export function useListDestroy() {
  const queryClient = useQueryClient();
  const mutation = useMutation<{ id: ID }, void, string>(
    (id) => destroyList(id),
    {
      onSuccess() {
        queryClient.invalidateQueries('lists');
      },
    }
  );
  return (id: string) => mutation.mutate(id);
}

export function useListChangeTitle(id: ID) {
  const queryClient = useQueryClient();
  const mutation = useMutation<{ id: ID }, void, string>(
    (title) => updateListTitle(id, title),
    {
      onSuccess() {
        queryClient.invalidateQueries('lists');
      },
    }
  );
  return (title: string) => mutation.mutate(title);
}

export function useListAddItem(id: ID) {
  const queryClient = useQueryClient();
  const mutation = useMutation<{ id: ID }, void, string>(
    (title) => addListItem(id, title),
    {
      onSuccess() {
        queryClient.invalidateQueries(['list', id]);
      },
    }
  );
  return (title: string) => mutation.mutate(title);
}

export function useListToggleItem(listId: ID) {
  const queryClient = useQueryClient();
  const mutation = useMutation<{ id: ID }, void, string>(
    (id) => toggleListItem(listId, id),
    {
      onSuccess() {
        queryClient.invalidateQueries(['list', listId]);
      },
    }
  );
  return (id: ID) => mutation.mutate(id);
}

export function useListRemoveItem(listId: ID) {
  const queryClient = useQueryClient();
  const mutation = useMutation<{ id: ID }, void, string>(
    (id) => removeListItem(listId, id),
    {
      onSuccess() {
        queryClient.invalidateQueries(['list', listId]);
      },
    }
  );
  return (id: ID) => mutation.mutate(id);
}

async function getOne(id: ID) {
  const list = await localforage.getItem<{ title: string }>(id);
  if (list) {
    return { id, items: [], ...list };
  }
  throw new Error('Not Found');
}

async function getYDoc(id: ID) {
  const { title } = await getOne(id);
  const [doc] = await findOrCreatePersistedYDoc(id);
  const text = doc.getText('title');
  if (text.length === 0) {
    text.insert(0, title);
  }
  return docToJSON(id, doc);
}

function docToJSON(id: ID, doc: Y.Doc) {
  const title = doc.getText('title').toString();
  const items = doc.getMap('items').toJSON() as Record<ID, string>;
  const checked = doc.getMap('checked');
  return {
    id,
    title,
    items: Object.entries(items).map(([id, title]) => ({
      id,
      title,
      checked: !!checked.get(id),
    })),
  };
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

async function updateListTitle(id: ID, title: string) {
  await localforage.setItem(id, { title });
  const [doc] = await findOrCreatePersistedYDoc(id);
  const text = doc.getText('title');
  text.delete(0, text.length);
  text.insert(0, title);
  return { id };
}

async function addListItem(listId: ID, title: string) {
  const id = uuid();
  const [doc] = await findOrCreatePersistedYDoc(listId);
  doc.getMap('items').set(id, title);
  return { id };
}

async function toggleListItem(listId: ID, id: ID) {
  const [doc] = await findOrCreatePersistedYDoc(listId);
  const checked = doc.getMap('checked').get(id);
  doc.getMap('checked').set(id, !checked);
  return { id };
}

async function removeListItem(listId: ID, id: ID) {
  const [doc] = await findOrCreatePersistedYDoc(listId);
  doc.getMap('items').delete(id);
  doc.getMap('checked').delete(id);
  return { id };
}

async function destroyList(id: ID) {
  await localforage.removeItem(id);
  await destroyPersistedYDoc(id);
  return { id };
}

async function findOrCreatePersistedYDoc(
  id: ID
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

async function destroyPersistedYDoc(id: ID) {
  const [, index] = await findOrCreatePersistedYDoc(id);
  await index.clearData();
  await disconnectPersistedYDoc(id);
}

async function disconnectPersistedYDoc(id: ID) {
  const [doc, index] = await findOrCreatePersistedYDoc(id);
  index.destroy();
  doc.destroy();
  docs.delete(id);
  storage.delete(doc);
}

const docs = new Map<ID, Y.Doc>();
const storage = new WeakMap<Y.Doc, IndexeddbPersistence>();
