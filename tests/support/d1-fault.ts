import { onTestFinished } from "vitest";

type D1FaultOptions = {
  // Frammento che identifica l'istruzione colpita. Se il test termina senza averla incontrata,
  // fallisce: una query rinominata non può trasformare il guasto in un test che passa a vuoto.
  sql: string;
  // Sostituisce il risultato di `first`; chi lancia simula un errore di D1.
  first?: () => unknown;
  run?: () => unknown;
  // Fa fallire il batch che contiene l'istruzione.
  batchError?: Error;
  // Con `false` il guasto si comporta da sonda: conta le esecuzioni senza alterarle.
  active?: () => boolean;
};

export function d1WithFault(db: D1Database, options: D1FaultOptions) {
  const faulted = new WeakMap<object, D1PreparedStatement>();
  let hits = 0;

  const wrap = (statement: D1PreparedStatement): D1PreparedStatement => {
    const wrapped: D1PreparedStatement = new Proxy(statement, {
      get(target, property) {
        if (property === "bind") {
          return (...values: unknown[]) => wrap(target.bind(...values));
        }
        if (property === "first") {
          return async (...args: []) => {
            hits += 1;
            if (!options.first || options.active?.() === false) return target.first(...args);
            return options.first();
          };
        }
        if (property === "run") {
          return async () => {
            hits += 1;
            if (!options.run || options.active?.() === false) return target.run();
            return options.run();
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    faulted.set(wrapped, statement);
    return wrapped;
  };

  const proxy = new Proxy(db, {
    get(target, property) {
      if (property === "prepare") {
        return (query: string) => {
          const statement = target.prepare(query);
          return query.includes(options.sql) ? wrap(statement) : statement;
        };
      }
      if (property === "batch") {
        return async (statements: D1PreparedStatement[]) => {
          const touched = statements.some((statement) => faulted.has(statement));
          if (touched) hits += 1;
          if (touched && options.batchError) throw options.batchError;
          return target.batch(statements.map((statement) => faulted.get(statement) ?? statement));
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });

  onTestFinished(() => {
    if (hits === 0) throw new Error(`Guasto D1 mai eseguito: «${options.sql}» non è stata usata.`);
  });

  return { db: proxy, hits: () => hits };
}
