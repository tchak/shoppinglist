import React from 'react';
import { NavLink } from 'react-router-dom';
import { FaTwitter, FaGithub } from 'react-icons/fa';

export function Footer() {
  return (
    <div className="bg-white">
      <div className="max-w-7xl mx-auto py-12 px-4 overflow-hidden sm:px-6 lg:px-8">
        <nav
          className="-mx-5 -my-2 flex flex-wrap justify-center"
          aria-label="Footer"
        >
          <div className="px-5 py-2">
            <NavLink
              to="/about"
              className="text-base text-gray-500 hover:text-gray-900"
            >
              About
            </NavLink>
          </div>
        </nav>
        <div className="mt-8 flex justify-center space-x-6">
          <a
            href="https://twitter.com/tchak13"
            className="text-gray-400 hover:text-gray-500"
          >
            <span className="sr-only">Twitter</span>
            <FaTwitter />
          </a>

          <a
            href="https://github.com/tchak"
            className="text-gray-400 hover:text-gray-500"
          >
            <span className="sr-only">GitHub</span>
            <FaGithub />
          </a>
        </div>
        <p className="mt-8 text-center text-base text-gray-400">
          &copy; 2021 Tchak
        </p>
      </div>
    </div>
  );
}
