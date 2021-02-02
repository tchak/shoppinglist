import React from 'react';
import { useParams } from 'react-router-dom';

import { useListFindOne } from '../store';

export function List() {
  const { id } = useParams();
  const { data } = useListFindOne(id);

  return <h3>{data?.title}</h3>;
}
