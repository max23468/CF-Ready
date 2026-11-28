import { texts, type Locale } from "../i18n";
import type { TaxCodeLabelIssue } from "./tax-code-label-review";

export function TaxCodeLabelIssueText({
  issue,
  locale,
  primaryLanguageOnly = false,
}: {
  issue: TaxCodeLabelIssue;
  locale: Locale;
  primaryLanguageOnly?: boolean;
}) {
  const t = texts(locale);
  const copy = t.taxCodeLabelReview;
  const language = t.rules.labels.languageNames[issue.language];
  const context = primaryLanguageOnly ? copy.primaryContext : copy.context(language, issue.market);
  const message =
    issue.kind === "optional" ? copy.optional(context) : copy[issue.kind](issue.value, context);
  return (
    <s-stack direction="block" gap="small-100">
      <s-paragraph>{message}</s-paragraph>
      {issue.manual && issue.kind !== "custom" ? <s-paragraph>{copy.manual}</s-paragraph> : null}
    </s-stack>
  );
}
