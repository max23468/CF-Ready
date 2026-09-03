import type { ReactElement, ReactNode } from "react";
import { isValidElement } from "react";
import { expect, test, vi } from "vitest";

vi.mock("react-router", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-router")>();
  return {
    ...original,
    useLoaderData: () => ({ apiKey: "test-api-key", locale: "it" }),
  };
});

import App, { loader } from "../app/root";

function elements(node: ReactNode): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement(node)) return [];
  return [node, ...elements((node.props as { children?: ReactNode }).children)];
}

test("il documento espone chiave App Bridge e lingua risolta dalla richiesta", () => {
  expect(
    loader({
      request: new Request("https://cf-ready.test/app?locale=it-IT"),
    } as never),
  ).toMatchObject({ locale: "it", apiKey: expect.any(String) });
});

test("App Bridge e Polaris vengono caricati una sola volta nel head", () => {
  const document = elements(App());
  const head = document.find((element) => element.type === "head");
  if (!head) throw new Error("head del documento assente");

  const headElements = elements(head);
  const appBridge = headElements.filter(
    (element) =>
      element.type === "script" &&
      (element.props as { src?: string }).src ===
        "https://cdn.shopify.com/shopifycloud/app-bridge.js",
  );
  const polaris = headElements.filter(
    (element) =>
      element.type === "script" &&
      (element.props as { src?: string }).src === "https://cdn.shopify.com/shopifycloud/polaris.js",
  );

  expect(appBridge).toHaveLength(1);
  expect(appBridge[0].props).toMatchObject({ "data-api-key": "test-api-key" });
  expect(
    headElements.filter(
      (element) =>
        element.type === "meta" && (element.props as { name?: string }).name === "shopify-api-key",
    ),
  ).toHaveLength(0);
  expect(polaris).toHaveLength(1);
  expect(document.filter((element) => element.type === "script")).toHaveLength(2);
  expect(
    headElements.filter(
      (element) =>
        element.type === "meta" &&
        (element.props as { name?: string; content?: string }).name === "shopify-debug" &&
        (element.props as { content?: string }).content === "web-vitals",
    ),
  ).toHaveLength(1);
});
