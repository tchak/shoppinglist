import React from 'react';
import { NavLink } from 'react-router-dom';
import { HiClipboardCheck } from 'react-icons/hi';

export function Header() {
  return (
    <div className="flex items-center justify-between flex-wrap sm:flex-nowrap">
      <NavLink to="/">
        <HiClipboardCheck className="text-gray-900 text-4xl" />
      </NavLink>
      <div className="ml-4 flex-shrink-0">
        <button
          type="button"
          className="relative inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
        >
          Create new list
        </button>
      </div>
    </div>
  );
}
