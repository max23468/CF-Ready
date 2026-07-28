import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function Home() {
  return (
    <s-page heading="CF Ready">
      <s-section heading="Configurazione">
        <s-paragraph>
          La base tecnica dell’app è pronta. Le regole di validazione saranno configurabili qui nel
          prossimo incremento.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
