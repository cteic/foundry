export function Emptied({ rows }: { rows: string[] }) {
  rows.length = 0;
  return <p>{rows.length}</p>;
}
