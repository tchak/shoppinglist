import React from 'react';
import ReactDOM from 'react-dom';
import { BrowserRouter as Router } from 'react-router-dom';
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

ReactDOM.render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>,
  document.getElementById('root')
);
