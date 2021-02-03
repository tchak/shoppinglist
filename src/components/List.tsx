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
  useListFindOne,
  useListChangeTitle,
  useListAddItem,
  useListToggleItem,
  useListRemoveItem,
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
  const activeItems = data.items.filter(({ checked }) => !checked);
  const doneItems = data.items.filter(({ checked }) => checked);
  return (
    <div>
      <h3>
        <EditableTitle title={data.title} onChange={onChangeTitle} />
      </h3>
      <div className="mt-2">
        <AddItemCombobox onSelect={onAddItem} />
      </div>
      <ul className="divide-y divide-gray-200">
        {activeItems.map(({ id, title }) => (
          <li key={id} className="group py-4 flex">
            <div className="ml-3 flex-grow">
              <p className="text-sm font-medium text-gray-900">{title}</p>
              <p className="text-sm text-gray-500">note</p>
            </div>
            <button
              className="ml-3 opacity-0 group-hover:opacity-100 transition duration-200 ease-in-out"
              type="button"
              data-list-item-control
              onClick={() => onToggleItem(id)}
            >
              <HiCheck className="hover:text-green-500 text-2xl" />
            </button>
            <button
              className="ml-3 opacity-0 group-hover:opacity-100 transition duration-200 ease-in-out"
              type="button"
              data-list-item-control
              onClick={() => onRemoveItem(id)}
            >
              <HiTrash className="hover:text-red-500 text-2xl" />
            </button>
          </li>
        ))}
      </ul>
      {doneItems.length ? <p>{doneItems.length} checked off</p> : null}
      <ul className="divide-y divide-gray-200">
        {doneItems.map(({ id, title }) => (
          <li key={id} className="group py-4 flex">
            <div className="ml-3 flex-grow">
              <p className="text-sm font-medium text-gray-900 line-through">
                {title}
              </p>
              <p className="text-sm text-gray-500">note</p>
            </div>
            <button
              className="ml-3 opacity-0 group-hover:opacity-100 transition duration-200 ease-in-out"
              type="button"
              data-list-item-control
              onClick={() => onToggleItem(id)}
            >
              <HiPlus className="hover:text-green-500 text-2xl" />
            </button>
            <button
              className="ml-3 opacity-0 group-hover:opacity-100 transition duration-200 ease-in-out"
              type="button"
              data-list-item-control
              onClick={() => onRemoveItem(id)}
            >
              <HiTrash className="hover:text-red-500 text-2xl" />
            </button>
          </li>
        ))}
      </ul>
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
      <div>
        <label htmlFor="list-title" className="sr-only">
          Title
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
      </div>
    );
  }

  return (
    <div>
      <h3 className="group flex">
        <div
          className="flex items-center flex-grow text-lg font-semibold"
          onDoubleClick={() => setIsEditing(true)}
        >
          {title}
        </div>
        <button
          className="px-3 opacity-0 group-hover:opacity-100 transition duration-200 ease-in-out"
          onClick={() => setIsEditing(true)}
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
