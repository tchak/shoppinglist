import React, { useCallback, useState } from 'react';
import { HiPencil } from 'react-icons/hi';
import { isHotkey } from 'is-hotkey';

const isEnterKey = isHotkey('enter');
const isEscKey = isHotkey('esc');

export function ListTitle({
  title,
  onChange,
}: {
  title: string;
  onChange: (title: string) => void;
}) {
  const [value, setValue] = useState(title);
  const [isEditing, setIsEditing] = useState(false);
  const open = () => setIsEditing(true);
  const close = useCallback(
    (value: string) => {
      setIsEditing(false);
      onChange(value);
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
