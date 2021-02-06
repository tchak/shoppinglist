import React, { useCallback } from 'react';
import { useParams } from 'react-router-dom';

import { List, useEntityQuery, useEntityMutation } from '../hooks';
import { Loader } from './Loader';

import { ListTitle } from './ListTitle';
import { AddItemCombobox } from './AddItemCombobox';
import { ActiveItemsList, CheckedOffItemsList } from './ItemsList';

export function ListComponent() {
  const { id } = useParams();
  const { data, isLoading } = useEntityQuery<List>('list', id, {
    include: ['items'],
    fetch: true,
  });
  const listMutation = useEntityMutation('list', id);
  const itemMutation = useEntityMutation('item');

  const onToggle = useCallback(
    (id, checked) => itemMutation.update({ checked }, id),
    [itemMutation]
  );
  const onRemove = useCallback(
    (id: string) => {
      listMutation.hasMany('items').remove({ type: 'item', id });
      itemMutation.remove(id);
    },
    [listMutation, itemMutation]
  );

  if (isLoading) {
    return <Loader />;
  }

  if (!data) {
    return <>Error</>;
  }

  const title = data.title;
  const items = (data.items ?? []).filter(({ checked }) => !checked);
  const checkedItems = (data.items ?? []).filter(({ checked }) => checked);

  return (
    <div>
      <ListTitle
        title={title}
        onChange={(title) => listMutation.update({ title })}
      />

      <AddItemCombobox
        onSelect={(title) =>
          listMutation.hasMany('items').add('item', { title })
        }
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
