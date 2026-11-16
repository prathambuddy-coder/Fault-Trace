<!-- SPDX-FileCopyrightText: 2026 Meddle S.r.l. -->
<!-- SPDX-License-Identifier: CC-BY-4.0 -->

# Field Integration: Connecting to Real Industrial Hardware

This guide explains how to connect the Fault Diagnosis Gateway to physical factory equipment (PLCs, RTUs, edge gateways) instead of the built-in `modbus-sim` simulator.

---

## 1. Gateway Modbus Architecture

The gateway binary (`services/modbus/cmd/gateway`) is a native Modbus TCP client written in Go. It connects to a target endpoint, queries holding registers using standard Function Code 03 (`ReadHoldingRegisters`), quantizes and decodes the sensor readings, and publishes valid JSON telemetry batches over MQTT to Mosquitto.

```mermaid
flowchart LR
    PLC["Physical PLC / RTU<br/>(Siemens, Schneider, Allen-Bradley)<br/>Modbus TCP Port 502"] -->|"FC03: Holding Registers"| GW["Gateway Service<br/>(Go binary)"]
    GW -->|"plant/{unit_id}/telemetry"| MQ["Mosquitto MQTT<br/>(Port 1883 / 8883)"]
    MQ -->|"telemetry-samples"| BE["Backend Diagnosis Pipeline"]
```

---

## 2. Configuration for Real PLCs

To target a real physical controller, override `MODBUS_ADDR` in your `.env` or container environment:

```env
# Point gateway to your physical PLC or Modbus Gateway IP & Port
MODBUS_ADDR=192.168.1.100:502

# Unit / Machine ID in topic plant/{UNIT_ID}/telemetry
UNIT_ID=cau-7

# Poll parameters
POLL_INTERVAL_MS=100
MODBUS_TIMEOUT_MS=1000
GATEWAY_MAX_BATCH=25
```

When targeting a physical PLC:

1. In `compose.yaml`, you can disable or remove the `modbus-sim` service:
   ```bash
   docker compose up -d postgres mqtt backend frontend gateway von
   ```
2. The gateway will connect directly over the plant local area network to `192.168.1.100:502`.

---

## 3. Register Mapping Table

The gateway reads 15 analog channels from consecutive 16-bit holding registers:

| Register Address | Signal ID       | Physical Quantity                | Engineering Unit | Scaling Factor |
| :--------------: | :-------------- | :------------------------------- | :--------------- | :------------- |
|      **0**       | `TP2`           | Air delivery pressure            | bar              | Value / 100.0  |
|      **1**       | `TP3`           | Oil separator pressure           | bar              | Value / 100.0  |
|      **2**       | `H1`            | Aftercooler pressure drop        | bar              | Value / 100.0  |
|      **3**       | `DV_pressure`   | Dryer discharge pressure         | bar              | Value / 100.0  |
|      **4**       | `T_outlet`      | Compressor outlet temperature    | °C               | Value / 10.0   |
|      **5**       | `T_oil`         | Oil bath temperature             | °C               | Value / 10.0   |
|      **6**       | `T_cooler`      | Aftercooler output temperature   | °C               | Value / 10.0   |
|      **7**       | `Motor_current` | Drive motor phase current        | A                | Value / 10.0   |
|      **8**       | `Motor_voltage` | Line-to-line supply voltage      | V                | Value / 1.0    |
|      **9**       | `Oil_level`     | Sump oil level switch/sensor     | %                | Value / 10.0   |
|      **10**      | `Flow_pulses`   | Flowmeter pulse rate             | pulses/min       | Value / 1.0    |
|      **11**      | `Dew_point`     | Dryer dew point temperature      | °C               | Value / 10.0   |
|      **12**      | `Ambient_temp`  | Machine room ambient temperature | °C               | Value / 10.0   |
|      **13**      | `Vibration`     | Air-end overall vibration        | mm/s             | Value / 100.0  |
|      **14**      | `Status_word`   | Controller status flags & state  | bitfield         | Discrete       |

> [!TIP]
> If your PLC uses a different register layout, modify `services/modbus/internal/regmap/` and regenerate the bindings.

---

## 4. Multi-Protocol Support (OPC-UA / MQTT Sparkplug B)

For plants using **OPC-UA** or **Sparkplug B** rather than Modbus TCP:

- The backend does not depend on Modbus specifically. It expects standardized `telemetry-samples` JSON messages published to `plant/{unit_id}/telemetry`.
- Any industrial edge connector (Node-RED, Kepware, Ignition, or a lightweight Python/Go bridge) can publish directly to the Mosquitto broker:
  ```json
  {
    "unit_id": "cau-7",
    "samples": [
      {
        "timestamp": "2026-11-15T14:30:00.000Z",
        "values": {
          "TP2": 7.42,
          "TP3": 8.1,
          "T_outlet": 68.5,
          "Motor_current": 14.2
        }
      }
    ]
  }
  ```

---

## 5. Network Troubleshooting & Diagnostics

Verify connectivity between the gateway host and the PLC:

1. **Ping & TCP port check:**

   ```bash
   nc -zv 192.168.1.100 502
   # or Test-NetConnection -ComputerName 192.168.1.100 -Port 502
   ```

2. **Poll registers with `mbpoll` CLI:**

   ```bash
   mbpoll -m tcp -p 502 -a 1 -t 4 -r 0 -c 15 -1 192.168.1.100
   ```

3. **Check gateway health endpoint:**
   ```bash
   curl http://localhost:8082/healthz
   ```
