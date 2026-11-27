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
  return (
    <s-stack direction="block" gap="small-100">
      <s-paragraph>
        {message} {copy.context(t.rules.labels.languageNames[issue.language], issue.market)}
      </s-paragraph>
      {issue.manual && issue.kind !== "custom" ? <s-paragraph>{copy.manual}</s-paragraph> : null}
    </s-stack>
  );
}
