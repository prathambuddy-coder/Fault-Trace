// SPDX-FileCopyrightText: 2026 Meddle S.r.l.
// SPDX-License-Identifier: Apache-2.0

/**
 * Minimal JWT implementation using Node.js built-in `crypto` (HMAC-SHA256,
 * base64url encoding).  No third-party JWT library is required.
 *
 * Only HS256 is supported.  The signing key is taken from {@link loadAuthConfig}
 * and must be at least one character long (enforced by `config/env.ts`).
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/** The decoded payload stored in every token this service issues. */
export interface JwtPayload {
  readonly sub: string;
  readonly role: "admin" | "engineer" | "technician";
  readonly iat: number;
  readonly exp: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function base64urlEncode(value: Buffer | string): string {
  const buf = typeof value === "string" ? Buffer.from(value, "utf8") : value;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(value: string): Buffer {
  // Restore standard base64 padding
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const rem = padded.length % 4;
  const b64 = rem === 0 ? padded : padded + "=".repeat(4 - rem);
  return Buffer.from(b64, "base64");
}

const HEADER = base64urlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));

function sign(data: string, secret: string): string {
  return base64urlEncode(createHmac("sha256", secret).update(data).digest());
}

/** Parse a duration string such as "8h", "30m", "3600s" into seconds. */
function parseDurationSeconds(duration: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(duration.trim());
  if (match === null) {
    throw new Error(`invalid JWT_EXPIRES_IN duration "${duration}"`);
  }
  const value = parseInt(match[1] as string, 10);
  const unit = match[2];
  switch (unit) {
    case "s":
      return value;
    case "m":
      return value * 60;
    case "h":
      return value * 3_600;
    case "d":
      return value * 86_400;
    default:
      throw new Error(`unknown duration unit "${unit}"`);
  }
}

// ---------------------------------------------------------------------------
// Module-level config — initialised once by `configureJwt`
// ---------------------------------------------------------------------------

let _secret = "";
let _ttlSeconds = 8 * 3_600;

/** Call this once at start-up with the values from {@link loadAuthConfig}. */
export function configureJwt(secret: string, expiresIn: string): void {
  if (secret.length === 0) throw new Error("JWT_SECRET must not be empty");
  _secret = secret;
  _ttlSeconds = parseDurationSeconds(expiresIn);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Sign a new token.  `iat` and `exp` are added automatically.
 */
export function signToken(payload: Omit<JwtPayload, "iat" | "exp">): string {
  const now = Math.floor(Date.now() / 1_000);
  const full: JwtPayload = { ...payload, iat: now, exp: now + _ttlSeconds };
  const body = base64urlEncode(JSON.stringify(full));
  const signingInput = `${HEADER}.${body}`;
  const signature = sign(signingInput, _secret);
  return `${signingInput}.${signature}`;
}

/**
 * Verify a token.  Throws a plain `Error` on any failure (expired, tampered,
 * malformed).  The caller (middleware) maps it to an HTTP 401.
 */
export function verifyToken(token: string): JwtPayload {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed JWT: wrong number of parts");

  const [headerB64, bodyB64, sigB64] = parts as [string, string, string];
  const signingInput = `${headerB64}.${bodyB64}`;
  const expected = sign(signingInput, _secret);

  // Constant-time comparison to prevent timing attacks
  const sigBuf = Buffer.from(sigB64, "ascii");
  const expectedBuf = Buffer.from(expected, "ascii");
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    throw new Error("invalid JWT signature");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(base64urlDecode(bodyB64).toString("utf8"));
  } catch {
    throw new Error("malformed JWT: cannot parse payload");
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof (payload as Record<string, unknown>)["sub"] !== "string" ||
    typeof (payload as Record<string, unknown>)["role"] !== "string" ||
    typeof (payload as Record<string, unknown>)["iat"] !== "number" ||
    typeof (payload as Record<string, unknown>)["exp"] !== "number"
  ) {
    throw new Error("malformed JWT: missing required claims");
  }

  const p = payload as JwtPayload;
  const nowSeconds = Math.floor(Date.now() / 1_000);
  if (p.exp < nowSeconds) throw new Error("JWT expired");

  const validRoles: ReadonlySet<string> = new Set(["admin", "engineer", "technician"]);
  if (!validRoles.has(p.role)) throw new Error("JWT contains unknown role");

  return p;
}
