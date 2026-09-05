import { expect, test, vi } from "vitest";
import { DEFAULT_CONFIG } from "../app/config";
import { texts } from "../app/i18n";
import {
  rebaseMessageDraft,
  messageSubmission,
  shouldShowMessageCounter,
  updateMessageDraft,
} from "../app/messages-draft";
import { setSaveBarVisibility } from "../app/save-bar";
import { skipRevalidationWhenLeaving } from "../app/revalidation";

test("la Save Bar programmatica segue lo stato custom dei messaggi", () => {
  const show = vi.fn(() => Promise.resolve());
  const hide = vi.fn(() => Promise.resolve());
  vi.stubGlobal("shopify", { saveBar: { show, hide } });

  setSaveBarVisibility("messages", true);
  setSaveBarVisibility("messages", false);

  expect(show).toHaveBeenCalledWith("messages");
  expect(hide).toHaveBeenCalledWith("messages");
});

test("Save Bar assente e navigazioni verso billing restano fail-safe", () => {
  vi.stubGlobal("shopify", undefined);
  expect(() => setSaveBarVisibility("messages", true)).not.toThrow();

  expect(
    skipRevalidationWhenLeaving({
      actionResult: { confirmationUrl: "https://shopify.example/approve" },
      defaultShouldRevalidate: true,
    } as never),
  ).toBe(false);
  expect(
    skipRevalidationWhenLeaving({ actionResult: null, defaultShouldRevalidate: true } as never),
  ).toBe(true);
  expect(
    skipRevalidationWhenLeaving({
      actionResult: { ok: true },
      defaultShouldRevalidate: false,
    } as never),
  ).toBe(false);
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

test("la risposta normalizzata aggiorna solo i campi non più modificati dopo l'invio", () => {
  const sent = updateMessageDraft(DEFAULT_CONFIG.messages, "it", "taxCodeRequired", "Messaggio ");
  const edited = updateMessageDraft(sent, "en", "pecInvalid", "New draft");
  const saved = updateMessageDraft(sent, "it", "taxCodeRequired", "Messaggio");
  const next = rebaseMessageDraft(sent, edited, saved);
  expect(next.it.taxCodeRequired).toBe("Messaggio");
  expect(next.en.pecInvalid).toBe("New draft");
  expect(sent.it.taxCodeRequired).toBe("Messaggio ");
});
