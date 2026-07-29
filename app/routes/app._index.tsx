import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import {
  acquireValidationLock,
  findPocValidation,
  FUNCTION_HANDLE,
  isPocStore,
  mutationError,
  POC_CONFIG,
  queryContext,
  releaseValidationLockBestEffort,
  startValidationLockHeartbeat,
} from "../validation-poc.server";
import type { MutationResult } from "../validation-poc.server";

const POC_TITLE = "CF Ready — PoC tecnico";
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

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  if (!isPocStore(session.shop)) {
    return { ok: false, error: "Il PoC può modificare solo il dev store CF Ready." };
  }
  const intent = (await request.formData()).get("intent");
  if (intent !== "enable" && intent !== "disable") {
    return { ok: false, error: "Azione non valida." };
  }

  const db = context.cloudflare.env.DB;
  const lockToken = await acquireValidationLock(db, session.shop);
  if (!lockToken) {
    return { ok: false, error: "Un’altra operazione sulla Validation è già in corso." };
  }
  const heartbeat = startValidationLockHeartbeat(db, session.shop, lockToken);

  try {
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
            functionHandle: FUNCTION_HANDLE,
            enable,
            blockOnFailure: false,
            metafields,
          },
        };
    if (!(await heartbeat.isHeld())) {
      return { ok: false, error: "Il coordinamento della Validation non è più valido." };
    }
    const response = await admin.graphql(existing ? UPDATE_VALIDATION : CREATE_VALIDATION, {
      variables,
    });
    const result = (await response.json()) as MutationResult;
    const operation = existing ? "validationUpdate" : "validationCreate";
    const error = mutationError(result, operation);
    if (error) {
      return { ok: false, error };
    }

    const readback = findPocValidation((await queryContext(admin)).validations.nodes);
    if (!readback || readback.enabled !== enable || readback.blockOnFailure !== false) {
      return { ok: false, error: "Readback Shopify non riuscito." };
    }
    return { ok: true };
  } finally {
    await heartbeat.stop();
    await releaseValidationLockBestEffort(db, session.shop, lockToken);
  }
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
