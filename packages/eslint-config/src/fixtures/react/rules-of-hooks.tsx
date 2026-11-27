import { useState } from 'react';

export function Counter({ show }: { show: boolean }) {
  if (show) {
    const [count] = useState(0);
    return <p>{count}</p>;
  }
  return null;
}
