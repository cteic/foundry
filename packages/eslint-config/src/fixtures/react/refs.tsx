import { useRef } from 'react';

export function Latest({ value }: { value: string }) {
  const latest = useRef(value);
  return <p>{latest.current}</p>;
}
