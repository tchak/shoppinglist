import React, { useState, ReactNode } from 'react';
import { HiTrash, HiCheck, HiPlus, HiX } from 'react-icons/hi';
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
  const [swipe, setSwipe] = useState(0);
  const Icon = checked ? HiPlus : HiCheck;
  const isChecking = swipe === 1;
  const isRemoving = swipe === -1;

  return (
    <li className="group py-4 flex">
      {isChecking && (
        <div className="flex justify-between flex-grow relative pointer-events-auto bg-blue-500">
          <button type="button" onClick={() => onToggle(id, !checked)}>
            <Icon className="text-5xl mx-4 my-2 text-white" />
          </button>
          <button onClick={() => setSwipe(0)}>
            <HiX className="text-5xl mx-4 my-2 text-white" />
          </button>
        </div>
      )}
      {isRemoving && (
        <div className="flex justify-between flex-grow relative pointer-events-auto bg-red-500">
          <button onClick={() => setSwipe(0)}>
            <HiX className="text-5xl mx-4 my-2 text-white" />
          </button>
          <button type="button" onClick={() => onRemove(id)}>
            <HiTrash className="text-5xl mx-4 my-2 text-white" />
          </button>
        </div>
      )}
      {!isChecking && !isRemoving && (
        <Slider swipe={setSwipe}>
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
            className="ml-3 opacity-0 md:group-hover:opacity-100 transition duration-200 ease-in-out"
            type="button"
            onClick={() => onToggle(id, !checked)}
          >
            <Icon className="hover:text-green-500 text-2xl" />
          </button>
          <button
            className="ml-3 opacity-0 md:group-hover:opacity-100 transition duration-200 ease-in-out"
            type="button"
            onClick={() => onRemove(id)}
          >
            <HiTrash className="hover:text-red-500 text-2xl" />
          </button>
        </Slider>
      )}
    </li>
  );
}

function Slider({
  swipe,
  children,
}: {
  swipe: (position: number) => void;
  children: ReactNode[];
}) {
  const [{ x }, setSpring] = useSpring<{ x: number }>(() => ({
    x: 0,
  }));
  const bind = useDrag(
    ({ down, movement: [mx], swipe: [swipeX] }) => {
      setSpring({
        x: down ? mx : 0,
        immediate: down,
      });
      swipe(swipeX);
    },
    {
      axis: 'x',
      lockDirection: true,
      delay: 500,
      useTouch: true,
      swipeDuration: 500,
      swipeVelocity: 0.2,
    }
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
