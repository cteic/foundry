import * as z from 'zod';

/** The fields of an object schema, as passed to `z.object`. */
export type Shape = Readonly<Record<string, z.ZodType>>;

export type SchemaOrShape = z.ZodType | Shape;

/** What a bare shape parses to: an object that rejects unknown keys. */
export type StrictOutput<S extends Shape> = z.output<z.ZodObject<S, z.core.$strict>>;

/** What a bare shape parses to when unknown keys are dropped. */
export type StrippedOutput<S extends Shape> = z.output<z.ZodObject<S>>;

export function isSchema(input: SchemaOrShape): input is z.ZodType {
  return input instanceof z.ZodType;
}

/** A bare shape becomes a strict object. A full schema is used as given. */
export function strictSchema(input: SchemaOrShape): z.ZodType {
  return isSchema(input) ? input : z.strictObject(input);
}
