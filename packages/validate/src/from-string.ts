import * as z from 'zod';

const INTEGER = /^-?(?:0|[1-9]\d{0,14})$/;
const DECIMAL = /^-?(?:0|[1-9]\d{0,14})(?:\.\d{1,15})?$/;

const isoDate = z.iso.date();
const isoDateTime = z.iso.datetime({ offset: true });

function isIsoDate(value: string): boolean {
  return isoDate.safeParse(value).success || isoDateTime.safeParse(value).success;
}

/**
 * A whole number written in plain digits. `z.coerce.number()` calls
 * `Number(input)`, which turns `''` into 0 and accepts `0x10` and `1e3`.
 * Add limits with `.pipe(z.int().min(1).max(100))`.
 */
export function intFromString() {
  return z.string().regex(INTEGER, 'Expected a whole number').transform(Number);
}

/** A decimal number written in plain digits, with no exponent. */
export function numberFromString() {
  return z.string().regex(DECIMAL, 'Expected a number').transform(Number);
}

/**
 * `true`, `false`, `1` or `0`. `z.coerce.boolean()` calls `Boolean(input)`,
 * which makes the string `'false'` true.
 */
export function booleanFromString() {
  return z.stringbool({ truthy: ['true', '1'], falsy: ['false', '0'] });
}

/**
 * An ISO 8601 date (`2026-03-07`) or date-time with an offset
 * (`2026-03-07T09:30:00Z`). `z.coerce.date()` calls `new Date(input)`, which
 * reads `'1'` as the year 2001.
 */
export function dateFromString() {
  return z
    .string()
    .refine(isIsoDate, 'Expected an ISO 8601 date or date-time')
    .transform((value) => new Date(value));
}

export interface TextOptions {
  /** Longest value accepted after trimming. Always set one. */
  readonly max: number;
  /** Shortest value accepted after trimming. Default 1, so blank text fails. */
  readonly min?: number;
}

/** Free text: trimmed first, then checked against the length limits. */
export function text(options: TextOptions) {
  return z
    .string()
    .trim()
    .min(options.min ?? 1)
    .max(options.max);
}

function toList(value: unknown): unknown {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * A query key that may repeat, such as `?tag=a&tag=b`. One value, many or
 * none all parse to an array of at most `max` items.
 */
export function repeated<T extends z.ZodType>(item: T, max = 20) {
  return z.preprocess(toList, z.array(item).max(max));
}
