import React from 'react';
import { NavLink } from 'react-router-dom';
import { HiXCircle } from 'react-icons/hi';

import { useListFindAll, useListDestroy } from '../store';

export function Landing() {
  const { data } = useListFindAll();
  const onDestroy = useListDestroy();

  return (
    <ul>
      {data?.map(({ id, title }) => (
        <li key={id}>
          <NavLink to={`l/${id}`}>{title}</NavLink>
          <button className="pl-3" type="button" onClick={() => onDestroy(id)}>
            <HiXCircle />
          </button>
        </li>
      ))}
    </ul>
  );
}
