import { describe, expect, test } from "vitest";

import { callbackData, parseCallback, parseCommand } from "../app/owner-control/model";

import { parseOwnerControlUpdate } from "../app/owner-control/update.server";
import { parseFunnel } from "../app/reporting/funnel";
import {
  comparePerformanceVersions,
  parsePerformanceRows,
  parsePerformanceTimings,
} from "../app/reporting/performance";

import { CHAT_ID, OWNER_ID, messageUpdate, callbackUpdate } from "./support/owner-control";

describe("parser Control Center", () => {
  test("accetta comandi, argomenti e filtri in allowlist", () => {
    expect(parseCommand("/dashboard")).toEqual({ view: "dashboard" });
    expect(parseCommand("/shop atelier.myshopify.com")).toEqual({
      view: "shop",
      argument: "atelier.myshopify.com",
    });
    expect(parseCommand("/shops trial")).toEqual({ view: "shops", filter: "trial", page: 0 });
    expect(parseCommand("/shops sconosciuto")).toBeNull();
    expect(parseCommand("/dashboard extra")).toBeNull();
    expect(parseCommand(`/shop ${"x".repeat(161)}`)).toBeNull();
    expect(parseCommand("testo libero")).toBeNull();
  });

  test("versiona e limita callback, target, pagina e refresh", () => {
    const encoded = callbackData({ view: "shop", shopId: 42, page: 3, refresh: true });
    expect(encoded).toBe("oc1:o:16:3:r");
    expect(parseCallback(encoded)).toEqual({ view: "shop", shopId: 42, page: 3, refresh: true });
    expect(parseCallback("oc2:o:16:3")).toBeNull();
    expect(parseCallback("oc1:o:!:3")).toBeNull();
    expect(parseCallback("oc1:x:-:-1")).toBeNull();
    expect(parseCallback("x".repeat(65))).toBeNull();
    expect(callbackData({ view: "shops", filter: "issues" })).toBe("oc1:s:issues:0");
    expect(callbackData({ view: "help" })).toBe("oc1:x:-:0");
    expect(parseCallback("oc1:s:issues:0")).toEqual({
      view: "shops",
      filter: "issues",
      page: 0,
      refresh: false,
    });
    for (const invalid of [
      "oc1:z:-:0",
      "oc1:x:-:x",
      "oc1:x:-:10001",
      "oc1:x:-:0:no",
      "oc1:x:-:0:r:extra",
      "oc1:o:0:0",
      "oc1:s:no:0",
      "oc1:x:target:0",
    ]) {
      expect(parseCallback(invalid)).toBeNull();
    }
    expect(parseCommand("/shops")).toEqual({ view: "shops", filter: "all", page: 0 });
    expect(parseCommand("/shop")).toEqual({ view: "shop" });
  });

  test("autorizza solo messaggi e callback della chat privata owner", () => {
    expect(
      parseOwnerControlUpdate(messageUpdate("/help"), { chatId: CHAT_ID, userId: OWNER_ID }),
    ).toMatchObject({ result: "accepted", update: { kind: "message", action: { view: "help" } } });
    expect(
      parseOwnerControlUpdate(callbackUpdate(callbackData({ view: "help" })), {
        chatId: CHAT_ID,
        userId: OWNER_ID,
      }),
    ).toMatchObject({
      result: "accepted",
      update: { kind: "callback_query", messageId: 77, action: { view: "help" } },
    });
    expect(
      parseOwnerControlUpdate(messageUpdate("/help", { chatType: "group" }), {
        chatId: CHAT_ID,
        userId: OWNER_ID,
      }),
    ).toEqual({ result: "unauthorized" });
    expect(
      parseOwnerControlUpdate(
        { update_id: 9, edited_message: {} },
        { chatId: CHAT_ID, userId: OWNER_ID },
      ),
    ).toEqual({ result: "ignored" });
  });

  test("rifiuta strutture Telegram incomplete o ambigue", () => {
    const owner = { chatId: CHAT_ID, userId: OWNER_ID };
    const invalid = [
      null,
      {},
      { update_id: -1 },
      { update_id: 1, message: {}, callback_query: {} },
      { update_id: 1, message: null },
      { update_id: 1, callback_query: null },
      { update_id: 1, callback_query: { id: 1 } },
      { update_id: 1, callback_query: { id: "x", from: null, message: {} } },
      { update_id: 1, callback_query: { id: "x", from: {}, message: {} } },
      {
        update_id: 1,
        callback_query: {
          id: "x",
          from: { id: Number(OWNER_ID) },
          message: { message_id: -1, chat: { id: Number(CHAT_ID), type: "private" } },
        },
      },
    ];
    for (const payload of invalid)
      expect(parseOwnerControlUpdate(payload, owner).result).toBeDefined();

    const noText = messageUpdate("/help") as Record<string, unknown>;
    delete (noText.message as Record<string, unknown>).text;
    expect(parseOwnerControlUpdate(noText, owner)).toEqual({ result: "ignored" });

    const noData = callbackUpdate("x") as Record<string, unknown>;
    delete (noData.callback_query as Record<string, unknown>).data;
    expect(parseOwnerControlUpdate(noData, owner)).toMatchObject({ result: "ignored" });

    const noCallbackMessage = callbackUpdate("x") as Record<string, unknown>;
    delete (noCallbackMessage.callback_query as Record<string, unknown>).message;
    expect(parseOwnerControlUpdate(noCallbackMessage, owner)).toEqual({ result: "invalid" });
    expect(parseOwnerControlUpdate(callbackUpdate("x", { chatId: 999 }), owner)).toEqual({
      result: "unauthorized",
    });
  });
});

