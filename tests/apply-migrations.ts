import { afterAll, beforeAll, vi } from "vitest";

import { clearDatabases, resetDatabase } from "./support/database";

// Con `isolate: false` i file condividono worker e storage (regole in AGENTS.md). Il registro
// dei moduli si azzera prima degli import del file, altrimenti un modulo importato prima
// conserverebbe i `vi.mock` di un altro file; D1 riparte dallo schema migrato e resta vuoto.
vi.resetModules();

beforeAll(resetDatabase);

afterAll(clearDatabases);
