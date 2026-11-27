function Child(): React.ReactElement {
  return <span>child</span>;
}

export function Guarded() {
  try {
    return <Child />;
  } catch {
    return <p>failed</p>;
  }
}
