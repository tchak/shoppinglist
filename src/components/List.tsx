import React, { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { HiPencil, HiTrash, HiCheck, HiPlus } from 'react-icons/hi';
import { isHotkey } from 'is-hotkey';
import { useDebouncedCallback } from 'use-debounce';
import {
  Combobox,
  ComboboxInput,
  ComboboxPopover,
  ComboboxList,
  ComboboxOption,
} from '@reach/combobox';
import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
} from '@reach/disclosure';

import {
  useListFindOne,
  useListChangeTitle,
  useListAddItem,
  useListToggleItem,
  useListRemoveItem,
  ID,
  Item,
} from '../store';

export function List() {
  const { id } = useParams();
  const { data } = useListFindOne(id);
  const onChangeTitle = useListChangeTitle(id);
  const onAddItem = useListAddItem(id);
  const onToggleItem = useListToggleItem(id);
  const onRemoveItem = useListRemoveItem(id);

  if (!data) {
    return <>Loading...</>;
  }

  const title = data.title;
  const items = data.items.filter(({ checked }) => !checked);
  const checkedItems = data.items.filter(({ checked }) => checked);

  return (
    <div>
      <EditableTitle title={title} onChange={onChangeTitle} />

      <div className="mt-2">
        <AddItemCombobox onSelect={onAddItem} />
      </div>

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

const isEnterKey = isHotkey('enter');
const isEscKey = isHotkey('esc');

function EditableTitle({
  title,
  onChange,
}: {
  title: string;
  onChange: (title: string) => void;
}) {
  const [value, setValue] = useState(title);
  const debounced = useDebouncedCallback((value) => onChange(value), 500);
  const [isEditing, setIsEditing] = useState(false);
  const open = () => setIsEditing(true);
  const close = useCallback(
    (value: string) => {
      setIsEditing(false);
      onChange(value);
      setValue(value);
    },
    [onChange]
  );

  if (isEditing) {
    return (
      <h3>
        <label htmlFor="list-title" className="sr-only">
          List title
        </label>
        <input
          id="list-title"
          name="list-title"
          type="text"
          className="shadow-sm focus:ring-green-500 focus:border-green-500 block w-full sm:text-sm border-gray-300 rounded-md"
          value={value}
          autoFocus={true}
          onChange={({ currentTarget: { value } }) => {
            debounced.callback(value);
            setValue(value);
          }}
          onBlur={({ currentTarget: { value } }) => close(value)}
          onKeyDown={({ nativeEvent, currentTarget: { value } }) => {
            if (isEnterKey(nativeEvent) || isEscKey(nativeEvent)) {
              close(value);
            }
          }}
        />
      </h3>
    );
  }

  return (
    <div>
      <h3 className="group flex">
        <div
          className="flex items-center flex-grow text-lg font-semibold"
          onDoubleClick={open}
        >
          {title}
        </div>
        <button
          className="px-3 opacity-0 group-hover:opacity-100 transition duration-200 ease-in-out"
          onClick={open}
        >
          <HiPencil className="hover:text-green-500 text-2xl" />
        </button>
      </h3>
    </div>
  );
}

const items = ['Apple', 'Banana', 'Orange', 'Pineapple', 'Kiwi'];

function AddItemCombobox({ onSelect }: { onSelect: (value: string) => void }) {
  const [term, setTerm] = useState('');
  return (
    <div>
      <Combobox
        aria-labelledby="Add Item"
        onSelect={(value) => {
          onSelect(value);
          setTerm('');
        }}
      >
        <ComboboxInput
          type="text"
          placeholder="Add Item"
          className="shadow-sm focus:ring-green-500 focus:border-green-500 block w-full sm:text-sm border-gray-300 rounded-md"
          value={term}
          onChange={({ currentTarget: { value } }) => setTerm(value)}
        />
        <ComboboxPopover className="origin-top-right absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5">
          <ComboboxList persistSelection className="py-1">
            {items.map((value) => (
              <ComboboxOption
                className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                key={value}
                value={value}
              />
            ))}
          </ComboboxList>
        </ComboboxPopover>
      </Combobox>
    </div>
  );
}

interface ListItemProps {
  onToggle: (id: ID) => void;
  onRemove: (id: ID) => void;
}

function ActiveItemsList({
  items,
  ...props
}: {
  items: Item[];
} & ListItemProps) {
  return (
    <ul className="divide-y divide-gray-200">
      {items.map((item) => (
        <ListItem key={item.id} {...item} {...props} />
      ))}
    </ul>
  );
}

function CheckedOffItemsList({
  items,
  ...props
}: {
  items: Item[];
} & ListItemProps) {
  if (items.length === 0) {
    return null;
  }
  return (
    <Disclosure>
      <DisclosureButton>{items.length} checked off</DisclosureButton>
      <DisclosurePanel as="ul" className="divide-y divide-gray-200">
        {items.map((item) => (
          <ListItem key={item.id} {...item} {...props} />
        ))}
      </DisclosurePanel>
    </Disclosure>
  );
}

function ListItem({
  id,
  title,
  checked,
  onToggle,
  onRemove,
}: Item & ListItemProps) {
  const Icon = checked ? HiPlus : HiCheck;

  return (
    <li className="group py-4 flex">
      <div className="ml-3 flex-grow">
        <p
          className={`text-sm font-medium text-gray-900 ${
            checked ? 'line-through' : ''
          }`}
        >
          {title}
        </p>
        <p className="text-sm text-gray-500">note</p>
      </div>

      <button
        className="ml-3 opacity-0 group-hover:opacity-100 transition duration-200 ease-in-out"
        type="button"
        onClick={() => onToggle(id)}
      >
        <Icon className="hover:text-green-500 text-2xl" />
      </button>
      <button
        className="ml-3 opacity-0 group-hover:opacity-100 transition duration-200 ease-in-out"
        type="button"
        onClick={() => onRemove(id)}
      >
        <HiTrash className="hover:text-red-500 text-2xl" />
      </button>
    </li>
  );
}

export default List;
