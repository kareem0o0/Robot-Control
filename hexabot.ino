/*
 ============================================================
  HEXAPOD ROBOT CONTROLLER - ESP32 + PCA9685
 ============================================================
  Hardware:
    - ESP32 (dual-core)
    - PCA9685 servo driver (I2C) → servos 0–15
    - 2 direct GPIO servos → servo 16 (GPIO26), servo 17 (GPIO14)
    - Total: 18 servos, 6 legs × 3 joints

  ⚠️  GPIO12 WARNING (see bottom of file and WIRING NOTES)
      GPIO12 is a bootstrap pin on ESP32. Using it as a servo
      output can prevent boot if the signal is high at reset.
      We use GPIO26 instead for servo 16.

  Features:
    - WiFi + OTA firmware update
    - WebSocket-based web UI (served from ESP32)
    - Smooth servo ramping (non-blocking, on Core 0)
    - Per-servo calibration (min/max pulse, angle limits, inversion)
    - Save/restore poses (NVS / Preferences)
    - Dual-core FreeRTOS tasks
 ============================================================
*/

// ─── Library Includes ────────────────────────────────────
#include <Arduino.h>
#include <WiFi.h>
#include <ArduinoOTA.h>
#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>
#include <ESP32Servo.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <Preferences.h>
#include <ArduinoJson.h>       // v6 – install via Library Manager

// ─── WiFi Credentials ────────────────────────────────────
#define WIFI_SSID     "KMY"
#define WIFI_PASSWORD "KMY123456789kmy"
#define OTA_HOSTNAME  "hexapod"
#define OTA_PASSWORD  "hexapod123"   // change this!

// ─── PCA9685 Settings ────────────────────────────────────
#define PCA9685_ADDR   0x40
#define PCA9685_FREQ   50            // Hz – standard servos
#define I2C_SDA_PIN    21
#define I2C_SCL_PIN    22

// ─── GPIO Servo Pins ─────────────────────────────────────
// ⚠️  GPIO12 avoided – see notes. Using GPIO27 (SAFE) instead.
// GPIO12 is a strapping pin that can prevent boot if high.
// GPIO27 is a safe alternative with no bootstrap functions.
#define GPIO_SERVO_16_PIN  27
#define GPIO_SERVO_17_PIN  14

#define BUILTIN_LED_PIN    2

// ─── Servo Count ─────────────────────────────────────────
#define NUM_SERVOS     18
#define NUM_PCA_SERVOS 16           // channels 0–15 on PCA9685
#define NUM_GPIO_SERVOS 2           // channels 16–17 on GPIO

// ─── Smooth Motion ───────────────────────────────────────
#define RAMP_INTERVAL_MS  20        // servo update period (ms)
#define DEFAULT_RAMP_DEG  2.0f      // degrees per interval step
#define STATUS_BROADCAST_INTERVAL_MS 100

// ─── Web Server ──────────────────────────────────────────
AsyncWebServer  server(80);
AsyncWebSocket  ws("/ws");

// ─── NVS Storage ─────────────────────────────────────────
Preferences prefs;

// ─── PCA9685 Driver ──────────────────────────────────────
Adafruit_PWMServoDriver pca = Adafruit_PWMServoDriver(PCA9685_ADDR);

// ─── GPIO Servo Objects ──────────────────────────────────
Servo gpioServo[NUM_GPIO_SERVOS];

// ─────────────────────────────────────────────────────────
//  SERVO CONFIGURATION STRUCT
//  Edit the servoConfig[] table below to set calibration.
// ─────────────────────────────────────────────────────────
struct ServoConfig {
    const char* name;       // human-readable label
    int   minPulse;         // µs at minimum angle
    int   maxPulse;         // µs at maximum angle
    float minAngle;         // degrees (logical)
    float maxAngle;         // degrees (logical)
    float centerAngle;      // degrees – "home" position
    bool  inverted;         // reverse direction?
    int   leg;              // 1–6
    int   joint;            // 1=coxa, 2=femur, 3=tibia
};

