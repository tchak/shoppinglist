import React, { useState } from 'react';
import { DialogOverlay, DialogContent } from '@reach/dialog';

import { Item } from '../models';
import { useRecordMutation } from '../hooks';

export function ItemDetailDialog({
  item,
  onDismiss,
}: {
  item: Item;
  onDismiss: () => void;
}) {
  const [title] = useState(item.title);
  const [note, setNote] = useState(item.note);
  const mutation = useRecordMutation();

  const onSave = () => {
    const attributes: [string, string][] = [];
    if (item.title != title) {
      attributes.push(['title', title]);
    }
    if (item.note != note) {
      attributes.push(['note', note]);
    }
    console.log(attributes);
    mutation.mutate((t) =>
      attributes.map(([attribute, value]) =>
        t.replaceAttribute(item.identity, attribute, value)
      )
    );
    onDismiss();
  };

  return (
    <DialogOverlay
      className="fixed z-10 inset-0 overflow-y-auto"
      onDismiss={onDismiss}
    >
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
        </div>

        <span
          className="hidden sm:inline-block sm:align-middle sm:h-screen"
          aria-hidden="true"
        >
          &#8203;
        </span>

        <DialogContent
          className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-sm sm:w-full sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-headline"
        >
          <div>
            <div className="mt-3 text-center sm:mt-5">
              <h3
                className="text-lg leading-6 font-medium text-gray-900"
                id="modal-headline"
              >
                {title}
              </h3>
              <div className="mt-2">
                <textarea
                  id="about"
                  name="about"
                  rows={3}
                  className="max-w-lg shadow-sm block w-full focus:ring-green-500 focus:border-green-500 sm:text-sm border-gray-300 rounded-md"
                  onChange={({ currentTarget: { value } }) => setNote(value)}
                  value={note}
                  placeholder="Add more information about the item"
                ></textarea>
              </div>
            </div>
          </div>
          <div className="mt-5 sm:mt-6 sm:grid sm:grid-cols-2 sm:gap-3 sm:grid-flow-row-dense">
            <button
              type="button"
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-green-600 text-base font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 sm:col-start-2 sm:text-sm"
              onClick={onSave}
            >
              OK
            </button>
            <button
              type="button"
              className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 sm:mt-0 sm:col-start-1 sm:text-sm"
              onClick={onDismiss}
            >
              Cancel
            </button>
          </div>
        </DialogContent>
      </div>
    </DialogOverlay>
  );
}
