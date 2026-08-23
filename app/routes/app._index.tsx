import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { skipRevalidationWhenLeaving } from "../revalidation";

export const loader = async (args: LoaderFunctionArgs) => {
  const server = await import("../features/home/home.server");
  return server.loader(args);
};

export const action = async (args: ActionFunctionArgs) => {
  const server = await import("../features/home/home.server");
  return server.action(args);
};

export const headers: HeadersFunction = (args) => boundary.headers(args);
export const shouldRevalidate = skipRevalidationWhenLeaving;

export { PlanChoice } from "../features/home/PlanChoice";
export { SetupGuide } from "../features/home/SetupGuide";
export { default } from "../features/home/HomePage";
