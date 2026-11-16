// SPDX-FileCopyrightText: 2026 Meddle S.r.l.
// SPDX-License-Identifier: Apache-2.0

/**
 * CMMS Webhook Dispatcher — Phase 4 Production Integration
 *
 * When a diagnosis ticket is created, this module optionally sends a webhook
 * notification to external CMMS (SAP PM, IBM Maximo, Jira SM, PagerDuty, Slack, Teams).
 *
 * Configure via environment variables — all optional; leave unset to disable.
 */

import { createHmac } from "node:crypto";
import process from "node:process";

export interface WebhookTicket {
  readonly id: string;
  readonly fault: string;
  readonly confidence: number;
  readonly severity: "review" | "ticket";
  readonly summary: string;
  readonly unitId: string;
  readonly openedAt: Date;
  readonly evidence: string;
}

export interface WebhookConfig {
  readonly slackWebhookUrl: string | null;
  readonly teamsWebhookUrl: string | null;
  readonly genericWebhookUrl: string | null;
  readonly genericWebhookSecret: string | null;
  readonly pagerdutyRoutingKey: string | null;
  readonly webhookTimeoutMs: number;
}

export function loadWebhookConfig(env: NodeJS.ProcessEnv = process.env): WebhookConfig {
  return {
    slackWebhookUrl: env["CMMS_SLACK_WEBHOOK_URL"] ?? null,
    teamsWebhookUrl: env["CMMS_TEAMS_WEBHOOK_URL"] ?? null,
    genericWebhookUrl: env["CMMS_WEBHOOK_URL"] ?? null,
    genericWebhookSecret: env["CMMS_WEBHOOK_SECRET"] ?? null,
    pagerdutyRoutingKey: env["CMMS_PAGERDUTY_KEY"] ?? null,
    webhookTimeoutMs: parseInt(env["CMMS_WEBHOOK_TIMEOUT_MS"] ?? "5000", 10),
  };
}

async function sendWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Dispatch a Slack Block Kit message for a new fault ticket. */
async function notifySlack(url: string, ticket: WebhookTicket, timeoutMs: number): Promise<void> {
  const severityEmoji = ticket.severity === "ticket" ? "🚨" : "⚠️";
  const pct = Math.round(ticket.confidence * 100);
  const body = {
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `${severityEmoji} Industrial Fault Triage Alert` },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Fault:* \`${ticket.fault}\`` },
          { type: "mrkdwn", text: `*Confidence:* ${pct}%` },
          { type: "mrkdwn", text: `*Severity:* ${ticket.severity.toUpperCase()}` },
          { type: "mrkdwn", text: `*Unit:* ${ticket.unitId}` },
          { type: "mrkdwn", text: `*Time:* ${ticket.openedAt.toISOString()}` },
          { type: "mrkdwn", text: `*Ticket ID:* ${ticket.id}` },
        ],
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*Diagnostic Summary:* ${ticket.summary}` },
      },
      { type: "context", elements: [{ type: "mrkdwn", text: `*Evidence:* ${ticket.evidence}` }] },
    ],
  };
  await sendWithTimeout(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    timeoutMs,
  );
}

/** Dispatch a Teams Adaptive Card for a new fault ticket. */
async function notifyTeams(url: string, ticket: WebhookTicket, timeoutMs: number): Promise<void> {
  const pct = Math.round(ticket.confidence * 100);
  const body = {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            {
              type: "TextBlock",
              size: "Large",
              weight: "Bolder",
              text: "🚨 Industrial Fault Triage Alert",
            },
            {
              type: "FactSet",
              facts: [
                { title: "Fault", value: ticket.fault },
                { title: "Confidence", value: `${pct}%` },
                { title: "Severity", value: ticket.severity.toUpperCase() },
                { title: "Unit ID", value: ticket.unitId },
                { title: "Ticket ID", value: ticket.id },
              ],
            },
            { type: "TextBlock", text: ticket.summary, wrap: true },
          ],
        },
      },
    ],
  };
  await sendWithTimeout(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    timeoutMs,
  );
}

/** Dispatch a signed generic webhook (HMAC-SHA256 signature in X-FDP-Signature header). */
async function notifyGeneric(
  url: string,
  secret: string | null,
  ticket: WebhookTicket,
  timeoutMs: number,
): Promise<void> {
  const payload = JSON.stringify({ event: "fault.ticket.opened", ticket });
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret !== null && secret.length > 0) {
    const sig = createHmac("sha256", secret).update(payload).digest("hex");
    headers["X-FDP-Signature"] = `sha256=${sig}`;
  }
  await sendWithTimeout(url, { method: "POST", headers, body: payload }, timeoutMs);
}

/** Dispatch to all configured CMMS channels. Errors are logged but never thrown. */
export async function dispatchTicketWebhook(
  ticket: WebhookTicket,
  config: WebhookConfig,
  log?: { warn: (msg: string, ctx?: Record<string, unknown>) => void },
): Promise<void> {
  const tasks: Array<Promise<void>> = [];

  if (config.slackWebhookUrl) {
    tasks.push(
      notifySlack(config.slackWebhookUrl, ticket, config.webhookTimeoutMs).catch((err: unknown) => {
        log?.warn("Slack webhook failed", { err: String(err) });
      }),
    );
  }
  if (config.teamsWebhookUrl) {
    tasks.push(
      notifyTeams(config.teamsWebhookUrl, ticket, config.webhookTimeoutMs).catch((err: unknown) => {
        log?.warn("Teams webhook failed", { err: String(err) });
      }),
    );
  }
  if (config.genericWebhookUrl) {
    tasks.push(
      notifyGeneric(
        config.genericWebhookUrl,
        config.genericWebhookSecret,
        ticket,
        config.webhookTimeoutMs,
      ).catch((err: unknown) => {
        log?.warn("Generic CMMS webhook failed", { err: String(err) });
      }),
    );
  }

  if (tasks.length > 0) {
    await Promise.allSettled(tasks);
  }
}
