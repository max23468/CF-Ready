import { expect, test, vi } from "vitest";
import { notifySaveBarFields } from "../app/save-bar";

test("il ripristino notifica la Save Bar dopo il remount dei messaggi", () => {
  const fields = Array.from({ length: 4 }, () => ({ dispatchEvent: vi.fn() }));
  const querySelectorAll = vi.fn(() => fields);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => callback(0));

  notifySaveBarFields({ querySelectorAll } as unknown as HTMLFormElement, "it.");

  expect(querySelectorAll).toHaveBeenCalledWith('[name^="it."]');
  for (const field of fields) {
    expect(field.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "input", bubbles: true }),
    );
  }
});
