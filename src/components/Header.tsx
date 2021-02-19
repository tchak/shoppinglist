import React, { useState, useRef } from 'react';
import { NavLink, useMatch } from 'react-router-dom';
import { HiClipboardCheck, HiClipboardCopy } from 'react-icons/hi';
import useClipboard from 'react-use-clipboard';

import { useRecordMutation } from '../hooks';
import { Notification } from './Notification';

const NOTIFICATION_DURATION = 2000;

export function Header() {
  const url = location.toString();
  const [isCopied, setCopied] = useClipboard(url, {
    successDuration: NOTIFICATION_DURATION,
  });
  const [isShared, setShared] = useState(false);
  const closeTimer = useRef<number>();
  const isLanding = useMatch('/');
  const mutation = useRecordMutation();

  const onShare = () => {
    clearTimeout(closeTimer.current);
    if (navigator.share) {
      navigator.share({ url }).then(() => {
        setShared(true);
        closeTimer.current = setTimeout(
          () => setShared(false),
          NOTIFICATION_DURATION
        );
      });
    } else {
      setCopied();
    }
  };

  return (
    <>
      <Notification
        isOpen={isCopied || isShared}
        onClose={() => setShared(false)}
        text="Link copied!"
      />
      <div className="flex items-center justify-between flex-wrap sm:flex-nowrap">
        <NavLink to="/">
          <h1 className="sr-only">Shoppinglist</h1>
          <HiClipboardCheck className="text-gray-900 text-4xl" />
        </NavLink>
        <div className="ml-4 flex-shrink-0">
          {isLanding ? (
            <button
              type="button"
              className="relative inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
              onClick={() =>
                mutation.mutate((t) =>
                  t.addRecord({
                    type: 'list',
                    attributes: { title: 'New shopping list' },
                  })
                )
              }
            >
              Create new list
            </button>
          ) : (
            <button type="button" onClick={onShare}>
              <HiClipboardCopy className="text-gray-900 text-4xl" />
            </button>
          )}
        </div>
      </div>
    </>
  );
}
