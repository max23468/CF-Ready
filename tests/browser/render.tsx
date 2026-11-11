import type { ReactElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// `cf workers types` dichiara un `Element` globale per HTMLRewriter che si fonde con quello
// del DOM: gli elementi Polaris, che ridefiniscono `setAttribute`, non gli sono più
// assegnabili. I test chiedono quindi solo ciò che usano: ricevere un evento.
export type EventReceiver = { dispatchEvent(event: Event): boolean };
// Per misurare un host Polaris bastano attributi, shadow root e rettangolo.
export type ShadowHost = Pick<Element, "getAttribute" | "getBoundingClientRect" | "shadowRoot">;

export type Rendered = {
  container: HTMLDivElement;
  root: Root;
  rerender(element: ReactElement): Promise<void>;
  unmount(): Promise<void>;
};

export async function render(element: ReactElement): Promise<Rendered> {
  const container = document.createElement("div");
  // `appendChild` e non `append`: lo stesso `Element` di HTMLRewriter ne copre la firma DOM.
  document.body.appendChild(container);
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

export async function dispatch(element: EventReceiver, event: Event): Promise<void> {
  await act(async () => element.dispatchEvent(event));
}

export async function click(element: EventReceiver): Promise<void> {
  await dispatch(element, new MouseEvent("click", { bubbles: true }));
}