// ─── Servo Calibration Table ─────────────────────────────
//  Pulse widths: typical SG90 = 500–2400 µs
//               MG996R  = 500–2500 µs
//  Adjust per your actual servo model and mechanical limits.
// ─────────────────────────────────────────────────────────
ServoConfig servoConfig[NUM_SERVOS] = {
//  { name,              minPulse, maxPulse, minAngle, maxAngle, center, inv, leg, joint }
    { "L1-Coxa",          500,     2400,      0,       180,      90,  false, 1, 1 },
    { "L1-Femur",         500,     2400,      0,       180,      90,  false, 1, 2 },
    { "L1-Tibia",         500,     2400,      0,       180,      90,  false, 1, 3 },
    { "L2-Coxa",          500,     2400,      0,       180,      90,  false, 2, 1 },
    { "L2-Femur",         500,     2400,      0,       180,      90,  false, 2, 2 },
    { "L2-Tibia",         500,     2400,      0,       180,      90,  false, 2, 3 },
    { "L3-Coxa",          500,     2400,      0,       180,      90,  false, 3, 1 },
    { "L3-Femur",         500,     2400,      0,       180,      90,  false, 3, 2 },
    { "L3-Tibia",         500,     2400,      0,       180,      90,  false, 3, 3 },
    { "L4-Coxa",          500,     2400,      0,       180,      90,  false, 4, 1 },
    { "L4-Femur",         500,     2400,      0,       180,      90,  false, 4, 2 },
    { "L4-Tibia",         500,     2400,      0,       180,      90,  false, 4, 3 },
    { "L5-Coxa",          500,     2400,      0,       180,      90,  false, 5, 1 },
    { "L5-Femur",         500,     2400,      0,       180,      90,  false, 5, 2 },
    { "L5-Tibia",         500,     2400,      0,       180,      90,  false, 5, 3 },
    { "L6-Coxa",          500,     2400,      0,       180,      90,  false, 6, 1 },
    // Servo 16 → GPIO26
    { "L6-Femur(G26)",    500,     2400,      0,       180,      90,  false, 6, 2 },
    // Servo 17 → GPIO14
    { "L6-Tibia(G14)",    500,     2400,      0,       180,      90,  false, 6, 3 },
};

// ─── Runtime Servo State ─────────────────────────────────
struct ServoState {
    float currentAngle;     // actual commanded angle (ramped)
    float targetAngle;      // desired angle
    float rampSpeed;        // degrees per RAMP_INTERVAL_MS tick
    bool  enabled;          // false = servo released/disabled
};

ServoState servoState[NUM_SERVOS];

// Soft calibration offsets (degrees) applied in software and persisted
#define MAX_OFFSET_DEG 15.0f
float servoOffsets[NUM_SERVOS];

// Macro frames (simple RAM-based macro manager)
#define MAX_MACRO_FRAMES 64
int macroFrameCount = 0;
float macroFrames[MAX_MACRO_FRAMES][NUM_SERVOS];

// Macro playback task handle
TaskHandle_t macroPlayerHandle = nullptr;

// Global speed scaling (0.0 .. 1.0)
float globalSpeedScale = 1.0f;

bool builtinLedState = false;
uint32_t lastStatusBroadcastMs = 0;

// Saved pose storage (up to 4 poses)
#define MAX_POSES 4
float savedPoses[MAX_POSES][NUM_SERVOS];

// ─── FreeRTOS Sync ───────────────────────────────────────
SemaphoreHandle_t servoMutex;   // protect servoState[]

// ─────────────────────────────────────────────────────────
//  UTILITY: Angle → Pulse width (µs)
// ─────────────────────────────────────────────────────────
int angleToPulse(int servoIdx, float angle) {
    const ServoConfig& cfg = servoConfig[servoIdx];
    // apply software offset before clamping
    float raw = angle + servoOffsets[servoIdx];
    float a = constrain(raw, cfg.minAngle, cfg.maxAngle);
    if (cfg.inverted) {
        a = cfg.minAngle + cfg.maxAngle - a;
    }
    float ratio = (a - cfg.minAngle) / (cfg.maxAngle - cfg.minAngle);
    return (int)(cfg.minPulse + ratio * (cfg.maxPulse - cfg.minPulse));
}

// ─────────────────────────────────────────────────────────
//  UTILITY: Pulse µs → PCA9685 tick count
//  PCA9685 at 50 Hz → period = 20 ms = 20000 µs
//  4096 ticks per period → 1 tick ≈ 4.88 µs
// ─────────────────────────────────────────────────────────
uint16_t pulseToPcaTick(int pulseUs) {
    // 20000 µs / 4096 ticks
    return (uint16_t)((pulseUs / 20000.0f) * 4096);
}

// ─────────────────────────────────────────────────────────
//  WRITE ONE SERVO (called from ramp task, mutex held)
// ─────────────────────────────────────────────────────────
void writeServoHardwareDirect(int idx, float angle, bool enabled) {
    if (!enabled) return;
    int pulseUs = angleToPulse(idx, angle);

    if (idx < NUM_PCA_SERVOS) {
        // PCA9685
        uint16_t tick = pulseToPcaTick(pulseUs);
        pca.setPWM(idx, 0, tick);
    } else {
        // GPIO servo (index 16 or 17)
        int gpioIdx = idx - NUM_PCA_SERVOS;   // 0 or 1
        gpioServo[gpioIdx].writeMicroseconds(pulseUs);
    }
}

void writeServoHardware(int idx, float angle) {
    writeServoHardwareDirect(idx, angle, servoState[idx].enabled);
}

