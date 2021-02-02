import React from 'react';
import { Routes, Route } from 'react-router-dom';

import { Header } from './components/Header';
import { Footer } from './components/Footer';

import { Landing } from './components/Landing';
import { List } from './components/List';
import { About } from './components/About';

function App() {
  return (
    <div className="bg-gray-200 h-full min-h-screen py-2">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white overflow-hidden shadow rounded-lg divide-y divide-gray-200">
            <header className="px-4 py-4 sm:px-6">
              <Header />
            </header>
            <div role="main" className="px-4 py-5 sm:p-6">
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/l/:id" element={<List />} />
                <Route path="/about" element={<About />} />
              </Routes>
            </div>
            <footer className="px-4 py-4 sm:px-6">
              <Footer />
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
