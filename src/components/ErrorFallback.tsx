import React from 'react';

export function ErrorFallback({ error }: { error: Error }) {
  return (
    <div role="alert">
      <p>Something went wrong:</p>
      <pre>{error?.message ?? 'Unknown error'}</pre>
    </div>
  );
}
