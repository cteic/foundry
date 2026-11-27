import { useEffect, useState } from 'react';

export function Mirror({ value }: { value: string }) {
  const [copy, setCopy] = useState('');
  useEffect(() => {
    setCopy(value);
  }, [value]);
  return <p>{copy}</p>;
}
