import { describe, expect, test } from "vitest";
import {
  APP_ERROR_CODES,
  localizedError,
  parseAppErrorCode,
  parseStoredAppErrorCode,
} from "../app/app-error";
import { texts } from "../app/i18n";

describe("contratto errori applicativi", () => {
  test("accetta soltanto i codici canonici", () => {
    expect(APP_ERROR_CODES.every((code) => parseAppErrorCode(code) === code)).toBe(true);
    expect(parseAppErrorCode("future_error")).toBeNull();
    expect(parseAppErrorCode(null)).toBeNull();
  });

  test("usa il copy localizzato quando esiste e il fallback per errori interni o futuri", () => {
    const errors = texts("it").errors;
    expect(localizedError(errors, "validation_locked")).toBe(errors.validation_locked);
    expect(localizedError(errors, "entitlement_write_failed")).toBe(errors.generic);
    expect(localizedError(errors, "future_error")).toBe(errors.generic);
  });

  test("non trasforma un errore persistito sconosciuto in assenza di errore", () => {
    expect(parseStoredAppErrorCode("validation_locked")).toBe("validation_locked");
    expect(parseStoredAppErrorCode("future_error")).toBe("generic");
    expect(parseStoredAppErrorCode(null)).toBeNull();
    expect(parseStoredAppErrorCode("")).toBeNull();
  });
});
