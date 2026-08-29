import { expect, test, vi } from "vitest";
import { DEFAULT_CONFIG } from "../app/config";
import { texts } from "../app/i18n";
import {
  messageSubmission,
  shouldShowMessageCounter,
  updateMessageDraft,
} from "../app/messages-draft";
import { setSaveBarVisibility } from "../app/save-bar";

test("la Save Bar programmatica segue lo stato custom dei messaggi", () => {
  const show = vi.fn(() => Promise.resolve());
  const hide = vi.fn(() => Promise.resolve());
  vi.stubGlobal("shopify", { saveBar: { show, hide } });

  setSaveBarVisibility("messages", true);
  setSaveBarVisibility("messages", false);

  expect(show).toHaveBeenCalledWith("messages");
  expect(hide).toHaveBeenCalledWith("messages");
});

test("Salva serializza anche l'ultima battuta mentre la vista derivata è ancora precedente", () => {
  const rendered = DEFAULT_CONFIG.messages;
  const current = updateMessageDraft(rendered, "it", "taxCodeRequired", "Ultima battuta");

  expect(rendered.it.taxCodeRequired).not.toBe("Ultima battuta");
  expect(messageSubmission("hash-corrente", current)).toMatchObject({
    configHash: "hash-corrente",
    "it.taxCodeRequired": "Ultima battuta",
  });
});

test("il contatore compare durante la modifica o quando il limite è vicino", () => {
  expect(shouldShowMessageCounter(52, false)).toBe(false);
  expect(shouldShowMessageCounter(52, true)).toBe(true);
  expect(shouldShowMessageCounter(159, false)).toBe(false);
  expect(shouldShowMessageCounter(160, false)).toBe(true);
  expect(shouldShowMessageCounter(201, false)).toBe(true);
});

test("l'anteprima spiega il momento e l'esito del controllo in entrambe le lingue", () => {
  expect(texts("it").messages).toMatchObject({
    previewContext: "Quando il cliente prova a completare l’ordine",
    previewErrorHeading: "Ordine non completato",
    previewSelected: "Messaggio selezionato",
  });
  expect(texts("en").messages).toMatchObject({
    previewContext: "When the customer tries to complete the order",
    previewErrorHeading: "Order can’t be completed",
    previewSelected: "Selected message",
  });
});
