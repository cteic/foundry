export interface SanitizePathOptions {
  /** Extra segment patterns to mask as `:param`, such as wallet addresses. */
  patterns?: RegExp[];
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const email = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const digits = /^\d+$/;
const opaque = /^[0-9a-zA-Z_-]{30,}$/;

function maskSegment(segment: string, patterns: RegExp[]): string {
  if (segment.length === 0) return segment;
  const decoded = safeDecode(segment);
  if (digits.test(decoded) || uuid.test(decoded)) return ':id';
  if (email.test(decoded)) return ':email';
  if (patterns.some((pattern) => pattern.test(decoded))) return ':param';
  if (opaque.test(decoded)) return ':param';
  return segment;
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Turn a URL path into a route shape that is safe to send to PostHog.
 * The query string and hash are dropped. Numeric IDs and UUIDs become `:id`,
 * emails become `:email`, and long opaque tokens become `:param`.
 *
 * `/rivals/12345?tab=h2h` becomes `/rivals/:id`.
 */
export function sanitizePath(path: string, options: SanitizePathOptions = {}): string {
  const patterns = options.patterns ?? [];
  const pathname = path.split(/[?#]/, 1)[0] ?? '';
  return pathname
    .split('/')
    .map((segment) => maskSegment(segment, patterns))
    .join('/');
}
