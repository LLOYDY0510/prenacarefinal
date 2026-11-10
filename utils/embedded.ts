/**
 * PostgREST returns an embedded to-one relation either as an object or as a
 * single-element array depending on the relationship cardinality it detected.
 * These helpers normalise both shapes so callers never need `as any`.
 */

export function one<T>(value: T | T[] | null | undefined): T | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.length > 0 ? value[0] : null;
  return value;
}

export function many<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}