// ─────────────────────────────────────────────────────────
//  COMMAND SERVO (thread-safe, called from web task)
// ─────────────────────────────────────────────────────────
bool commandServo(int idx, float angle) {
    if (idx < 0 || idx >= NUM_SERVOS) {
        Serial.printf("[ERR] commandServo: invalid index %d\n", idx);
        return false;
    }
    const ServoConfig& cfg = servoConfig[idx];
    float clamped = constrain(angle, cfg.minAngle, cfg.maxAngle);
    if (clamped != angle) {
        Serial.printf("[WARN] Servo %d angle %.1f clamped to %.1f\n",
                      idx, angle, clamped);
    }
    if (xSemaphoreTake(servoMutex, pdMS_TO_TICKS(10)) == pdTRUE) {
        // If servo is detached (disabled), ignore set commands until re-attached
        if (!servoState[idx].enabled) {
            Serial.printf("[CMD IGNORE] Servo %d is detached; set ignored\n", idx);
            xSemaphoreGive(servoMutex);
            return false;
        } else {
            servoState[idx].targetAngle = clamped;
            Serial.printf("[CMD] Servo %d (%s) → %.1f°\n",
                          idx, servoConfig[idx].name, clamped);
        }
        xSemaphoreGive(servoMutex);
        return true;
    }
    Serial.printf("[CMD ERR] Servo %d command timed out waiting for servo mutex\n", idx);
    return false;
}

// Detach (disable) a single servo: kill PWM so it can be moved manually
void detachServo(int idx) {
    if (idx < 0 || idx >= NUM_SERVOS) return;
    if (xSemaphoreTake(servoMutex, pdMS_TO_TICKS(20)) == pdTRUE) {
        servoState[idx].enabled = false;
        xSemaphoreGive(servoMutex);
    }
    // Kill hardware output
    if (idx < NUM_PCA_SERVOS) {
        pca.setPWM(idx, 0, 0);
    } else {
        gpioServo[idx - NUM_PCA_SERVOS].writeMicroseconds(0);
    }
    Serial.printf("[DETACH] Servo %d detached (PWM off)\n", idx);
}

// Engage (enable) a single servo: re-attach and lock to last known angle
void engageServo(int idx) {
    if (idx < 0 || idx >= NUM_SERVOS) return;
    if (xSemaphoreTake(servoMutex, pdMS_TO_TICKS(20)) == pdTRUE) {
        // Lock currentAngle to targetAngle to avoid jump
        servoState[idx].currentAngle = servoState[idx].targetAngle;
        servoState[idx].enabled = true;
        xSemaphoreGive(servoMutex);
    }
    // Write hardware to currentAngle immediately to lock position
    writeServoHardware(idx, servoState[idx].currentAngle);
    Serial.printf("[ENGAGE] Servo %d engaged and locked at %.1f°\n", idx, servoState[idx].currentAngle);
}

void engageAllServos() {
    for (int i = 0; i < NUM_SERVOS; i++) {
        engageServo(i);
    }
    Serial.println("[INFO] Engage all servos");
}

void centerAllServos() {
    for (int i = 0; i < NUM_SERVOS; i++) {
        commandServo(i, servoConfig[i].centerAngle);
    }
    Serial.println("[INFO] Center all servos");
}

void centerLeg(int leg) {
    // leg 1–6, servos = (leg-1)*3 … (leg-1)*3+2
    int base = (leg - 1) * 3;
    for (int j = 0; j < 3; j++) {
        commandServo(base + j, servoConfig[base + j].centerAngle);
    }
    Serial.printf("[INFO] Center leg %d\n", leg);
}

void releaseAll() {
    if (xSemaphoreTake(servoMutex, pdMS_TO_TICKS(50)) == pdTRUE) {
        for (int i = 0; i < NUM_SERVOS; i++) {
            servoState[i].enabled = false;
            if (i < NUM_PCA_SERVOS) {
                pca.setPWM(i, 0, 0);   // off
            } else {
                gpioServo[i - NUM_PCA_SERVOS].writeMicroseconds(0);
            }
        }
        xSemaphoreGive(servoMutex);
    }
    Serial.println("[INFO] All servos released");
}

void setBuiltinLed(bool state) {
    builtinLedState = state;
    digitalWrite(BUILTIN_LED_PIN, builtinLedState ? HIGH : LOW);
    Serial.printf("[LED] Built-in LED %s\n", builtinLedState ? "ON" : "OFF");
}

void toggleBuiltinLed() {
    setBuiltinLed(!builtinLedState);
}

void savePose(int slot) {
    if (slot < 0 || slot >= MAX_POSES) return;
    if (xSemaphoreTake(servoMutex, pdMS_TO_TICKS(50)) == pdTRUE) {
        for (int i = 0; i < NUM_SERVOS; i++) {
            savedPoses[slot][i] = servoState[i].currentAngle;
        }
        xSemaphoreGive(servoMutex);
    }
    // Persist to NVS
    prefs.begin("hexapod", false);
    char key[16];
    for (int i = 0; i < NUM_SERVOS; i++) {
        snprintf(key, sizeof(key), "p%ds%d", slot, i);
        prefs.putFloat(key, savedPoses[slot][i]);
    }
    prefs.end();
    Serial.printf("[INFO] Pose %d saved\n", slot);
}

