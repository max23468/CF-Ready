export const FUNCTION_HANDLE = "cf-ready-validation";
export const VALIDATION_TITLE = "CF Ready";
export const METAFIELD_NAMESPACE = "$app:cf-ready-validation";
export const METAFIELD_KEY = "function-configuration";

export type Validation = {
  id: string;
  title: string;
  enabled: boolean;
  blockOnFailure: boolean;
  shopifyFunction: { handle: string };
  metafield: { jsonValue: unknown } | null;
};

export type MutationResult = {
  data?: {
    validationCreate?: { userErrors: { message: string }[] };
    validationUpdate?: { userErrors: { message: string }[] };
  };
  errors?: { message: string }[];
};

export type Admin = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

export type ReconcileTiming = (
  name:
    | "shopify_context"
    | "shopify_snapshot"
    | "d1_commercial"
    | "shopify_billing"
    | "d1_validation_state",
  durationMs: number,
) => void;
