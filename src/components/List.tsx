import React from 'react';
import { useParams } from 'react-router-dom';

import {
  useListFindOne,
  useListChangeTitle,
  useListAddItem,
  useListToggleItem,
  useListRemoveItem,
} from '../store';

import { Loader } from './Loader';

import { ListTitle } from './ListTitle';
import { AddItemCombobox } from './AddItemCombobox';
import { ActiveItemsList, CheckedOffItemsList } from './ItemsList';

export function List() {
  const { id } = useParams();
  const { data } = useListFindOne(id);
  const onChangeTitle = useListChangeTitle(id);
  const onAddItem = useListAddItem(id);
  const onToggleItem = useListToggleItem(id);
  const onRemoveItem = useListRemoveItem(id);

  if (!data) {
    return <Loader />;
  }

  const title = data.title;
  const items = data.items.filter(({ checked }) => !checked);
  const checkedItems = data.items.filter(({ checked }) => checked);

  return (
    <div>
      <ListTitle title={title} onChange={onChangeTitle} />

      <AddItemCombobox onSelect={onAddItem} />

      <ActiveItemsList
        items={items}
        onToggle={onToggleItem}
        onRemove={onRemoveItem}
      />

      <CheckedOffItemsList
        items={checkedItems}
        onToggle={onToggleItem}
        onRemove={onRemoveItem}
      />
    </div>
  );
}

export default List;
