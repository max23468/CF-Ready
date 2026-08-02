import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { LoginErrorType, type LoginError } from "@shopify/shopify-app-react-router/server";
import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";

import { resolveLocale, texts } from "../../i18n";
import { login } from "../../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const locale = resolveLocale(request);
  const errors = loginErrorMessage(await login(request), locale);

  return { errors, locale };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const locale = resolveLocale(request);
  const errors = loginErrorMessage(await login(request), locale);

  return { errors, locale };
};

function loginErrorMessage(loginErrors: LoginError, locale: "it" | "en") {
  const t = texts(locale).auth;
  if (loginErrors?.shop === LoginErrorType.MissingShop) {
    return { shop: t.missingShop };
  }
  if (loginErrors?.shop === LoginErrorType.InvalidShop) {
    return { shop: t.invalidShop };
  }
  return {};
}

export default function Auth() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [shop, setShop] = useState("");
  const { errors, locale } = actionData || loaderData;
  const t = texts(locale).auth;

  return (
    <AppProvider embedded={false}>
      <s-page>
        <Form method="post">
          <s-section heading={t.heading}>
            <s-text-field
              name="shop"
              label={t.shopLabel}
              details="example.myshopify.com"
              value={shop}
              onChange={(e) => setShop(e.currentTarget.value)}
              autocomplete="on"
              error={errors.shop}
            ></s-text-field>
            <s-button type="submit">{t.submit}</s-button>
          </s-section>
        </Form>
      </s-page>
    </AppProvider>
  );
}
