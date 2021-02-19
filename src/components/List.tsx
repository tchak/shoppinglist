import React from 'react';
import { useParams } from 'react-router-dom';
import { v4 as uuid } from 'uuid';

import { List } from '../models';
import { useRecordQuery, useRecordMutation } from '../hooks';
import { Loader } from './Loader';

import { ListTitle } from './ListTitle';
import { AddItemCombobox } from './AddItemCombobox';
import { ActiveItemsList, CheckedOffItemsList } from './ItemsList';

function sortBy<T>(array: T[], key: keyof T) {
  return [...array].sort((a, b) => (b[key] as any) - (a[key] as any));
}

export function ListComponent() {
  const { id } = useParams();
  const { data: list, isLoading } = useRecordQuery(List, id, {
    include: ['items'],
    fetch: true,
    subscribe: true,
  });
  const mutation = useRecordMutation();

  if (isLoading) {
    return <Loader />;
  }

  if (!list) {
    return <>Error</>;
  }

  const onToggle = (id: string, checked: boolean) => {
    const item = { type: 'item', id };
    mutation.mutate((t) => t.replaceAttribute(item, 'checked', checked));
  };
  const onRemove = (id: string) => {
    const item = { type: 'item', id };
    mutation.mutate((t) => [
      t.removeFromRelatedRecords(list.identity, 'items', item),
      t.removeRecord(item),
    ]);
  };

  const title = list.title;
  const sortedItems = sortBy(list.items, 'createdDate');
  const items = sortedItems.filter(({ checked }) => !checked);
  const checkedItems = sortedItems.filter(({ checked }) => checked);

  return (
    <div>
      <ListTitle
        title={title}
        onChange={(title) =>
          mutation.mutate((t) =>
            t.replaceAttribute(list.identity, 'title', title)
          )
        }
      />

      <AddItemCombobox
        onSelect={(title) => {
          const item = { type: 'item', id: uuid() };
          mutation.mutate((t) => [
            t.addRecord({ ...item, attributes: { title } }),
            t.addToRelatedRecords(list.identity, 'items', item),
          ]);
        }}
      />

      <ActiveItemsList items={items} onToggle={onToggle} onRemove={onRemove} />

      <CheckedOffItemsList
        items={checkedItems}
        onToggle={onToggle}
        onRemove={onRemove}
      />
    </div>
  );
}

export default ListComponent;
