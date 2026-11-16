// SPDX-FileCopyrightText: 2026 Meddle S.r.l.
// SPDX-License-Identifier: Apache-2.0

/**
 * Auth-specific configuration, read from the same process environment as
 * `config/env.ts` but kept separate so only the auth module touches the JWT
 * secret and the user store.
 *
 * Default USERS_JSON provides three test accounts whose password hash is the
 * SHA-256 hex digest of the username itself (admin → sha256("admin"), etc.).
 * Replace USERS_JSON in production with a JSON array of real password hashes.
 *
 * Password hashes use SHA-256 hex strings (lowercase).  To generate one:
 *   node -e "process.stdout.write(require('crypto').createHash('sha256').update('password').digest('hex'))"
 */

import { createHash } from "node:crypto";
import process from "node:process";

/** The three roles the system recognises. */
export type Role = "admin" | "engineer" | "technician";

/** One entry in the user store. */
export interface UserRecord {
  readonly passwordHash: string;
  readonly role: Role;
}

/** The parsed auth configuration. */
export interface AuthConfig {
  /** The HMAC-SHA256 signing secret; never empty. */
  readonly jwtSecret: string;
  /** Duration string such as "8h", passed directly to {@link configureJwt}. */
  readonly jwtExpiresIn: string;
  /** Map from username to their hashed credential and role. */
  readonly users: ReadonlyMap<string, UserRecord>;
}

// ---------------------------------------------------------------------------
// Default users — SHA-256(username) as the password hash
// ---------------------------------------------------------------------------

function sha256hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** The three default test accounts shipped with the PoC. */
const DEFAULT_USERS: ReadonlyMap<string, UserRecord> = new Map([
  ["admin", { passwordHash: sha256hex("admin"), role: "admin" }],
  ["engineer", { passwordHash: sha256hex("engineer"), role: "engineer" }],
  ["technician", { passwordHash: sha256hex("technician"), role: "technician" }],
]);

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

const VALID_ROLES: ReadonlySet<string> = new Set<Role>(["admin", "engineer", "technician"]);

function parseUsersJson(raw: string): ReadonlyMap<string, UserRecord> {
  if (raw.trim() === "" || raw.trim() === "[]") return DEFAULT_USERS;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("USERS_JSON is not valid JSON");
  }

  // Accept either an array of [username, record] tuples or an object map
  let entries: Array<[string, unknown]>;
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) return DEFAULT_USERS;
    entries = parsed as Array<[string, unknown]>;
  } else if (typeof parsed === "object" && parsed !== null) {
    entries = Object.entries(parsed as Record<string, unknown>);
  } else {
    throw new Error("USERS_JSON must be a JSON object or array of [username, record] pairs");
  }

  const map = new Map<string, UserRecord>();
  for (const entry of entries) {
    // Array-of-pairs form: [username, {passwordHash, role}]
    if (Array.isArray(entry) && entry.length === 2) {
      const [username, record] = entry as [unknown, unknown];
      assertUserRecord(username, record, map);
    } else if (typeof entry === "object" && entry !== null && !Array.isArray(entry)) {
      // Object-of-entries form coming from Object.entries
      const [username, record] = entry as [string, unknown];
      assertUserRecord(username, record, map);
    } else {
      throw new Error("USERS_JSON: each entry must be [username, {passwordHash, role}]");
    }
  }

  if (map.size === 0) return DEFAULT_USERS;
  return map;
}

function assertUserRecord(username: unknown, record: unknown, into: Map<string, UserRecord>): void {
  if (typeof username !== "string" || username.trim() === "") {
    throw new Error("USERS_JSON: username must be a non-empty string");
  }
  if (typeof record !== "object" || record === null) {
    throw new Error(`USERS_JSON: record for "${username}" must be an object`);
  }
  const r = record as Record<string, unknown>;
  if (typeof r["passwordHash"] !== "string") {
    throw new Error(`USERS_JSON: "${username}".passwordHash must be a string`);
  }
  if (!VALID_ROLES.has(r["role"] as string)) {
    throw new Error(`USERS_JSON: "${username}".role must be admin, engineer or technician`);
  }
  into.set(username.trim(), {
    passwordHash: r["passwordHash"] as string,
    role: r["role"] as Role,
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse auth configuration from `process.env`.
 *
 * Throws if `JWT_SECRET` is absent or empty.
 */
export function loadAuthConfig(source: NodeJS.ProcessEnv = process.env): AuthConfig {
  const isProd = source["NODE_ENV"] === "production";
  const jwtSecret =
    source["JWT_SECRET"] ??
    (isProd ? "" : "dev-insecure-jwt-secret-min-32-chars-change-for-production");
  if (jwtSecret.trim() === "") {
    throw new Error(
      "JWT_SECRET is required in production but not set. " +
        "Generate one with: openssl rand -hex 32",
    );
  }

  const jwtExpiresIn = source["JWT_EXPIRES_IN"] ?? "8h";
  const usersJson = source["USERS_JSON"] ?? "[]";

  const users = parseUsersJson(usersJson);

  return { jwtSecret, jwtExpiresIn, users };
}
