import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { authenticateAdmin } from "../admin-auth.server";
import { databaseContext } from "../context.server";
import { APP_VERSION } from "../env.server";
import { recordEvent } from "../events.server";
import { resolveLocale, supportDiagnosticText, supportMailto, texts } from "../i18n";
import { skipRevalidationWhenLeaving } from "../revalidation";
import { readSupportDiagnosticState } from "../support.server";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { session } = await authenticateAdmin(request, context);
  // La Guida non rilegge Shopify: usa solo lo stato tecnico D1 già riconciliato (§22).
  const diagnostics = await readSupportDiagnosticState(context.get(databaseContext), session.shop);
  return {
    locale: resolveLocale(request),
    shopDomain: session.shop,
    version: APP_VERSION,
    diagnosticId: crypto.randomUUID(),
    diagnostics,
  };
};

const DIAGNOSTIC_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { session } = await authenticateAdmin(request, context);
  const form = await request.formData();
  const diagnosticId = form.get("diagnostic_id");
  if (
    form.get("intent") !== "diagnostics_copied" ||
    typeof diagnosticId !== "string" ||
    !DIAGNOSTIC_ID.test(diagnosticId)
  ) {
    return { ok: false };
  }
  await recordEvent(context.get(databaseContext), {
    shopDomain: session.shop,
    name: "support_diagnostics_copied",
    class: "support",
    metadata: { correlation_id: diagnosticId },
  });
  return { ok: true };
};

export const shouldRevalidate = skipRevalidationWhenLeaving;

export default function Guide() {
  const { locale, shopDomain, version, diagnosticId, diagnostics } = useLoaderData<typeof loader>();
  const t = texts(locale);
  const [expanded, setExpanded] = useState(false);
  const [copyState, setCopyState] = useState<"copied" | "failed" | null>(null);
  const diagnosticsFetcher = useFetcher<typeof action>();
  const supportDetails = { shopDomain, version, diagnosticId, ...diagnostics };

  const copyDiagnostics = async () => {
    try {
      await navigator.clipboard.writeText(supportDiagnosticText(supportDetails, locale));
      setCopyState("copied");
      diagnosticsFetcher.submit(
        { intent: "diagnostics_copied", diagnostic_id: diagnosticId },
        { method: "post" },
      );
    } catch {
      setCopyState("failed");
    }
  };

  // Un solo comando per aprire e chiudere tutto. Agisce sull'attributo nativo di `details`,
  // quindi non serve tenere in stato l'apertura di ogni voce.
  const toggleAll = () => {
    const open = !expanded;
    document.querySelectorAll<HTMLDetailsElement>("#faq details").forEach((entry) => {
      entry.open = open;
    });
    setExpanded(open);
  };

  return (
    <s-page heading={t.guide.heading}>
      {/* §15.7: pagina unica con sezioni espandibili. Polaris non ha un componente di
          divulgazione, quindi si usa `details`, che è l'elemento nativo della piattaforma:
          accessibile e utilizzabile da tastiera senza reimplementare nulla (§8.1). */}
      <s-section id="faq">
        <s-stack direction="block" gap="small-100">
          <s-grid gridTemplateColumns="1fr auto" alignItems="center" gap="base">
            <s-heading>{t.guide.faqHeading}</s-heading>
            <s-button onClick={toggleAll}>
              {expanded ? t.guide.collapseAll : t.guide.expandAll}
            </s-button>
          </s-grid>
          {t.guide.entries.map((entry) => (
            <details key={entry.q}>
              <summary>
                <strong>{entry.q}</strong>
              </summary>
              <s-box paddingBlockStart="small-100">
                <s-paragraph>{entry.a}</s-paragraph>
              </s-box>
            </details>
          ))}
        </s-stack>
      </s-section>

      {/* A-16: il colore di brand è ammesso dentro un'illustrazione, su superfici prive di
          azioni operative. Questa è documentazione, non configurazione. */}
      <s-section slot="aside" heading={t.guide.asideHeading}>
        <s-stack direction="block" gap="base">
          <s-box maxInlineSize="160px">
            <s-image
              src="/cf-ready-lockup.svg"
              alt="CF Ready"
              aspectRatio="16/3"
              objectFit="contain"
            />
          </s-box>
          <s-paragraph>{t.guide.asideBody}</s-paragraph>
          <s-stack direction="block" gap="small-100">
            <s-heading>{t.guide.asideLinks}</s-heading>
            <s-link href="/app/rules">{t.nav.rules}</s-link>
            <s-link href="/app/messages">{t.nav.messages}</s-link>
            <s-link href="/app/onboarding">{t.onboarding.reopen}</s-link>
          </s-stack>
        </s-stack>
      </s-section>

      {/* FR-090: il recapito è un `mailto:` precompilato, non un modulo che invia (§22). */}
      <s-section slot="aside" heading={t.support.heading}>
        <s-stack direction="block" gap="base">
          <s-paragraph>{t.support.body}</s-paragraph>
          <s-paragraph>{t.support.chooseCategory}</s-paragraph>
          {Object.entries(t.support.categories).map(([category, label]) => (
            <s-link
              key={category}
              href={supportMailto(
                supportDetails,
                locale,
                category as keyof typeof t.support.categories,
              )}
            >
              {label}
            </s-link>
          ))}
          <s-button onClick={copyDiagnostics}>{t.support.copyDiagnostics}</s-button>
          {copyState ? (
            <s-text tone={copyState === "copied" ? "success" : "critical"}>
              {copyState === "copied"
                ? t.support.diagnosticsCopied
                : t.support.diagnosticsCopyFailed}
            </s-text>
          ) : null}
          <s-text color="subdued">{t.support.privacyNote}</s-text>
        </s-stack>
      </s-section>
    </s-page>
  );
}
