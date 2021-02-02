import React, { useState } from 'react';

export function Landing() {
  const [count, setCount] = useState(0);
  return (
    <div className="App-header">
      <p>Hello Vite + React!</p>
      <p>
        <button onClick={() => setCount((count) => count + 1)}>
          count is: {count}
        </button>
      </p>
    </div>
  );
}
