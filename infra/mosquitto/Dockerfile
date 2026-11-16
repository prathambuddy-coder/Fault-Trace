# SPDX-FileCopyrightText: 2026 Meddle S.r.l.
# SPDX-License-Identifier: Apache-2.0
#
# The `mqtt` service (infra/mosquitto/README.md). The build context is the
# repository root, so every COPY path starts with infra/mosquitto/.
#
# Mosquitto 2.0.22 warns that world-readable acl and passwd files "will be
# refused by future versions", hence --chmod=0600 --chown=mosquitto on both.
# The hashed passwd file itself is not baked in: entrypoint.sh renders it at
# every start from passwd.txt and the MQTT_<USER>_PASSWORD variables.
#
# The base is a build argument, so moving to the 2.1 line is not an edit: CI's
# manual `mosquitto-next` job builds this file with
# `--build-arg MQTT_IMAGE=eclipse-mosquitto:2.1.2-alpine` and runs the smoke
# test on the result. The default stays the pinned 2.0.22, which
# scripts/ops/compose-invariants.py reads from the line below.
ARG MQTT_IMAGE=eclipse-mosquitto:2.0.22
FROM ${MQTT_IMAGE}
# PROD_MODE build argument (default: false).
# When set to true at build time (`--build-arg PROD_MODE=true`), the production
# configuration (mosquitto.prod.conf) is copied into the image in place of the
# development one. In production mode the broker listens on 8883 with TLS and
# rejects anonymous connections. In the default (false) mode it listens on 1883
# and allows anonymous reads for local development convenience.
# Note: the entrypoint also supports runtime switching via the MQTT_PROD_MODE
# environment variable, which does not require a rebuild.
ARG PROD_MODE=false
COPY --chmod=0644 infra/mosquitto/mosquitto.conf /mosquitto/config/mosquitto.conf
COPY --chmod=0644 infra/mosquitto/mosquitto.prod.conf /mosquitto/config/mosquitto.prod.conf
COPY --chmod=0600 --chown=mosquitto:mosquitto infra/mosquitto/acl /mosquitto/config/acl
COPY --chmod=0600 --chown=mosquitto:mosquitto infra/mosquitto/passwd.txt /mosquitto/config/passwd.txt
COPY --chmod=0755 infra/mosquitto/entrypoint.sh /fdp-entrypoint.sh
EXPOSE 1883
HEALTHCHECK --interval=5s --timeout=5s --retries=6 --start-period=5s \
  CMD mosquitto_sub -h 127.0.0.1 -t '$SYS/broker/uptime' -C 1 -W 3 -i hc || exit 1
ENTRYPOINT ["/fdp-entrypoint.sh"]
