import React from 'react';
import { NavLink } from 'react-router-dom';
import { HiTrash } from 'react-icons/hi';

import { useListFindAll, useListDestroy } from '../store';

export function Landing() {
  const { data } = useListFindAll();
  const onDestroy = useListDestroy();

  return (
    <ul className="divide-y divide-gray-200">
      {data?.map(({ id, title }) => (
        <li key={id} className="group py-4 flex">
          <div className="ml-3 flex-grow">
            <p className="text-sm font-medium text-gray-900">
              <NavLink to={`l/${id}`}>{title}</NavLink>
            </p>
          </div>
          <button
            className="px-3 opacity-0 group-hover:opacity-100 transition duration-200 ease-in-out"
            type="button"
            data-list-item-control
            onClick={() => onDestroy(id)}
          >
            <HiTrash className="hover:text-red-500 text-2xl" />
          </button>
        </li>
      ))}
    </ul>
  );
}
