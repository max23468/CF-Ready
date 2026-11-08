export type Admin = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
};
