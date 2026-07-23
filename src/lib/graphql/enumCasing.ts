import "server-only";

// PostGraphile emits Postgres enum values as UPPER_SNAKE_CASE GraphQL enum
// constants, while our internal domain types (src/types/index.ts) mirror the
// raw lower_snake_case Postgres values. Both use the same word-splits, so a
// straight case conversion round-trips exactly — this module is the one
// place that boundary is crossed.
export function toGraphqlEnum(value: string): string {
  return value.toUpperCase();
}

export function fromGraphqlEnum<T extends string>(value: string): T {
  return value.toLowerCase() as T;
}
