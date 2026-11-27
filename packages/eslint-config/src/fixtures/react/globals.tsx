let renders = 0;

export function Counted() {
  renders = renders + 1;
  return <p>{renders}</p>;
}
