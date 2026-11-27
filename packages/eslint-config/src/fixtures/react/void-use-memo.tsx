import { useMemo } from 'react';

export function Logged({ value }: { value: number }) {
  useMemo(() => {
    console.log(value);
  }, [value]);
  return <p>{value}</p>;
}
