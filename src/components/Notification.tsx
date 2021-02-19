import React from 'react';
import { HiX } from 'react-icons/hi';
import { Alert } from '@reach/alert';

export function Notification({
  isOpen,
  onClose,
  text,
}: {
  isOpen: boolean;
  onClose: () => void;
  text: string;
}) {
  return (
    <div
      className={`fixed inset-0 flex items-end justify-center px-4 py-6 pointer-events-none sm:p-6 sm:items-start sm:justify-end ${
        isOpen ? '' : 'hidden'
      }`}
    >
      <Alert className="max-w-sm w-full bg-white shadow-lg rounded-lg pointer-events-auto ring-1 ring-black ring-opacity-5 overflow-hidden">
        <div className="p-4">
          <div className="flex items-center">
            <div className="w-0 flex-1 flex justify-between">
              <p className="w-0 flex-1 text-sm font-medium text-gray-900">
                {text}
              </p>
            </div>
            <div className="ml-4 flex-shrink-0 flex">
              <button
                type="button"
                onClick={() => onClose()}
                className="bg-white rounded-md inline-flex text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
              >
                <span className="sr-only">Close</span>
                <HiX className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </Alert>
    </div>
  );
}

/* <Transition
className="fixed inset-0 flex items-end justify-center px-4 py-6 pointer-events-none sm:p-6 sm:items-start sm:justify-end"
show={isOpen}
enter="transform ease-out duration-300 transition"
enterFrom="translate-y-2 opacity-0 sm:translate-y-0 sm:translate-x-2"
enterTo="translate-y-0 opacity-100 sm:translate-x-0"
leave="transition ease-in duration-100"
leaveFrom="opacity-100"
leaveTo="opacity-0"
> */