// ---------------------- Offsets and Macros ----------------------
void loadOffsets() {
    prefs.begin("hexapod", true);
    char key[16];
    for (int i = 0; i < NUM_SERVOS; i++) {
        snprintf(key, sizeof(key), "off%d", i);
        servoOffsets[i] = prefs.getFloat(key, 0.0f);
    }
    prefs.end();
    Serial.println("[NVS] Offsets loaded");
}

void saveOffset(int idx, float off) {
    if (idx < 0 || idx >= NUM_SERVOS) return;
    prefs.begin("hexapod", false);
    char key[16]; snprintf(key, sizeof(key), "off%d", idx);
    prefs.putFloat(key, off);
    prefs.end();
    servoOffsets[idx] = off;
    Serial.printf("[NVS] Offset %d = %.2f saved\n", idx, off);
}

void appendMacroFrame() {
    if (macroFrameCount >= MAX_MACRO_FRAMES) {
        Serial.println("[MACRO] Full");
        return;
    }
    if (xSemaphoreTake(servoMutex, pdMS_TO_TICKS(20)) == pdTRUE) {
        for (int i = 0; i < NUM_SERVOS; i++) {
            macroFrames[macroFrameCount][i] = servoState[i].currentAngle;
        }
        xSemaphoreGive(servoMutex);
        macroFrameCount++;
        Serial.printf("[MACRO] Frame appended (%d)\n", macroFrameCount);
    }
}

void clearMacro() {
    macroFrameCount = 0;
    Serial.println("[MACRO] Cleared");
}

// Macro player task
void macroPlayer(void* param) {
    int delayMs = *((int*)param);
    free(param);
    Serial.printf("[MACRO] Play start delay=%d ms frames=%d\n", delayMs, macroFrameCount);
    for (int f = 0; f < macroFrameCount; f++) {
        if (xSemaphoreTake(servoMutex, pdMS_TO_TICKS(50)) == pdTRUE) {
            for (int i = 0; i < NUM_SERVOS; i++) {
                // ensure engaged before commanding
                servoState[i].enabled = true;
                servoState[i].targetAngle = macroFrames[f][i];
            }
            xSemaphoreGive(servoMutex);
        }
        vTaskDelay(pdMS_TO_TICKS(delayMs));
    }
    Serial.println("[MACRO] Play complete");
    macroPlayerHandle = nullptr;
    vTaskDelete(NULL);
}

void startMacroPlayer(int delayMs) {
    if (macroFrameCount == 0) return;
    if (macroPlayerHandle != nullptr) {
        Serial.println("[MACRO] Player already running");
        return;
    }
    int* pDelay = (int*)malloc(sizeof(int));
    *pDelay = delayMs;
    xTaskCreatePinnedToCore(macroPlayer, "MacroPlayer", 4096, pDelay, 2, &macroPlayerHandle, 0);
}


void restorePose(int slot) {
    if (slot < 0 || slot >= MAX_POSES) return;
    for (int i = 0; i < NUM_SERVOS; i++) {
        commandServo(i, savedPoses[slot][i]);
    }
    Serial.printf("[INFO] Pose %d restored\n", slot);
}

void loadSavedPoses() {
    prefs.begin("hexapod", true);
    char key[16];
    for (int s = 0; s < MAX_POSES; s++) {
        for (int i = 0; i < NUM_SERVOS; i++) {
            snprintf(key, sizeof(key), "p%ds%d", s, i);
            savedPoses[s][i] = prefs.getFloat(key, servoConfig[i].centerAngle);
        }
    }
    prefs.end();
}

// ─────────────────────────────────────────────────────────
//  RAMP TASK (Core 0) – smooth motion
// ─────────────────────────────────────────────────────────
void rampTask(void* param) {
    TickType_t lastWake = xTaskGetTickCount();
    float writeAngles[NUM_SERVOS];
    bool writeEnabled[NUM_SERVOS];

    for (;;) {
        vTaskDelayUntil(&lastWake, pdMS_TO_TICKS(RAMP_INTERVAL_MS));

        if (xSemaphoreTake(servoMutex, pdMS_TO_TICKS(5)) != pdTRUE) continue;

        for (int i = 0; i < NUM_SERVOS; i++) {
            writeEnabled[i] = servoState[i].enabled;
            if (!servoState[i].enabled) {
                writeAngles[i] = servoState[i].currentAngle;
                continue;
            }

            float cur = servoState[i].currentAngle;
            float tgt = servoState[i].targetAngle;
            float spd = servoState[i].rampSpeed * globalSpeedScale;

            if (fabsf(cur - tgt) < 0.1f) {
                servoState[i].currentAngle = tgt;
            } else if (cur < tgt) {
                servoState[i].currentAngle = min(cur + spd, tgt);
            } else {
                servoState[i].currentAngle = max(cur - spd, tgt);
            }
            writeAngles[i] = servoState[i].currentAngle;
        }

        xSemaphoreGive(servoMutex);

        for (int i = 0; i < NUM_SERVOS; i++) {
            writeServoHardwareDirect(i, writeAngles[i], writeEnabled[i]);
        }
    }
}

