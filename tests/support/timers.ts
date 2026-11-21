import { vi } from "vitest";

// Riferimento preso prima di qualsiasi timer finto: serve a cedere il passo all'I/O reale.
const realSetTimeout = globalThis.setTimeout;

// Backoff e attese del codice girano con timer finti: i retry restano veri ma istantanei.
// Il ciclo avanza i timer finché l'operazione non si conclude, anche quando un'attesa nasce
// dopo una lettura D1 reale. Un test che governa già i timer avanza il tempo da sé.
export async function withInstantBackoff<T>(start: () => Promise<T>): Promise<T> {
  if (vi.isFakeTimers()) return start();
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  try {
    let settled = false;
    const pending = start().finally(() => {
      settled = true;
    });
    // Il rifiuto resta al chiamante; qui serve solo a non segnalarlo come non gestito.
    pending.catch(() => undefined);
    while (!settled) {
      await vi.runOnlyPendingTimersAsync();
      if (!settled) await new Promise((resolve) => realSetTimeout(resolve, 0));
    }
    return await pending;
  } finally {
    vi.useRealTimers();
  }
}
