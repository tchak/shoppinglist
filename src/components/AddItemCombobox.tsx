import React, { useState } from 'react';
import {
  Combobox,
  ComboboxInput,
  ComboboxPopover,
  ComboboxList,
  ComboboxOption,
} from '@reach/combobox';

const items = ['Apple', 'Banana', 'Orange', 'Pineapple', 'Kiwi'];

export function AddItemCombobox({
  onSelect,
}: {
  onSelect: (value: string) => void;
}) {
  const [term, setTerm] = useState('');
  return (
    <div className="mt-2">
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