// ─────────────────────────────────────────────────────────
//  BUILD JSON STATUS (sent to UI clients)
// ─────────────────────────────────────────────────────────
String buildStatusJson() {
    // Preallocate generously
    DynamicJsonDocument doc(4096);
    JsonArray arr = doc.createNestedArray("servos");

    if (xSemaphoreTake(servoMutex, pdMS_TO_TICKS(20)) == pdTRUE) {
        for (int i = 0; i < NUM_SERVOS; i++) {
            JsonObject s = arr.createNestedObject();
            s["idx"]     = i;
            s["name"]    = servoConfig[i].name;
            s["current"] = (int)servoState[i].currentAngle;
            s["target"]  = (int)servoState[i].targetAngle;
            s["min"]     = (int)servoConfig[i].minAngle;
            s["max"]     = (int)servoConfig[i].maxAngle;
            s["center"]  = (int)servoConfig[i].centerAngle;
            s["enabled"] = servoState[i].enabled;
                    s["offset"]  = servoOffsets[i];
            s["leg"]     = servoConfig[i].leg;
            s["joint"]   = servoConfig[i].joint;
        }
        xSemaphoreGive(servoMutex);
    }

    doc["macroCount"] = macroFrameCount;
    doc["globalSpeed"] = globalSpeedScale;

    String out;
    serializeJson(doc, out);
    return out;
}

