import { useState } from 'react';

export function Clean({ initial }: { initial: number }) {
  const [count, setCount] = useState(initial);
  return (
    <button
      type="button"
      onClick={() => {
        setCount(count + 1);
      }}
    >
      {count}
    </button>
  );
}
