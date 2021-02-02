import React, { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { HiPencil } from 'react-icons/hi';
import { isHotkey } from 'is-hotkey';
import { useDebouncedCallback } from 'use-debounce';

import { useListFindOne, useListChangeTitle } from '../store';

export function List() {
  const { id } = useParams();
  const { data } = useListFindOne(id);
  const onChange = useListChangeTitle(id);

  if (!data) {
    return <>Loading...</>;
  }
  const title = data.getText('title');
  return (
    <h3>
      <EditableTitle title={title.toString()} onChange={onChange} />
    </h3>
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
      <h3 className="flex">
        <div
          className="flex items-center flex-grow text-lg font-semibold"
          onDoubleClick={() => setIsEditing(true)}
        >
          {title}
        </div>
        <button
          className="-ml-px relative inline-flex items-center space-x-2 px-4 py-2 border border-gray-300 text-sm font-medium rounded-r-md text-gray-700 bg-gray-50 hover:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500"
          onClick={() => setIsEditing(true)}
        >
          <HiPencil className="text-lg" />
        </button>
      </h3>
    </div>
  );
}
