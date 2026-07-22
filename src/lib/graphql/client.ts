import "server-only";
import { GraphQLClient } from "graphql-request";

const endpoint = process.env.POSTGRAPHILE_URL;

if (!endpoint) {
  throw new Error("POSTGRAPHILE_URL is not set");
}

export const graphqlClient = new GraphQLClient(endpoint);
