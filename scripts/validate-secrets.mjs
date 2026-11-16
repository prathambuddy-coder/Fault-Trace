// SPDX-FileCopyrightText: 2026 Meddle S.r.l.
// SPDX-License-Identifier: Apache-2.0

/**
 * Cross-platform secret validator for production deployment.
 * Usage: node scripts/validate-secrets.mjs
 */

import process from "node:process";

const REQUIRED_SECRETS = ["TYPESAFE_API_KEY", "JWT_SECRET"];

const INSECURE_DEFAULTS = [
  ["POSTGRES_PASSWORD", "fdp_admin"],
  ["PG_APP_PASSWORD", "app_rw"],
  ["PG_GT_PASSWORD", "gt_rw"],
  ["PG_EVAL_PASSWORD", "eval"],
  ["MQTT_GATEWAY_PASSWORD", "gateway"],
  ["MQTT_SIM_PASSWORD", "sim"],
  ["MQTT_BACKEND_DIAG_PASSWORD", "backend-diag"],
  ["MQTT_BACKEND_OPS_PASSWORD", "backend-ops"],
  ["JWT_SECRET", "change-me-generate-with-openssl-rand-hex-32"],
  ["JWT_SECRET", "dev-insecure-jwt-secret-min-32-chars-change-for-production"],
];

let errors = 0;

for (const varName of REQUIRED_SECRETS) {
  const val = process.env[varName];
  if (!val || val.trim() === "") {
    console.error(`ERROR: ${varName} is required for production but not set.`);
    errors++;
  }
}

for (const [varName, defaultVal] of INSECURE_DEFAULTS) {
  const val = process.env[varName];
  if (val && val.trim() === defaultVal) {
    console.error(`ERROR: ${varName} is still set to insecure default '${defaultVal}'.`);
    errors++;
  }
}

const jwtSecret = process.env["JWT_SECRET"] || "";
if (jwtSecret && jwtSecret.length < 32) {
  console.error(`ERROR: JWT_SECRET must be at least 32 characters (got ${jwtSecret.length}).`);
  errors++;
}

if (errors > 0) {
  console.error(`\nFound ${errors} secret validation error(s). Please fix them before deploying.`);
  process.exit(1);
} else {
  console.log("All production secrets passed validation.");
  process.exit(0);
}
