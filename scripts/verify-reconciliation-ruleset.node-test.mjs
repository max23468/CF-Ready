import assert from "node:assert/strict";
import test from "node:test";
import {
  reconciliationActorId,
  verifyReconciliationRuleset,
} from "./verify-reconciliation-ruleset.mjs";

const expectedRuleset = {
  name: "develop governance",
  enforcement: "active",
  target: "branch",
  bypass_actors: [{ actor_id: 4735849, actor_type: "Integration", bypass_mode: "always" }],
};

test("accetta soltanto il bypass Integration dedicato", () => {
  assert.doesNotThrow(() => verifyReconciliationRuleset(expectedRuleset, 4735849));
  assert.throws(
    () =>
      verifyReconciliationRuleset(
        {
          ...expectedRuleset,
          bypass_actors: [
            ...expectedRuleset.bypass_actors,
            { actor_id: 5, actor_type: "RepositoryRole", bypass_mode: "always" },
          ],
        },
        4735849,
      ),
    /sola GitHub App/,
  );
});

test("rifiuta actor ID mancanti o non sicuri", () => {
  assert.equal(reconciliationActorId("4735849"), 4735849);
  for (const value of [undefined, "", "0", "-1", "9007199254740992"]) {
    assert.throws(() => reconciliationActorId(value), /actor ID valido/);
  }
});
