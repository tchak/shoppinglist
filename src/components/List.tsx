import React, { useState } from 'react';
import { useParams } from 'react-router-dom';

import { useListFindOne, useListChangeTitle } from '../store';

export function List() {
  const { id } = useParams();
  const { data } = useListFindOne(id);
  const onChange = useListChangeTitle(id);

  if (!data) {
    return <>Loading...</>;
  }
  return (
    <h3>
      <EditableTitle title={data.title} onChange={onChange} />
    </h3>
  );
}

function EditableTitle({
  title,
  onChange,
}: {
  title: string;
  onChange: (title: string) => void;
}) {
  const [value, setValue] = useState(title);
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    return (
      <input
        value={value}
        autoFocus={true}
        onChange={({ currentTarget: { value: title } }) => {
          onChange(title);
          setValue(title);
        }}
        onBlur={() => setIsEditing(false)}
      />
    );
  }

  return (
    <>
      {title}{' '}
      <button type="button" onClick={() => setIsEditing(true)}>
        edit
      </button>
    </>
  );
}
