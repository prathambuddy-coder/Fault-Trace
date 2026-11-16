<!-- SPDX-FileCopyrightText: 2026 Meddle S.r.l. -->
<!-- SPDX-License-Identifier: CC-BY-4.0 -->

# Real Asset Manual Ingestion Guide

This guide describes how to ingest physical equipment manuals (OEM maintenance guides, troubleshooting manuals, fault code tables) into the Fault Diagnosis system to build an asset-specific diagnostic catalog and vector database.

---

## 1. Overview

By default, the PoC uses the fictional **CAU-7 Compressor Manual**. In a real factory deployment, the system ingests the actual OEM service documentation for your machines using the `fdp-init` CLI tool.

```mermaid
flowchart TD
    PDF["OEM Maintenance Manual (PDF)<br/>e.g., Atlas Copco GA75, Kaeser DSD"] --> PARSER["fdp-init parser<br/>(Extracts faults, symptoms, procedures)"]
    PARSER --> EMBED["ModernBERT / BGE Embedder<br/>(Vector representation of symptoms)"]
    EMBED --> DB[("PostgreSQL + pgvector<br/>Catalog tables & embeddings")]
    DB --> RETRIEVER["Hybrid Retriever<br/>(Signal moves + Semantic vector search)"]
    RETRIEVER --> VON["Von Decision Engine<br/>(Calculates diagnostic confidence)"]
```

---

## 2. Ingestion Steps

### Step 1: Export Catalog from Real Manual PDF

Run the `fdp-init` tool on your host or inside a container:

```bash
# Export the fault catalog structure to JSON
uv run --package fdp-init fdp-init export-catalog \
  --manual /path/to/equipment-manual.pdf \
  --out data/catalogs/equipment-catalog.json
```

### Step 2: Validate the Ingested Catalog

Ensure all fault definitions, symptom mappings, and accepted fault codes match the required schema:

```bash
pnpm --filter @fdp/eval run validate --catalog file:data/catalogs/equipment-catalog.json
```

### Step 3: Ingest into Database (Embedding Generation)

Run the full ingestion pipeline to populate PostgreSQL `pgvector`:

```bash
# Ingest with embedding generation into running Postgres
docker compose run --rm init fdp-init ingest \
  --manual /data/manual/real-equipment.pdf \
  --db postgres://fdp_admin:fdp_admin@postgres:5432/fdp
```

---

## 3. Best Practices for OEM Manual Ingestion

To achieve high diagnostic accuracy ($\ge 90\%$):

1. **Structured Fault Code Section:**
   Ensure the PDF contains explicit fault codes, their sensor indicators (e.g. "Low Oil Pressure: $TP3 < 2.5\text{ bar}$"), and likely root causes.
2. **Sensor Signal Alignment:**
   Ensure the sensor identifiers referenced in the manual match the signal names decoded by the Modbus gateway (`TP2`, `T_outlet`, `Motor_current`).
3. **Step-by-Step Remediation:**
   Include recommended technician checks (e.g. "Inspect purge valve solenoid", "Check oil cooler fins for fouling"). These become the diagnostic checklist presented on open tickets.
