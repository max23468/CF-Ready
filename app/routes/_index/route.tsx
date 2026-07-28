import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  throw redirect(
    url.searchParams.has("shop") ? `/app?${url.searchParams.toString()}` : "/auth/login",
  );
};
