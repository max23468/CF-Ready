import assert from "node:assert/strict";
import test from "node:test";

import { assertWithinClientBundleBudget, CLIENT_BUNDLE_BUDGET } from "./check-client-bundle.mjs";

test("il bundle client resta entro il budget", () => {
  assert.doesNotThrow(() => assertWithinClientBundleBudget(CLIENT_BUNDLE_BUDGET));
});

test("il gate blocca un bundle client oltre il budget", () => {
  assert.throws(
    () => assertWithinClientBundleBudget(CLIENT_BUNDLE_BUDGET + 1),
    /exceeds 350 KiB budget/,
  );
});
