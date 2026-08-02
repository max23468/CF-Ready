import { createContext, RouterContextProvider } from "react-router";

export const databaseContext = createContext<D1Database>();

export function createAppContext(db: D1Database) {
  const context = new RouterContextProvider();
  context.set(databaseContext, db);
  return context;
}
