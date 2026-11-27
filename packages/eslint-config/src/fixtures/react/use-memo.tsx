import { useMemo } from 'react';

export function Doubled({ value }: { value: number }) {
  const doubled = useMemo(async () => {
    await Promise.resolve();
    return value * 2;
  }, [value]);
  return <p>{doubled instanceof Promise ? 'loading' : 'ready'}</p>;
}
