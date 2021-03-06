import React, { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import { ErrorBoundary, withProfiler } from '@sentry/react';
import { QueryClient, QueryClientProvider } from 'react-query';

import { schema } from './models';
import { Store, StoreProvider, invalidateQueries } from './hooks';
import { ErrorFallback } from './components/ErrorFallback';
import { Loader } from './components/Loader';

import { Header } from './components/Header';
import { Footer } from './components/Footer';

const store = new Store({
  schema,
  name: import.meta.env.VITE_DB_NAME as string,
  host: import.meta.env.VITE_API_URL as string,
  token: import.meta.env.VITE_API_TOKEN as string,
});
const queryClient = new QueryClient();
invalidateQueries(store, queryClient);

const LazyLanding = lazy(() => import('./components/Landing'));
const LazyList = lazy(() => import('./components/List'));
const LazyAbout = lazy(() => import('./components/About'));

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <StoreProvider value={store}>
        <div className="bg-gray-200 h-full min-h-screen py-2">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl mx-auto">
              <div className="bg-white overflow-hidden shadow rounded-lg divide-y divide-gray-200">
                <header className="px-4 py-4 sm:px-6">
                  <Header />
                </header>
                <div role="main" className="px-4 py-5 sm:p-6">
                  <ErrorBoundary
                    fallback={({ error }) => <ErrorFallback error={error} />}
                  >
                    <Suspense fallback={<Loader />}>
                      <Routes>
                        <Route path="/" element={<LazyLanding />} />
                        <Route path="/l/:id" element={<LazyList />} />
                        <Route path="/about" element={<LazyAbout />} />
                      </Routes>
                    </Suspense>
                  </ErrorBoundary>
                </div>
                <footer className="px-4 py-4 sm:px-6">
                  <Footer />
                </footer>
              </div>
            </div>
          </div>
        </div>
      </StoreProvider>
    </QueryClientProvider>
  );
}

export default withProfiler(App);