describe("reporting condiviso", () => {
  test("classifica righe performance e confronti stabili, insufficienti e regressivi", () => {
    expect(() => parsePerformanceRows(null)).toThrow("mancanti");
    for (const row of [
      {},
      { metric_name: "TTFB", app_version: "1", app_route: "home", sample_count: 100, p75: 1 },
      { metric_name: "LCP", app_version: 1, app_route: "home", sample_count: 100, p75: 1 },
      { metric_name: "LCP", app_version: "1", app_route: 1, sample_count: 100, p75: 1 },
      { metric_name: "LCP", app_version: "1", app_route: "home", sample_count: 0, p75: 1 },
      { metric_name: "LCP", app_version: "1", app_route: "home", sample_count: 100, p75: -1 },
    ]) {
      expect(() => parsePerformanceRows([row])).toThrow("non valida");
    }

    const groups = parsePerformanceRows([
      { metric_name: "LCP", app_version: "1.0.0", app_route: "home", sample_count: 100, p75: 1000 },
      { metric_name: "LCP", app_version: "1.1.0", app_route: "home", sample_count: 100, p75: 1300 },
      { metric_name: "INP", app_version: "1.0.0", app_route: "rules", sample_count: 50, p75: 100 },
      { metric_name: "INP", app_version: "1.1.0", app_route: "rules", sample_count: 50, p75: 140 },
      { metric_name: "CLS", app_version: "1.1.0", app_route: "all", sample_count: 100, p75: 0.2 },
    ]);
    expect(groups.map(({ status }) => status)).toEqual([
      "pass",
      "pass",
      "insufficient_samples",
      "insufficient_samples",
      "fail",
    ]);

    expect(() => comparePerformanceVersions(groups, [], "", "1.1.0")).toThrow("distinte");
    expect(() => comparePerformanceVersions(groups, [], "1.0.0", "1.0.0")).toThrow("distinte");
    const compared = comparePerformanceVersions(
      groups,
      [
        {
          app_version: "1.0.0",
          app_route: "home",
          timing_name: "auth",
          sample_count: 100,
          p75: 10,
        },
        {
          app_version: "1.1.0",
          app_route: "home",
          timing_name: "auth",
          sample_count: 100,
          p75: 15,
        },
      ],
      "1.0.0",
      "1.1.0",
    );
    expect(compared.status).toBe("compared");
    expect(compared.alerts).toHaveLength(1);
    expect(compared.comparisons.map(({ status }) => status)).toContain("insufficient_samples");
    expect(comparePerformanceVersions([], [], "1.0.0", "1.1.0").status).toBe(
      "insufficient_samples",
    );
  });

  test("valida durate server e coorti ai confini", () => {
    expect(() => parsePerformanceTimings(null)).toThrow("mancanti");
    for (const row of [
      {},
      { timing_name: "unknown", app_version: "1", app_route: "home", sample_count: 1, p75: 1 },
      { timing_name: "auth", app_version: 1, app_route: "home", sample_count: 1, p75: 1 },
      { timing_name: "auth", app_version: "1", app_route: 1, sample_count: 1, p75: 1 },
      { timing_name: "auth", app_version: "1", app_route: "home", sample_count: 0, p75: 1 },
      { timing_name: "auth", app_version: "1", app_route: "home", sample_count: 1, p75: Infinity },
    ]) {
      expect(() => parsePerformanceTimings([row])).toThrow("non valida");
    }
    expect(
      parsePerformanceTimings([
        { timing_name: "auth", app_version: "1", app_route: "home", sample_count: 1, p75: 2 },
      ]),
    ).toHaveLength(1);

    expect(() => parseFunnel(null)).toThrow("mancanti");
    const base = {
      cohort: "2026-36",
      installed: 10,
      rules_observed: 8,
      trial_observed: 7,
      activation_observed: 6,
      rules_not_observed: 2,
      configured_without_activation: 2,
      trial_without_activation: 1,
      uninstalled_before_observed_activation: 1,
      activation_without_observed_trial: 0,
      paid_plan_observed: 2,
      paid_plan_after_activation: 1,
      uninstalled_after_activation: 1,
      seconds_to_rules: null,
      seconds_to_trial: 2,
      seconds_to_activation: 3,
      seconds_to_paid_plan: 4,
    };
    expect(parseFunnel([base])[0]).toMatchObject({ activation_rate: 0.6, evidence: "descriptive" });
    expect(
      parseFunnel([
        {
          ...base,
          installed: 0,
          rules_observed: 0,
          trial_observed: 0,
          activation_observed: 0,
          rules_not_observed: 0,
          configured_without_activation: 0,
          trial_without_activation: 0,
          uninstalled_before_observed_activation: 0,
          paid_plan_observed: 0,
          paid_plan_after_activation: 0,
          uninstalled_after_activation: 0,
        },
      ])[0],
    ).toMatchObject({ activation_rate: null, evidence: "small_cohort" });
    expect(() => parseFunnel([{ ...base, cohort: "x" }])).toThrow("Coorte");
    expect(() => parseFunnel([{ ...base, rules_observed: 11 }])).toThrow("Coorte");
    expect(() => parseFunnel([{ ...base, paid_plan_after_activation: 7 }])).toThrow("Coorte");
    expect(() => parseFunnel([{ ...base, uninstalled_after_activation: 7 }])).toThrow("Coorte");
    expect(() => parseFunnel([{ ...base, seconds_to_rules: -1 }])).toThrow("Durata");
  });
});
