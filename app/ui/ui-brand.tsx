export function BrandMark() {
  return (
    <s-box inlineSize="32px">
      <s-image src="/cf-ready-mark.svg" alt="" aspectRatio="1/1" objectFit="contain" />
    </s-box>
  );
}

export function BrandLockup({ alt = "" }: { alt?: string }) {
  return (
    <s-box inlineSize="128px">
      <s-image src="/cf-ready-lockup.svg" alt={alt} aspectRatio="16/3" objectFit="contain" />
    </s-box>
  );
}
