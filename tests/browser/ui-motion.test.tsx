import { expect, test } from "vitest";
import motionCss from "../../app/ui-motion.css?raw";

test.each([1440, 390])("il contenuto iniziale produce LCP a %i px", async (width) => {
  const frame = document.createElement("iframe");
  frame.style.width = `${width}px`;
  frame.style.height = "600px";
  // Un documento nuovo è necessario: LCP non riparte a ogni render React.
  frame.srcdoc = `<!doctype html><html lang="it"><head><style>${motionCss}</style>
    <script>
      window.lcp = [];
      new PerformanceObserver(list => window.lcp.push(...list.getEntries()))
        .observe({type: "largest-contentful-paint", buffered: true});
    </script></head><body>
      <main class="app-route-surface"><section class="cf-motion-reveal">
        <h1>Validazione attiva nel checkout</h1>
        <p>Codice Fiscale obbligatorio e validato. PEC facoltativa e validata.</p>
      </section></main>
    </body></html>`;
  document.body.append(frame);
  try {
    await expect
      .poll(
        () => (frame.contentWindow as (Window & { lcp?: PerformanceEntry[] }) | null)?.lcp?.length,
        { timeout: 2000 },
      )
      .toBeGreaterThan(0);
  } finally {
    frame.remove();
  }
});