// ─────────────────────────────────────────────────────────
//  WEBSOCKET EVENT HANDLER
// ─────────────────────────────────────────────────────────
void onWsEvent(AsyncWebSocket* server, AsyncWebSocketClient* client,
               AwsEventType type, void* arg, uint8_t* data, size_t len) {
    if (type == WS_EVT_CONNECT) {
        Serial.printf("[WS] Client %u connected\n", client->id());
        // Send full state immediately
        client->text(buildStatusJson());

    } else if (type == WS_EVT_DISCONNECT) {
        Serial.printf("[WS] Client %u disconnected\n", client->id());

    } else if (type == WS_EVT_DATA) {
        AwsFrameInfo* info = (AwsFrameInfo*)arg;
        if (info->opcode == WS_TEXT && info->final && info->index == 0 && info->len == len) {
            StaticJsonDocument<512> doc;
            DeserializationError err = deserializeJson(doc, data, len);
            if (err) {
                Serial.printf("[WS ERR] JSON parse: %s\n", err.c_str());
                return;
            }

            const char* command = doc["command"] | doc["cmd"] | "";

            if (strcmp(command, "set") == 0 || strcmp(command, "setServo") == 0) {
                int idx = -1;
                if (doc["idx"].is<int>()) {
                    idx = doc["idx"].as<int>();
                } else if (doc["servo_id"].is<int>()) {
                    idx = doc["servo_id"].as<int>();
                }
                float angle = doc["angle"] | -1.0f;
                if (idx >= 0 && angle >= 0) {
                    bool shouldEngage = doc["engage"] | true;
                    if (shouldEngage && idx < NUM_SERVOS) {
                        bool isEnabled = true;
                        if (xSemaphoreTake(servoMutex, pdMS_TO_TICKS(10)) == pdTRUE) {
                            isEnabled = servoState[idx].enabled;
                            xSemaphoreGive(servoMutex);
                        }
                        if (!isEnabled) {
                            engageServo(idx);
                        }
                    }
                    if (commandServo(idx, angle)) {
                        Serial.printf("[DASHBOARD] Servo %d → %.1f°\n", idx, angle);
                    } else {
                        Serial.printf("[DASHBOARD ERR] Servo %d command %.1f° was not accepted\n", idx, angle);
                    }
                } else {
                    Serial.printf("[WS ERR] Bad servo command: idx=%d angle=%.1f\n", idx, angle);
                }

            } else if (strcmp(command, "setGait") == 0) {
                const char* gait = doc["gait"] | "";
                Serial.printf("[DASHBOARD] Gait mode: %s\n", gait);
                // Gait implementation here (tripod, wave, ripple, amble)

            } else if (strcmp(command, "engage") == 0) {
                int idx = -1;
                if (doc["idx"].is<int>()) {
                    idx = doc["idx"].as<int>();
                } else if (doc["servo_id"].is<int>()) {
                    idx = doc["servo_id"].as<int>();
                }
                bool state = doc["state"] | doc["engaged"] | false;
                if (idx >= 0 && idx < NUM_SERVOS) {
                    if (state) engageServo(idx);
                    else detachServo(idx);
                }

            } else if (strcmp(command, "centerAll") == 0) {
                centerAllServos();
                Serial.println("[DASHBOARD] Center all servos");

            } else if (strcmp(command, "engageAll") == 0) {
                engageAllServos();
                Serial.println("[DASHBOARD] Engage all servos");

            } else if (strcmp(command, "centerLeg") == 0) {
                int leg = doc["leg_id"] | doc["leg"] | -1;
                if (leg >= 1 && leg <= 6) {
                    centerLeg(leg);
                    Serial.printf("[DASHBOARD] Center leg %d\n", leg);
                }

            } else if (strcmp(command, "emergencyStop") == 0) {
                releaseAll();
                Serial.println("[DASHBOARD] ⚠️ EMERGENCY STOP TRIGGERED");

            } else if (strcmp(command, "toggleBuiltinLed") == 0) {
                toggleBuiltinLed();

            } else if (strcmp(command, "setBuiltinLed") == 0) {
                bool state = doc["state"] | false;
                setBuiltinLed(state);

            } else if (strcmp(command, "saveMacroFrame") == 0) {
                appendMacroFrame();

            } else if (strcmp(command, "clearMacro") == 0) {
                clearMacro();

            } else if (strcmp(command, "playMacro") == 0) {
                int delayMs = doc["delay"] | 500;
                startMacroPlayer(delayMs);

            } else if (strcmp(command, "setOffset") == 0) {
                int idx = doc["idx"] | -1;
                float off = doc["offset"] | 0.0f;
                if (idx >= 0 && idx < NUM_SERVOS) {
                    off = constrain(off, -MAX_OFFSET_DEG, MAX_OFFSET_DEG);
                    saveOffset(idx, off);
                }

            } else if (strcmp(command, "setGlobalSpeed") == 0) {
                float s = doc["scale"] | 1.0f;
                s = constrain(s, 0.0f, 2.0f);
                if (xSemaphoreTake(servoMutex, pdMS_TO_TICKS(10)) == pdTRUE) {
                    globalSpeedScale = s;
                    xSemaphoreGive(servoMutex);
                }

            } else if (strcmp(command, "savePose") == 0) {
                int slot = doc["slot"] | 0;
                savePose(slot);

            } else if (strcmp(command, "restorePose") == 0) {
                int slot = doc["slot"] | 0;
                restorePose(slot);

            } else if (strcmp(command, "setSpeed") == 0) {
                int idx   = doc["idx"] | -1;
                float spd = doc["speed"] | DEFAULT_RAMP_DEG;
                if (idx >= 0 && idx < NUM_SERVOS) {
                    if (xSemaphoreTake(servoMutex, pdMS_TO_TICKS(10)) == pdTRUE) {
                        servoState[idx].rampSpeed = max(0.1f, spd);
                        xSemaphoreGive(servoMutex);
                    }
                }

            } else if (strcmp(command, "getStatus") == 0) {
                // Return full telemetry as per dashboard protocol
                DynamicJsonDocument telemetry(2048);
                if (xSemaphoreTake(servoMutex, pdMS_TO_TICKS(20)) == pdTRUE) {
                    JsonArray legs = telemetry.createNestedArray("legs");
                    for (int leg = 0; leg < 6; leg++) {
                        for (int j = 0; j < 3; j++) {
                            int idx = leg * 3 + j;
                            JsonObject leg_data = legs.createNestedObject();
                            leg_data["id"] = leg;
                            leg_data["theta1"] = (int)servoState[leg*3].currentAngle;
                            leg_data["theta2"] = (int)servoState[leg*3+1].currentAngle;
                            leg_data["theta3"] = (int)servoState[leg*3+2].currentAngle;
                            leg_data["temp"] = 40;  // TODO: read actual temps
                        }
                    }
                    xSemaphoreGive(servoMutex);
                }
                telemetry["battery"] = 11.8;  // TODO: read from ADC
                telemetry["gait"] = "tripod";
                telemetry["armed"] = true;
                String response;
                serializeJson(telemetry, response);
                client->text(response);
                return;

            } else {
                Serial.printf("[WS WARN] Unknown cmd: %s\n", command);
            }

            // Broadcast updated state to all clients
            String status = buildStatusJson();
            ws.textAll(status);
        }
    }
}

