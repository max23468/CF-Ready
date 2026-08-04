import { createContext, RouterContextProvider } from "react-router";

export const databaseContext = createContext<D1Database>();
export type WaitUntil = (promise: Promise<unknown>) => void;
export const waitUntilContext = createContext<WaitUntil | undefined>(undefined);

export function createAppContext(db: D1Database, waitUntil?: WaitUntil) {
  const context = new RouterContextProvider();
  context.set(databaseContext, db);
  if (waitUntil) context.set(waitUntilContext, waitUntil);
  return context;
}
