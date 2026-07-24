import { describe, expect, it } from "vitest";
import { fromGraphqlEnum, toGraphqlEnum } from "@/lib/graphql/enumCasing";

describe("enum casing round trip", () => {
  it("uppercases a domain enum value into its GraphQL wire form", () => {
    expect(toGraphqlEnum("free_open_source")).toBe("FREE_OPEN_SOURCE");
  });

  it("lowercases a GraphQL wire enum value back into the domain form", () => {
    expect(fromGraphqlEnum("FREE_OPEN_SOURCE")).toBe("free_open_source");
  });

  it("round-trips every LicensingModel-shaped value", () => {
    for (const value of ["free_open_source", "paid_one_time", "royalty_based"]) {
      expect(fromGraphqlEnum(toGraphqlEnum(value))).toBe(value);
    }
  });
});