// ─────────────────────────────────────────────────────────
//  NOTE: Frontend UI hosting removed from firmware.
//  The PC-hosted `index.html` is served locally by the operator.
//  ESP32 continues to provide WebSocket `/ws` and REST `/status` endpoints.
// ─────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────
//  WIFI + OTA SETUP (runs on Core 1 loop)
// ─────────────────────────────────────────────────────────
void setupWifi() {
    Serial.printf("[WiFi] Connecting to %s", WIFI_SSID);
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    int tries = 0;
    while (WiFi.status() != WL_CONNECTED && tries < 40) {
        delay(500);
        Serial.print(".");
        tries++;
    }
    if (WiFi.status() == WL_CONNECTED) {
        Serial.printf("\n[WiFi] Connected. IP: %s\n",
                      WiFi.localIP().toString().c_str());
    } else {
        Serial.println("\n[WiFi] FAILED – starting AP mode");
        WiFi.mode(WIFI_AP);
        WiFi.softAP("Hexapod-AP", "hexapod123");
        Serial.printf("[WiFi] AP IP: %s\n",
                      WiFi.softAPIP().toString().c_str());
    }
}

void setupOTA() {
    ArduinoOTA.setHostname(OTA_HOSTNAME);
    ArduinoOTA.setPassword(OTA_PASSWORD);
    ArduinoOTA.onStart([]() {
        String type = (ArduinoOTA.getCommand() == U_FLASH) ? "sketch" : "filesystem";
        Serial.println("[OTA] Start: " + type);
        releaseAll();   // safety: release servos before flashing
    });
    ArduinoOTA.onEnd([]()   { Serial.println("\n[OTA] Done"); });
    ArduinoOTA.onProgress([](unsigned int p, unsigned int t) {
        Serial.printf("[OTA] %u%%\r", (p / (t / 100)));
    });
    ArduinoOTA.onError([](ota_error_t e) {
        Serial.printf("[OTA] Error[%u]: ", e);
        if      (e == OTA_AUTH_ERROR)    Serial.println("Auth Failed");
        else if (e == OTA_BEGIN_ERROR)   Serial.println("Begin Failed");
        else if (e == OTA_CONNECT_ERROR) Serial.println("Connect Failed");
        else if (e == OTA_RECEIVE_ERROR) Serial.println("Receive Failed");
        else if (e == OTA_END_ERROR)     Serial.println("End Failed");
    });
    ArduinoOTA.begin();
    Serial.println("[OTA] Ready. Hostname: " OTA_HOSTNAME);
}

void setupWebServer() {
    ws.onEvent(onWsEvent);
    server.addHandler(&ws);

    // Note: UI is hosted on the operator's PC (index.html).
    // Keep a lightweight root response for verification.
    server.on("/", HTTP_GET, [](AsyncWebServerRequest* req) {
        req->send(200, "text/plain", "Hexapod Controller - WebSocket available at /ws");
    });

    // REST endpoint: GET /status
    server.on("/status", HTTP_GET, [](AsyncWebServerRequest* req) {
        req->send(200, "application/json", buildStatusJson());
    });

    server.begin();
    Serial.println("[HTTP] Web server started on port 80");
}

// ─────────────────────────────────────────────────────────
//  ARDUINO SETUP
// ─────────────────────────────────────────────────────────
void setup() {
    Serial.begin(115200);
    Serial.println("\n\n=== HEXAPOD ROBOT CONTROLLER BOOT ===");

    pinMode(BUILTIN_LED_PIN, OUTPUT);
    setBuiltinLed(false);

    // I2C for PCA9685
    Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
    pca.begin();
    pca.setOscillatorFrequency(27000000);   // calibrate if servos drift
    pca.setPWMFreq(PCA9685_FREQ);
    delay(10);
    Serial.println("[HW] PCA9685 initialized");

    // GPIO servos
    // Allocate timers before attaching
    ESP32PWM::allocateTimer(0);
    ESP32PWM::allocateTimer(1);
    gpioServo[0].setPeriodHertz(50);
    gpioServo[1].setPeriodHertz(50);
    gpioServo[0].attach(GPIO_SERVO_16_PIN, 500, 2400);
    gpioServo[1].attach(GPIO_SERVO_17_PIN, 500, 2400);
    Serial.printf("[HW] GPIO servos on pins %d and %d\n",
                  GPIO_SERVO_16_PIN, GPIO_SERVO_17_PIN);

    // Mutex
    servoMutex = xSemaphoreCreateMutex();

    // Init servo state
    for (int i = 0; i < NUM_SERVOS; i++) {
        servoState[i].currentAngle = servoConfig[i].centerAngle;
        servoState[i].targetAngle  = servoConfig[i].centerAngle;
        servoState[i].rampSpeed    = DEFAULT_RAMP_DEG;
        servoState[i].enabled      = true;
    }

    // Load saved poses from NVS
    loadSavedPoses();
    // Load persisted software offsets
    loadOffsets();

    // Center all servos at startup
    centerAllServos();
    // Give servos time to reach center before starting ramp task
    delay(1000);

    // Launch ramp task on Core 0 (deterministic servo control)
    xTaskCreatePinnedToCore(
        rampTask,       // function
        "RampTask",    // name
        4096,           // stack
        nullptr,        // param
        3,              // high enough for smooth motion, low enough for web commands
        nullptr,        // handle
        0               // Core 0 (deterministic servo loop)
    );
    Serial.println("[RTOS] Ramp task started on Core 0 (deterministic servo loop)");

    // WiFi, OTA, WebServer run on Core 1 (via loop())
    setupWifi();
    setupOTA();
    setupWebServer();

    Serial.println("=== BOOT COMPLETE ===");
    Serial.printf("Open browser: http://%s/\n",
                  WiFi.localIP().toString().c_str());
}

