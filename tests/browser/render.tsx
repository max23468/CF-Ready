import type { ReactElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

export type Rendered = {
  container: HTMLDivElement;
  root: Root;
  rerender(element: ReactElement): Promise<void>;
  unmount(): Promise<void>;
};

export async function render(element: ReactElement): Promise<Rendered> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const rerender = async (next: ReactElement) => {
    await act(async () => root.render(next));
  };
  const unmount = async () => {
    await act(async () => root.unmount());
    container.remove();
  };
  await rerender(element);
  return { container, root, rerender, unmount };
}

export async function dispatch(element: Element, event: Event): Promise<void> {
  await act(async () => element.dispatchEvent(event));
}

export async function click(element: Element): Promise<void> {
  await dispatch(element, new MouseEvent("click", { bubbles: true }));
}
