const Status = {
  Open: 'open',
  Closed: 'closed',
} as const;

export type Status = (typeof Status)[keyof typeof Status];

export function isOpen(status: Status): boolean {
  return status === Status.Open;
}
