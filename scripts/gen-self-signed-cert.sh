#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Meddle S.r.l.
# SPDX-License-Identifier: Apache-2.0
#
# Generates a self-signed TLS certificate for local development.
# For production, replace with a real certificate from Let's Encrypt or your CA.
set -euo pipefail
CERT_DIR="${1:-infra/certs}"
mkdir -p "$CERT_DIR"
openssl req -x509 -newkey rsa:4096 -sha256 -days 365 -nodes \
  -keyout "$CERT_DIR/server.key" \
  -out "$CERT_DIR/server.crt" \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
echo "Certificate written to $CERT_DIR/server.crt and $CERT_DIR/server.key"
echo "Mount these into the frontend container at /etc/nginx/certs/"
