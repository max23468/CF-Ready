import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";

const POC_TITLE = "CF Ready — PoC tecnico";
const POC_CONFIG = { pocVersion: 1, enabled: true } as const;

const CONTEXT_QUERY = `#graphql
  query PocContext {
    shop {
      name
      shopAddress {
        countryCodeV2
      }
    }
    validations(first: 25) {
      nodes {
        id
        title
        enabled
        blockOnFailure
        metafield(
          namespace: "$app:cf-ready-validation"
          key: "function-configuration"
        ) {
          jsonValue
        }
      }
    }
  }
`;

const CREATE_VALIDATION = `#graphql
  mutation PocValidationCreate($validation: ValidationCreateInput!) {
    validationCreate(validation: $validation) {
      validation {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const UPDATE_VALIDATION = `#graphql
  mutation PocValidationUpdate($id: ID!, $validation: ValidationUpdateInput!) {
    validationUpdate(id: $id, validation: $validation) {
      validation {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

type Validation = {
  id: string;
  title: string;
  enabled: boolean;
  blockOnFailure: boolean;
  metafield: { jsonValue: unknown } | null;
};

type Context = {
  shop: { name: string; shopAddress: { countryCodeV2: string } };
  validations: { nodes: Validation[] };
};

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const data = await queryContext(admin);
  const countryCode = data.shop.shopAddress.countryCodeV2;
  const now = new Date().toISOString();

  await context.cloudflare.env.DB.prepare(
    "UPDATE shops SET country_code = ?, updated_at = ? WHERE shop_domain = ?",
  )
    .bind(countryCode, now, session.shop)
    .run();
  const persisted = (await context.cloudflare.env.DB.prepare(
    "SELECT country_code FROM shops WHERE shop_domain = ?",
  )
    .bind(session.shop)
    .first()) as { country_code: string } | null;
  if (persisted?.country_code !== countryCode) {
    throw new Response("Readback D1 non riuscito", { status: 500 });
  }

  const validation = findPocValidation(data.validations.nodes);
  return {
    shopName: data.shop.name,
    countryCode,
    validationEnabled: validation?.enabled ?? false,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const intent = (await request.formData()).get("intent");
  if (intent !== "enable" && intent !== "disable") {
    return { ok: false, error: "Azione non valida." };
  }

  const data = await queryContext(admin);
  const existing = findPocValidation(data.validations.nodes);
  const enable = intent === "enable";
  const metafields = [
    {
      namespace: "$app:cf-ready-validation",
      key: "function-configuration",
      type: "json",
      value: JSON.stringify(POC_CONFIG),
    },
  ];
  const variables = existing
    ? {
        id: existing.id,
        validation: { title: POC_TITLE, enable, blockOnFailure: false, metafields },
      }
    : {
        validation: {
          title: POC_TITLE,
          functionHandle: "cf-ready-validation",
          enable,
          blockOnFailure: false,
          metafields,
        },
      };
  const response = await admin.graphql(existing ? UPDATE_VALIDATION : CREATE_VALIDATION, {
    variables,
  });
  const result = (await response.json()) as {
    data: {
      validationCreate?: { userErrors: { message: string }[] };
      validationUpdate?: { userErrors: { message: string }[] };
    };
  };
  const userErrors = (result.data.validationCreate ?? result.data.validationUpdate)?.userErrors;
  if (userErrors?.length) {
    return { ok: false, error: userErrors.map(({ message }) => message).join(" ") };
  }

  const readback = findPocValidation((await queryContext(admin)).validations.nodes);
  if (!readback || readback.enabled !== enable || readback.blockOnFailure !== false) {
    return { ok: false, error: "Readback Shopify non riuscito." };
  }
  return { ok: true };
};

export default function Home() {
  const { shopName, countryCode, validationEnabled } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  return (
    <s-page heading="CF Ready">
      <s-section heading="Proof of concept">
        <s-paragraph>
          {shopName} ({countryCode}) · Validation PoC {validationEnabled ? "attiva" : "disattivata"}
          .
        </s-paragraph>
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value={validationEnabled ? "disable" : "enable"} />
          <s-button
            variant={validationEnabled ? "secondary" : "primary"}
            type="submit"
            disabled={fetcher.state !== "idle"}
          >
            {validationEnabled ? "Disattiva PoC" : "Attiva PoC"}
          </s-button>
        </fetcher.Form>
        {fetcher.data && !fetcher.data.ok ? (
          <s-banner tone="critical">{fetcher.data.error}</s-banner>
        ) : null}
      </s-section>
    </s-page>
  );
}

async function queryContext(admin: {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
}) {
  const response = await admin.graphql(CONTEXT_QUERY);
  const body = (await response.json()) as { data?: Context };
  if (!body.data) throw new Response("Query Shopify non riuscita", { status: 502 });
  return body.data;
}

function findPocValidation(validations: Validation[]) {
  const matches = validations.filter(({ title, metafield }) => {
    const config = metafield?.jsonValue;
    return (
      title === POC_TITLE &&
      config !== null &&
      typeof config === "object" &&
      !Array.isArray(config) &&
      "pocVersion" in config &&
      config.pocVersion === 1
    );
  });
  if (matches.length > 1) {
    throw new Response("Sono presenti più Validation CF Ready PoC.", {
      status: 409,
    });
  }
  return matches[0];
}
