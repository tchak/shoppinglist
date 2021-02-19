import React from 'react';
import { NavLink } from 'react-router-dom';
import { HiTrash } from 'react-icons/hi';

import { List } from '../models';
import { useRecordsQuery, useRecordMutation } from '../hooks';

import { Loader } from './Loader';

function sortBy<T>(array: T[], key: keyof T) {
  return [...array].sort((a, b) => (b[key] as any) - (a[key] as any));
}

export function Landing() {
  const { data } = useRecordsQuery(List, { include: ['items'] });
  const mutation = useRecordMutation();

  if (!data) {
    return <Loader />;
  }

  return (
    <ul className="divide-y divide-gray-200">
      {sortBy(data, 'createdDate').map(({ id, title, identity, items }) => (
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
            onClick={() =>
              mutation.mutate((t) => [
                ...items.map(({ identity }) => t.removeRecord(identity)),
                t.removeRecord(identity),
              ])
            }
          >
            <HiTrash className="hover:text-red-500 text-2xl" />
          </button>
        </li>
      ))}
    </ul>
  );
}

export default Landing;