// ─────────────────────────────────────────────────────────
//  ARDUINO LOOP (Core 1 – WiFi / OTA / WS cleanup)
// ─────────────────────────────────────────────────────────
void loop() {
    ArduinoOTA.handle();
    ws.cleanupClients();    // remove stale WS clients
    delay(10);
}

/*
 ============================================================
  WIRING NOTES
 ============================================================

  ESP32 ↔ PCA9685
  ─────────────────
  ESP32 GPIO21 (SDA) → PCA9685 SDA
  ESP32 GPIO22 (SCL) → PCA9685 SCL
  ESP32 3.3V         → PCA9685 VCC  (logic power)
  ESP32 GND          → PCA9685 GND  ← COMMON GROUND ⚠️

  PCA9685 V+ (servo power rail)
  ──────────────────────────────
  Connect external 5–6V / 3A+ supply to PCA9685 V+ and GND.
  ⚠️  DO NOT power servos from ESP32 3.3V – it will reset or burn.

  GPIO Servos
  ───────────
  Servo 16 signal → ESP32 GPIO27  (orange/white wire) ← SAFE PIN
  Servo 17 signal → ESP32 GPIO14  (orange/white wire)
  Servo GND       → COMMON GND   ← ⚠️ MUST share GND with ESP32
  Servo VCC (5V)  → External supply (same as PCA9685 servo rail)

  ⚠️  GPIO12 & STRAPPING PIN WARNING
  ────────────────────────────────────────────────────────
  GPIO12 (MTDI) is a bootstrap/strapping pin on ESP32.
  - If GPIO12 is HIGH at boot → uses 1.8V flash voltage (FAILS)
  - If GPIO12 is LOW at boot → uses 3.3V flash voltage (correct)
  Servo signal lines float during power-up, risking either state.
  Result: BRICKED ESP32 or unreliable boot.
  
  GPIO15 (MTDO) is also a strapping pin (should be LOW).
  GPIO0 (strapping pin, must be LOW for normal boot)
  GPIO2 (strapping pin, usually HIGH for SD card)
  GPIO5 (strapping pin, usually HIGH for JTAG off)

  SAFE ALTERNATIVES for servo use:
    GPIO25, GPIO26, GPIO27, GPIO32, GPIO33
    (all output-capable, NO bootstrap function, no ADC conflicts)

  This firmware uses GPIO27 for servo 16 (safest option).
  If you want servo 16 on a different pin, change:
      #define GPIO_SERVO_16_PIN  26
  ────────────────────────────────────────────────────────

  Power Supply Checklist
  ──────────────────────
  □ ESP32 powered via USB or separate 3.3V reg
  □ PCA9685 V+ connected to 5–6V / ≥ 3A supply
  □ All GNDs tied together: ESP32, PCA9685, servo PSU, GPIO servos
  □ Add 100–470µF cap across servo PSU terminals near PCA9685
  □ If ESP32 resets randomly → servo PSU voltage dips → add caps
    or use dedicated supply for ESP32

 ============================================================
  FIRST-TIME UPLOAD (USB)
 ============================================================
  1. Install libraries:
       - Adafruit PWM Servo Driver Library  (Adafruit)
       - ESP32Servo                          (Kevin Harrington)
       - ESPAsyncWebServer                   (me-no-dev)
       - AsyncTCP                            (me-no-dev)
       - ArduinoJson                         (Benoit Blanchon, v6)
       - ArduinoOTA                          (built-in ESP32 core)

  2. Board: "ESP32 Dev Module" (or your exact board)
     Partition: "Default" or "Minimal SPIFFS" – no FS needed

  3. Edit WIFI_SSID and WIFI_PASSWORD above.
  4. Upload via USB (Sketch → Upload).
  5. Open Serial Monitor @ 115200 baud.
  6. Note the IP address printed (e.g., 192.168.1.42).
  7. Open browser → http://192.168.1.42/

 ============================================================
  OTA UPLOAD (wireless, after first USB upload)
 ============================================================
  Option A – Arduino IDE:
    Tools → Port → select "hexapod at 192.168.x.x (ESP32)"
    (IDE discovers OTA devices via mDNS/Bonjour)
    Then upload normally.  Enter OTA_PASSWORD when prompted.

  Option B – Python espota.py:
    python espota.py -i 192.168.1.42 -a hexapod123 \
                     -f hexapod_robot.ino.bin

  Option C – PlatformIO:
    upload_protocol = espota
    upload_port     = hexapod.local
    upload_flags    = --auth=hexapod123

 ============================================================
*/
