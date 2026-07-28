import { expect, test } from "vitest";
import { findPocValidation, mutationError, queryContext } from "../app/validation-poc.server";

const validation = {
  id: "gid://shopify/Validation/1",
  title: "titolo modificato",
  enabled: false,
  blockOnFailure: false,
  shopifyFunction: { handle: "cf-ready-validation" },
  metafield: { jsonValue: { pocVersion: 999 } },
};

test("pagina tutte le Validation e usa il Function handle come identità", async () => {
  const cursors: unknown[] = [];
  const pages = [
    {
      data: {
        shop: { name: "CF Ready Dev", shopAddress: { countryCodeV2: "IT" } },
        validations: {
          nodes: [],
          pageInfo: { hasNextPage: true, endCursor: "page-2" },
        },
      },
    },
    {
      data: {
        shop: { name: "CF Ready Dev", shopAddress: { countryCodeV2: "IT" } },
        validations: {
          nodes: [validation],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    },
  ];
  const data = await queryContext({
    graphql: async (_query, options) => {
      cursors.push(options?.variables?.after);
      return Response.json(pages.shift());
    },
  });

  expect(cursors).toEqual([null, "page-2"]);
  expect(findPocValidation(data.validations.nodes)?.id).toBe(validation.id);
});

test("trasforma una risposta GraphQL senza data in errore operativo", () => {
  expect(mutationError({ errors: [{ message: "errore temporaneo" }] }, "validationCreate")).toBe(
    "Operazione Shopify non riuscita.",
  );
});
