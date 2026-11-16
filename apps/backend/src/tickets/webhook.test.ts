// SPDX-FileCopyrightText: 2026 Meddle S.r.l.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";

import { dispatchTicketWebhook, loadWebhookConfig, type WebhookTicket } from "./webhook.ts";

const SAMPLE_TICKET: WebhookTicket = {
  id: "tkt-001",
  fault: "downstream_air_leak",
  confidence: 0.91,
  severity: "ticket",
  summary: "Downstream air leak detected with 91% confidence.",
  unitId: "cau-7",
  openedAt: new Date("2026-11-15T10:00:00Z"),
  evidence: "High pressure differential across dryer output.",
};

describe("loadWebhookConfig", () => {
  it("returns nulls when environment variables are unset", () => {
    const cfg = loadWebhookConfig({});
    expect(cfg.slackWebhookUrl).toBeNull();
    expect(cfg.teamsWebhookUrl).toBeNull();
    expect(cfg.genericWebhookUrl).toBeNull();
    expect(cfg.webhookTimeoutMs).toBe(5000);
  });

  it("reads configured environment variables", () => {
    const cfg = loadWebhookConfig({
      CMMS_SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/test",
      CMMS_WEBHOOK_TIMEOUT_MS: "3000",
    });
    expect(cfg.slackWebhookUrl).toBe("https://hooks.slack.com/services/test");
    expect(cfg.webhookTimeoutMs).toBe(3000);
  });
});

describe("dispatchTicketWebhook", () => {
  it("does nothing when no webhooks are configured", async () => {
    const log = { warn: vi.fn() };
    const cfg = loadWebhookConfig({});
    await expect(dispatchTicketWebhook(SAMPLE_TICKET, cfg, log)).resolves.toBeUndefined();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("handles failed webhook call gracefully without throwing", async () => {
    const log = { warn: vi.fn() };
    const cfg = {
      ...loadWebhookConfig({}),
      slackWebhookUrl: "http://127.0.0.1:1/fail",
      webhookTimeoutMs: 100,
    };
    await expect(dispatchTicketWebhook(SAMPLE_TICKET, cfg, log)).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalled();
  });
});
