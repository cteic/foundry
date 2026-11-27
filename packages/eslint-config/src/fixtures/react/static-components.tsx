export function Outer({ label }: { label: string }) {
  function Inner() {
    return <span>{label}</span>;
  }
  return <Inner />;
}
