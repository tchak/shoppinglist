import React from 'react';
import { NavLink, useMatch } from 'react-router-dom';
import { HiClipboardCheck, HiClipboardCopy } from 'react-icons/hi';
import useClipboard from 'react-use-clipboard';

import { useEntityMutation } from '../hooks';

export function Header() {
  const url = location.toString();
  const [, setCopied] = useClipboard(url);
  const isLanding = useMatch('/');
  const mutation = useEntityMutation('list');

  const onShare = () => {
    if (navigator.share) {
      navigator.share({
        title: 'Share Shoppinglist',
        url,
      });
    } else {
      setCopied();
    }
  };

  return (
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
            onClick={() => mutation.add({ title: 'New shopping list' })}
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
  );
}
