import React, { ReactNode } from 'react';
import { HiTrash, HiCheck, HiPlus } from 'react-icons/hi';
import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
} from '@reach/disclosure';
import { animated, useSpring } from 'react-spring';
import { useDrag } from 'react-use-gesture';

import { ID, Item } from '../hooks';

interface ListItemProps {
  onToggle: (id: ID, checked: boolean) => void;
  onRemove: (id: ID) => void;
}

export function ActiveItemsList({
  items,
  ...props
}: {
  items: Item[];
} & ListItemProps) {
  return (
    <ul className="divide-y divide-gray-200">
      {items.map((item) => (
        <ListItem key={item.id} {...item} {...props} />
      ))}
    </ul>
  );
}

export function CheckedOffItemsList({
  items,
  ...props
}: {
  items: Item[];
} & ListItemProps) {
  if (items.length === 0) {
    return null;
  }
  return (
    <Disclosure>
      <DisclosureButton>{items.length} checked off</DisclosureButton>
      <DisclosurePanel as="ul" className="divide-y divide-gray-200">
        {items.map((item) => (
          <ListItem key={item.id} {...item} {...props} />
        ))}
      </DisclosurePanel>
    </Disclosure>
  );
}

function ListItem({
  id,
  title,
  checked,
  onToggle,
  onRemove,
}: Item & ListItemProps) {
  const Icon = checked ? HiPlus : HiCheck;

  return (
    <li className="group py-4 flex">
      <Slider>
        <div className="ml-3 flex-grow">
          <p
            className={`text-sm font-medium text-gray-900 ${
              checked ? 'line-through' : ''
            }`}
          >
            {title}
          </p>
          <p className="text-sm text-gray-500">note</p>
        </div>

        <button
          className="ml-3 opacity-0 group-hover:opacity-100 transition duration-200 ease-in-out"
          type="button"
          onClick={() => onToggle(id, !checked)}
        >
          <Icon className="hover:text-green-500 text-2xl" />
        </button>
        <button
          className="ml-3 opacity-0 group-hover:opacity-100 transition duration-200 ease-in-out"
          type="button"
          onClick={() => onRemove(id)}
        >
          <HiTrash className="hover:text-red-500 text-2xl" />
        </button>
      </Slider>
    </li>
  );
}

function Slider({ children }: { children: ReactNode[] }) {
  const [{ x }, setSpring] = useSpring<{ x: number }>(() => ({
    x: 0,
  }));
  const bind = useDrag(
    ({ down, movement: [mx] }) => {
      setSpring({
        x: down ? mx : 0,
        immediate: down,
      });
    },
    { axis: 'x', lockDirection: true }
  );

  return (
    <animated.div
      {...bind()}
      className={`flex-grow relative pointer-events-auto bg-gradient-to-r from-blue-500 to-blue-200`}
    >
      <HiCheck className="text-5xl mx-4 my-2 text-white" />
      <animated.div
        className="slider bg-white w-full absolute inset-0 flex"
        style={{
          transform: x.interpolate((x) => `translate3d(${x}px,0,0)`),
        }}
      >
        {children}
      </animated.div>
    </animated.div>
  );
}
