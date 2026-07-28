import type {
  CartValidationsGenerateRunInput,
  CartValidationsGenerateRunResult,
} from "../generated/api";

const allow: CartValidationsGenerateRunResult = {
  operations: [{ validationAdd: { errors: [] } }],
};

export function cartValidationsGenerateRun(
  input: CartValidationsGenerateRunInput,
): CartValidationsGenerateRunResult {
  try {
    const config = input.validation.metafield?.jsonValue;
    if (
      input.buyerJourney.step !== "CHECKOUT_COMPLETION" ||
      !config ||
      typeof config !== "object" ||
      Array.isArray(config) ||
      config.pocVersion !== 1 ||
      config.enabled !== true
    ) {
      return allow;
    }

    const taxCode = input.cart.localizedFields.find(
      ({ key }) => key === "TAX_CREDENTIAL_IT",
    );
    if (!taxCode || taxCode.value?.trim()) return allow;

    return {
      operations: [
        {
          validationAdd: {
            errors: [
              {
                message: "PoC CF Ready: inserisci il Codice Fiscale.",
                target: "$.cart.localizedFields.TAX_CREDENTIAL_IT",
              },
            ],
          },
        },
      ],
    };
  } catch {
    return allow;
  }
}
