import { useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { APP_VERSION } from "../env.server";
import { resolveLocale, supportMailto, texts } from "../i18n";
import { skipRevalidationWhenLeaving } from "../revalidation";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  // La Guida non rilegge Shopify: allega i soli dati già disponibili qui (§22).
  return { locale: resolveLocale(request), shopDomain: session.shop, version: APP_VERSION };
};

export const shouldRevalidate = skipRevalidationWhenLeaving;

export default function Guide() {
  const { locale, shopDomain, version } = useLoaderData<typeof loader>();
  const t = texts(locale);
  const [expanded, setExpanded] = useState(false);

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
      <s-box paddingBlockEnd="base" maxInlineSize="640px">
        <s-paragraph>{t.guide.intro}</s-paragraph>
      </s-box>

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
                { shopDomain, version },
                locale,
                category as keyof typeof t.support.categories,
              )}
            >
              {label}
            </s-link>
          ))}
          <s-text color="subdued">{t.support.privacyNote}</s-text>
        </s-stack>
      </s-section>
    </s-page>
  );
}
