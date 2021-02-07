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
  const CheckedIcon = checked ? HiPlus : HiCheck;
  const isChecking = swipe === 1;
  const isRemoving = swipe === -1;

  return (
    <li className="group py-4 flex">
      {isChecking && (
        <div className="flex justify-between flex-grow relative pointer-events-auto bg-blue-500">
          <button type="button" onClick={() => onToggle(id, !checked)}>
            <CheckedIcon className="text-5xl mx-4 my-2 text-white" />
            <span className="sr-only">Check</span>
          </button>
          <button onClick={() => setSwipe(0)}>
            <HiX className="text-5xl mx-4 my-2 text-white" />
            <span className="sr-only">Cancel</span>
          </button>
        </div>
      )}
      {isRemoving && (
        <div className="flex justify-between flex-grow relative pointer-events-auto bg-red-500">
          <button onClick={() => setSwipe(0)}>
            <HiX className="text-5xl mx-4 my-2 text-white" />
            <span className="sr-only">Remove</span>
          </button>
          <button type="button" onClick={() => onRemove(id)}>
            <HiTrash className="text-5xl mx-4 my-2 text-white" />
            <span className="sr-only">Cancel</span>
          </button>
        </div>
      )}
      {!isChecking && !isRemoving && (
        <Slider CheckedIcon={CheckedIcon} swipe={setSwipe}>
          <div className="ml-3 flex-grow">
            <p
              className={`text-lg text-gray-900 ${
                checked ? 'line-through' : ''
              }`}
            >
              {title}
            </p>
            <p className="text-sm text-gray-500"></p>
          </div>

          <button
            className="ml-3 opacity-0 md:group-hover:opacity-100 transition duration-200 ease-in-out"
            type="button"
            onClick={() => onToggle(id, !checked)}
          >
            <CheckedIcon className="hover:text-green-500 text-2xl" />
            <span className="sr-only">Un check</span>
          </button>
          <button
            className="ml-3 opacity-0 md:group-hover:opacity-100 transition duration-200 ease-in-out"
            type="button"
            onClick={() => onRemove(id)}
          >
            <HiTrash className="hover:text-red-500 text-2xl" />
            <span className="sr-only">Remove</span>
          </button>
        </Slider>
      )}
    </li>
  );
}

function Slider({
  swipe,
  CheckedIcon,
  children,
}: {
  swipe: (position: number) => void;
  CheckedIcon: typeof HiPlus | typeof HiCheck;
  children: ReactNode[];
}) {
  const [isRemoving, setRemoving] = useState(false);
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
      setRemoving(mx < 0);
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
      className={`flex justify-between flex-grow relative pointer-events-auto bg-gradient-to-r ${
        isRemoving ? 'from-red-300 to-red-500' : 'from-blue-500 to-blue-300'
      }`}
    >
      <CheckedIcon className="text-5xl mx-4 my-2 text-white" />
      <HiTrash className="text-5xl mx-4 my-2 text-white" />
      <animated.div
        className="bg-white w-full absolute inset-0 flex"
        style={{
          transform: x.interpolate((x) => `translate3d(${x}px,0,0)`),
        }}
      >
        {children}
      </animated.div>
    </animated.div>
  );
}
