export function RuleModeChoiceList<Mode extends string>({
  name,
  label,
  modes,
  selected,
  copy,
}: {
  name: "taxCode" | "pec";
  label: string;
  modes: readonly Mode[];
  selected: Mode;
  copy: Record<Mode | `${Mode}Help`, string>;
}) {
  return (
    <s-choice-list label={label} labelAccessibilityVisibility="exclusive" name={name}>
      {modes.map((mode) => (
        <s-choice key={mode} value={mode} selected={mode === selected}>
          {copy[mode]}
          <s-text slot="details">{copy[`${mode}Help`]}</s-text>
        </s-choice>
      ))}
    </s-choice-list>
  );
}
