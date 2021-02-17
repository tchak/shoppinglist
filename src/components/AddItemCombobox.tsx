import React, { useState, FormEvent } from 'react';
import {
  Combobox,
  ComboboxInput,
  ComboboxPopover,
  ComboboxList,
  ComboboxOption,
} from '@reach/combobox';
import { matchSorter } from 'match-sorter';
import { useThrottledCallback } from 'use-debounce';
import { HiPlus } from 'react-icons/hi';

import food, { titleize } from '../data/food';

export function AddItemCombobox({
  onSelect,
}: {
  onSelect: (value: string) => void;
}) {
  const [term, setTerm] = useState('');
  const items = useFoodMatch(term);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (term.length >= 2) {
      onSelect(titleize(term));
      setTerm('');
    }
  };

  return (
    <form className="mt-2" onSubmit={onSubmit}>
      <Combobox
        className="flex"
        aria-labelledby="Add Item"
        onSelect={(value) => {
          onSelect(value);
          setTerm('');
        }}
      >
        <HiPlus className="text-4xl text-gray-400" />
        <ComboboxInput
          type="text"
          placeholder="Add Item"
          className="shadow-sm focus:ring-green-500 focus:border-green-500 flex-grow sm:text-sm border-gray-300 rounded-md"
          value={term}
          onChange={({ currentTarget: { value } }) => setTerm(value)}
          onBlur={() => setTerm('')}
        />
        {items && (
          <ComboboxPopover className="origin-top-right absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5">
            <ComboboxList persistSelection className="py-1">
              {items.length > 0 ? (
                items.map((value) => (
                  <ComboboxOption
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                    key={value}
                    value={value}
                  />
                ))
              ) : (
                <ComboboxOption
                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                  value={term}
                />
              )}
            </ComboboxList>
          </ComboboxPopover>
        )}
      </Combobox>
    </form>
  );
}

function useFoodMatch(term: string) {
  const [items, setItems] = useState<null | string[]>(null);
  const match = useThrottledCallback(
    (term: string) =>
      setItems(term.trim() === '' ? null : matchSorter(food, term)),
    100
  );
  requestAnimationFrame(() => match.callback(term));
  return items;
}
