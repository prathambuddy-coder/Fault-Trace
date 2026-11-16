#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Meddle S.r.l.
# SPDX-License-Identifier: Apache-2.0
#
# Validates that required production secrets are set and not using insecure defaults.
# Run this before deploying: bash scripts/validate-secrets.sh
set -euo pipefail
ERRORS=0

check_set() {
  local var="$1"; local val="${!var:-}"
  if [[ -z "$val" ]]; then
    echo "ERROR: $var is not set" >&2; ERRORS=$((ERRORS+1))
  fi
}

check_not_default() {
  local var="$1"; local default="$2"; local val="${!var:-}"
  if [[ "$val" == "$default" ]]; then
    echo "ERROR: $var is still set to insecure default '$default'" >&2; ERRORS=$((ERRORS+1))
  fi
}

# Required secrets
check_set TYPESAFE_API_KEY
check_set JWT_SECRET

# Must not be default PoC values in production
check_not_default POSTGRES_PASSWORD "fdp_admin"
check_not_default PG_APP_PASSWORD "app_rw"
check_not_default PG_GT_PASSWORD "gt_rw"
check_not_default PG_EVAL_PASSWORD "eval"
check_not_default MQTT_GATEWAY_PASSWORD "gateway"
check_not_default MQTT_SIM_PASSWORD "sim"
check_not_default MQTT_BACKEND_DIAG_PASSWORD "backend-diag"
check_not_default MQTT_BACKEND_OPS_PASSWORD "backend-ops"
check_not_default JWT_SECRET "change-me-generate-with-openssl-rand-hex-32"

# JWT_SECRET length check
JWT_LEN="${#JWT_SECRET}"
if [[ $JWT_LEN -lt 32 ]]; then
  echo "ERROR: JWT_SECRET must be at least 32 characters (got $JWT_LEN)" >&2; ERRORS=$((ERRORS+1))
fi

if [[ $ERRORS -gt 0 ]]; then
  echo "" >&2
  echo "Found $ERRORS secret validation error(s). Fix them before deploying." >&2
  echo "Generate a secure JWT_SECRET with: openssl rand -hex 32" >&2
  exit 1
fi
echo "All secrets look good."
