import { texts, type Locale } from "../i18n";
import type { TaxCodeLabelIssue } from "./tax-code-label-review";

export function TaxCodeLabelIssueText({
  issue,
  locale,
}: {
  issue: TaxCodeLabelIssue;
  locale: Locale;
}) {
  const t = texts(locale);
  const copy = t.taxCodeLabelReview;
  const message = issue.kind === "optional" ? copy.optional : copy[issue.kind](issue.value);
  const language = t.rules.labels.languageNames[issue.language];
  const context = issue.defaultOnly
    ? copy.defaultContext(language)
    : copy.context(language, issue.market);
  return (
    <s-stack direction="block" gap="small-100">
      <s-paragraph>
        {message} {context}
      </s-paragraph>
      {issue.manual && issue.kind !== "custom" ? <s-paragraph>{copy.manual}</s-paragraph> : null}
    </s-stack>
  );
}
