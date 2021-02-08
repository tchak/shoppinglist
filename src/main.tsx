import React from 'react';
import ReactDOM from 'react-dom';
import { BrowserRouter as Router } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import * as Sentry from '@sentry/react';
import { Integrations } from '@sentry/tracing';

Sentry.init({
  enabled: !!import.meta.env['VITE_SENTRY_DSN'],
  dsn: import.meta.env['VITE_SENTRY_DSN'] as string,
  release: import.meta.env['VITE_COMMIT_REF'] as string,
  integrations: [new Integrations.BrowserTracing()],
  tracesSampleRate: 1.0,
});

import './index.css';
import App from './App';

const queryClient = new QueryClient();

ReactDOM.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <Router>
        <App />
      </Router>
    </QueryClientProvider>
  </React.StrictMode>,
  document.getElementById('root')
);
