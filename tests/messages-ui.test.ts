import { expect, test, vi } from "vitest";
import { DEFAULT_CONFIG } from "../app/config";
import { texts } from "../app/i18n";
import { rebaseMessageDraft, messageSubmission, updateMessageDraft } from "../app/messages-draft";
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

test("soltanto il successo con readback evita la seconda lettura della pagina", () => {
  for (const [actionResult, expected] of [
    [{ ok: true, saved: { configHash: "verificata" } }, false],
    [{ ok: false, errorCode: "config_conflict" }, true],
    [{ ok: true, labelsErrorCode: "checkout_labels_partial_sync" }, true],
    [{ ok: true }, true],
  ] as const) {
    expect(
      skipRevalidationWhenLeaving({ actionResult, defaultShouldRevalidate: true } as never),
    ).toBe(expected);
  }
});

test("l'anteprima distingue l'etichetta attuale da quella proposta in entrambe le lingue", () => {
  expect(texts("it").messages).toMatchObject({
    previewHeading: "Esempio del messaggio",
    previewCurrentFieldLabel: "Etichetta attuale di Shopify",
    previewProposedFieldLabel: "Etichetta proposta da CF Ready",
  });
  expect(texts("en").messages).toMatchObject({
    previewHeading: "Message example",
    previewCurrentFieldLabel: "Current Shopify label",
    previewProposedFieldLabel: "Label proposed by CF Ready",
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
