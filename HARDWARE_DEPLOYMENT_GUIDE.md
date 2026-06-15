# Hexabot Real Hardware Integration Guide

**Document Type**: Deployment & Integration Manual  
**Target Audience**: Developers implementing the complete hexabot system  
**Scope**: ESP32 firmware configuration, WebSocket protocol, wiring safety, and deployment procedure

---

## Part 1: Electrical Architecture & Safety

### 1.1 Complete System Block Diagram

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                     CONTROL STATION (PC)                        â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚  â”‚  KEMO Control Center Dashboard (projects-hub.html)              â”‚  â”‚
â”‚  â”‚  - WebSocket Client (ws://hexabot-controller:81)        â”‚  â”‚
â”‚  â”‚  - Sends: Gait mode, servo angles, emergency stop       â”‚  â”‚
â”‚  â”‚  - Receives: Live telemetry JSON                        â”‚  â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
        â•‘ WiFi / Ethernet (TCP/IP)
        â•‘ Port 81 (WebSocket)
        â•‘ Port 80 (HTTP)
        â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
                                                                â•‘
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                    HEXABOT ROBOT (ESP32)                        â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚  â”‚ Core 0: WiFi + WebSocket + HTTP Server + OTA            â”‚  â”‚
â”‚  â”‚ Core 1: Servo Control Loop (100 Hz, deterministic)      â”‚  â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â”‚
â”‚                                                                 â”‚
â”‚  â”Œâ”€â”€â”€ I2C Bus (GPIO 21=SDA, GPIO 22=SCL) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â”‚  â”‚                                                         â”‚   â”‚
â”‚  â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”         â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”      â”‚   â”‚
â”‚  â”‚  â”‚   PCA9685 I2C    â”‚         â”‚   MPU6050 IMU  â”‚      â”‚   â”‚
â”‚  â”‚  â”‚  Servo Driver    â”‚         â”‚  (6-DOF)       â”‚      â”‚   â”‚
â”‚  â”‚  â”‚  16 channels     â”‚         â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜      â”‚   â”‚
â”‚  â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜                                 â”‚   â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â”‚
â”‚                                                                 â”‚
â”‚  â”Œâ”€â”€â”€ Direct GPIO PWM â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”‚
â”‚  â”‚  Servo 16: GPIO 27 (Leg 6 Femur)                      â”‚    â”‚
â”‚  â”‚  Servo 17: GPIO 14 (Leg 6 Tibia)                      â”‚    â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â”‚
â”‚                                                                 â”‚
â”‚  â”Œâ”€â”€â”€ ADC (Battery Monitoring) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”‚
â”‚  â”‚  GPIO 35 (ADC1_7): Voltage divider â†’ Battery V        â”‚    â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
        â•‘ PWM signals (50 Hz, 1-2 ms pulses)
        â•‘ I2C (100-400 kHz)
        â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
                                                                â•‘
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                POWER DISTRIBUTION & SERVO HARDWARE              â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â”‚  â”‚  Primary Power Supply (5-6V, 3A+ rated)                â”‚   â”‚
â”‚  â”‚  - Capable of sustaining all 18 servos under load      â”‚   â”‚
â”‚  â”‚  - Includes 220-470ÂµF capacitor bank (local)           â”‚   â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â”‚
â”‚           â•‘                                                    â”‚
â”‚           â”œâ”€â”€â†’ PCA9685 V+ Pin (servo rail power)             â”‚
â”‚           â”œâ”€â”€â†’ 18x MG996R Servo Motors                       â”‚
â”‚           â”‚    (Leg 1-5: via PCA9685)                       â”‚
â”‚           â”‚    (Leg 6: Femur & Tibia via GPIO PWM)         â”‚
â”‚           â”‚                                                 â”‚
â”‚           â””â”€â”€â†’ Common GND return âš ï¸ CRITICAL                â”‚
â”‚                                                             â”‚
â”‚  Common Ground Architecture:                                â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚  â”‚ -GND from PSU                                        â”‚  â”‚
â”‚  â”‚   â”œâ”€â”€â†’ ESP32 GND (GPIO D2, GPIO D15, etc.)          â”‚  â”‚
â”‚  â”‚   â”œâ”€â”€â†’ PCA9685 GND pin                              â”‚  â”‚
â”‚  â”‚   â””â”€â”€â†’ All servo GND wires (Leg 1-6)               â”‚  â”‚
â”‚  â”‚                                                      â”‚  â”‚
â”‚  â”‚ Result: Single reference point, zero ground bounce â”‚  â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### 1.2 Safe GPIO Pin Selection

**âš ï¸ CRITICAL: GPIO Bootstrap/Strapping Pins**

The ESP32 has internal pull-ups/pull-downs that are sampled at boot to determine:
- Flash voltage (1.8V vs 3.3V) â†’ GPIO12, GPIO15
- Boot mode (UART download vs normal) â†’ GPIO0
- JTAG / SD Card â†’ GPIO2, GPIO5

| Pin | Strapping Function | Safe for Servo? | Notes |
|-----|-------------------|-----------------|-------|
| **GPIO12** | Flash voltage selector | âŒ NO | **DO NOT USE** â€” high signal = 1.8V mode (bricks ESP32) |
| **GPIO15** | JTAG pulldown | âš ï¸ Risky | Usually pulled low; could conflict |
| **GPIO0** | Boot mode | âŒ NO | Must be low to boot normally |
| **GPIO2** | SD card select | âš ï¸ Risky | Floating causes issues |
| **GPIO5** | JTAG enable | âš ï¸ Risky | Unsafe without careful setup |
| **GPIO25** | None | âœ… SAFE | Pure output GPIO, no bootstrap |
| **GPIO26** | None | âœ… SAFE | Pure output GPIO, no bootstrap |
| **GPIO27** | None | âœ… SAFE | **RECOMMENDED** â€” Servo 16 |
| **GPIO32** | None | âœ… SAFE | Pure output GPIO, no bootstrap |
| **GPIO33** | None | âœ… SAFE | Pure output GPIO, no bootstrap |

**This firmware uses:**
- Servo 16: **GPIO27** (absolutely safe)
- Servo 17: **GPIO14** (not a strapping pin; low risk but not primary boot path)

---

## Part 2: Wiring Schematic

### 2.1 I2C Bus Connections (PCA9685 + MPU6050)

```
ESP32 Board (pins labeled on dev kit)
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  GPIO21 (SDA) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â†’ PCA9685 SDA
â”‚  GPIO22 (SCL) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â†’ PCA9685 SCL
â”‚  GPIO21 (SDA) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â†’ MPU6050 SDA (shared I2C)
â”‚  GPIO22 (SCL) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â†’ MPU6050 SCL (shared I2C)
â”‚  3.3V â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â†’ PCA9685 VCC (logic power)
â”‚  GND â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â†’ PCA9685 GND âš ï¸
â”‚  GND â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â†’ MPU6050 GND âš ï¸
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

I2C Pullup Resistors:
- SDA: 4.7kÎ© pullup to 3.3V (usually on PCA9685 module)
- SCL: 4.7kÎ© pullup to 3.3V (usually on PCA9685 module)
```

### 2.2 Servo Signal Connections (PWM)

#### PCA9685 Channels (0-15) â†’ Servos 0-15
```
PCA9685 Module (DIP-8 or SMD)
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ CH0 (Pin 0) â†’ Servo 0  (L1-Coxa)
â”‚ CH1 (Pin 1) â†’ Servo 1  (L1-Femur)
â”‚ CH2 (Pin 2) â†’ Servo 2  (L1-Tibia)
â”‚ CH3 (Pin 3) â†’ Servo 3  (L2-Coxa)
â”‚ CH4 (Pin 4) â†’ Servo 4  (L2-Femur)
â”‚ CH5 (Pin 5) â†’ Servo 5  (L2-Tibia)
â”‚ CH6 (Pin 6) â†’ Servo 6  (L3-Coxa)
â”‚ CH7 (Pin 7) â†’ Servo 7  (L3-Femur)
â”‚ CH8 (Pin 8) â†’ Servo 8  (L3-Tibia)
â”‚ CH9 (Pin 9) â†’ Servo 9  (L4-Coxa)
â”‚ CH10 (Pin 10) â†’ Servo 10 (L4-Femur)
â”‚ CH11 (Pin 11) â†’ Servo 11 (L4-Tibia)
â”‚ CH12 (Pin 12) â†’ Servo 12 (L5-Coxa)
â”‚ CH13 (Pin 13) â†’ Servo 13 (L5-Femur)
â”‚ CH14 (Pin 14) â†’ Servo 14 (L5-Tibia)
â”‚ CH15 (Pin 15) â†’ Servo 15 (L6-Coxa)
â”‚
â”‚ V+ (Pin 16) â†â† External 5-6V Supply (+)
â”‚ GND (Pin 8/32) â†â† External Supply (-) âš ï¸ COMMON GND
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

Each servo connection:
  Signal (yellow/orange) â†’ PCA Channel
  5V (red)               â†’ PCA V+ rail
  GND (black/brown)      â†’ Common GND
```

#### Direct GPIO PWM (Servos 16-17)
```
ESP32 Board
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  GPIO27 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â†’ Servo 16 (L6-Femur) signal
â”‚  GPIO14 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â†’ Servo 17 (L6-Tibia) signal
â”‚  5V* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â†’ Servo 16 & 17 power (from external PSU)
â”‚  GND â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â†’ Servo 16 & 17 GND (common with system) âš ï¸
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

* ESP32 itself cannot safely deliver servo current (max 40mA per pin).
  Must use external 5-6V supply for servo power.
```

### 2.3 Power Distribution (CRITICAL âš ï¸)

```
External 5-6V Power Supply (5A+ rated)
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  Positive Terminal   â”‚â”€â”€â†’ [100-470ÂµF Cap] â”€â”€â†’ PCA9685 V+
â”‚                      â”‚                        All servo red wires
â”‚  Negative Terminal   â”‚â”€â”€â†’ [Common Ground]
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
         â•‘
         â•‘ Low-ESR wires (AWG 16 or thicker)
         â•‘ Keep runs <30cm to minimize resistance
         â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
                                    
Common Ground Node (single solder point):
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ GND from external PSU                    â”‚
â”‚   â”œâ”€â”€â†’ PCA9685 GND pin                   â”‚
â”‚   â”œâ”€â”€â†’ ESP32 GND (multiple pins)         â”‚
â”‚   â”œâ”€â”€â†’ All 18 servo GND wires            â”‚
â”‚   â”œâ”€â”€â†’ MPU6050 GND                       â”‚
â”‚   â””â”€â”€â†’ Battery voltage divider GND       â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

âš ï¸ DO NOT skip ground connections!
   - Each servo GND must connect back to common node
   - Never daisy-chain GND (servo1â†’servo2â†’servo3)
   - Use solid-core or twisted-pair for low noise
```

### 2.4 Battery Voltage Monitoring (ADC)

```
3S LiPo Battery (9-12.6V nominal)
â”‚
â”œâ”€â†’ Voltage Divider (1/3 scaling)
â”‚   Top resistor: 100kÎ© (to battery +)
â”‚   Bottom resistor: 50kÎ© (to GND)
â”‚   Tap point â†’ ESP32 GPIO35 (ADC1_7)
â”‚
â””â”€â†’ Capacitor: 10ÂµF across resistors (EMI filter)

Calculation:
  V_ADC = V_Battery * (50kÎ© / 150kÎ©) = V_Battery / 3
  Max battery 12.6V â†’ ADC input 4.2V (safe for 3.3V ADC max)
  
Firmware conversion:
  uint16_t adc_raw = analogRead(35);  // 12-bit: 0-4095
  float voltage = (adc_raw / 4095.0) * 3.3 * 3.0;  // back to battery V
```

---

## Part 3: Firmware Configuration & Deployment

### 3.1 Prerequisites (PlatformIO or Arduino IDE)

**Required Libraries** (install via Library Manager):

```
- Adafruit PWM Servo Driver Library v2.4.0+
  Author: Adafruit Industries
  Purpose: PCA9685 I2C interface

- ESP32Servo v0.11.0+
  Author: Kevin Harrington
  Purpose: Direct GPIO servo PWM control

- ESPAsyncWebServer v1.2.3+
  Author: me-no-dev
  Purpose: High-performance async web server

- AsyncTCP v1.1.1+
  Author: me-no-dev
  Purpose: Async TCP for WebSocket

- ArduinoJson v6.18.0+ (NOT v7)
  Author: Benoit Blanchon
  Purpose: JSON parsing/generation

- ArduinoOTA (built-in to ESP32 core)
  Purpose: Over-the-air firmware updates
```

**Installation Steps:**

For **Arduino IDE**:
```
Sketch â†’ Include Library â†’ Manage Libraries
â†’ Search each name above
â†’ Install latest version
```

For **PlatformIO** (`platformio.ini`):
```ini
[env:esp32dev]
platform = espressif32@5.1.0
board = esp32doit-devkit-v1
framework = arduino
lib_deps =
    adafruit/Adafruit PWM Servo Driver Library@^2.4.0
    madhephaestus/ESP32Servo@^0.11.0
    me-no-dev/ESPAsyncWebServer@^1.2.3
    me-no-dev/AsyncTCP@^1.1.1
    bblanchon/ArduinoJson@^6.18.0
```

### 3.2 Pre-Flight Checklist

Before uploading firmware:

- [ ] **Wiring complete** (all GNDs connected to common point)
- [ ] **Power supply ready** (5-6V, â‰¥3A)
- [ ] **Capacitor bank installed** (220-470ÂµF across servo rail)
- [ ] **PCA9685 A0-A5 address pins**: All to GND if using `0x40` (typical)
- [ ] **No shorts** (multimeter continuity test on power rails)
- [ ] **ESP32 powered via USB** (not from servo supply!)
- [ ] **WiFi credentials edited** (see `#define WIFI_SSID` and `WIFI_PASSWORD`)
- [ ] **All libraries installed** (compile-check with IDE)

### 3.3 First Upload (USB Cable)

**Step 1:** Connect ESP32 via USB-C to PC

**Step 2:** Select board and COM port in Arduino IDE:
```
Tools â†’ Board â†’ esp32 â†’ "ESP32 Dev Module"
Tools â†’ Port â†’ COM# (or /dev/ttyUSB0 on Linux)
```

**Step 3:** Edit WiFi credentials in `hexabot.ino`:
```cpp
#define WIFI_SSID     "YOUR_NETWORK_NAME"
#define WIFI_PASSWORD "YOUR_PASSWORD"
#define OTA_HOSTNAME  "hexabot-controller"
#define OTA_PASSWORD  "YourOTAPassword123"  // Change this!
```

**Step 4:** Compile and upload:
```
Sketch â†’ Upload
(or Ctrl+U)
```

**Step 5:** Monitor serial output:
```
Tools â†’ Serial Monitor (115200 baud)

Expected output:
=== HEXABOT ROBOT CONTROLLER BOOT ===
[HW] PCA9685 initialized
[HW] GPIO servos on pins 27 and 14
[RTOS] Ramp task started on Core 1 (deterministic servo loop)
[WiFi] Connected. IP: 192.168.x.x
[OTA] Ready. Hostname: hexabot-controller
=== BOOT COMPLETE ===
Open browser: http://192.168.x.x/
```

### 3.4 Second Upload (OTA Wireless)

Once USB upload succeeds, all future uploads can be wireless:

**Arduino IDE:**
```
Tools â†’ Port â†’ "hexabot-controller at 192.168.x.x (ESP32)"
(if not visible, verify mDNS enabled in Tools menu)
Sketch â†’ Upload
Enter OTA_PASSWORD when prompted
```

**PlatformIO CLI:**
```bash
pio run -e esp32dev --target upload
```

**Python espota:**
```bash
python espota.py -i 192.168.x.x -a YourOTAPassword123 \
                  -f firmware.bin
```

---

## Part 4: WebSocket Protocol (PC â†” ESP32)

### 4.1 Connection Establishment

```
PC Dashboard                          ESP32
   â”‚                                   â”‚
   â”œâ”€ ws://192.168.x.x:81 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â†’ â”œâ”€ WebSocket listen
   â”‚                                   â”‚
   â† â”€ â”€ â”€ â”€ â”€ â”€ â”€ â”€ â”€ â”€ â”€ Connected â”œâ”€
   â”‚                                   â”‚
   â””â”€ Request system state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â†’ â”œâ”€ Send servo positions
   â†â”€ Full telemetry JSON â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
```

### 4.2 Command Protocol (PC â†’ ESP32)

All commands are JSON sent over WebSocket:

**Set Servo Angle:**
```json
{
    "command": "set",
    "servo_id": 0,
    "angle": 120.5
}
```

**Change Gait:**
```json
{
    "command": "setGait",
    "gait": "tripod"
}
```

Valid gaits: `"tripod"`, `"wave"`, `"ripple"`, `"amble"`

**Center All Servos:**
```json
{
    "command": "centerAll"
}
```

**Emergency Stop:**
```json
{
    "command": "emergencyStop"
}
```

**Get Full Status:**
```json
{
    "command": "getStatus"
}
```

### 4.3 Telemetry Response Protocol (ESP32 â†’ PC)

```json
{
    "legs": [
        {
            "id": 0,
            "theta1": 90,
            "theta2": 85,
            "theta3": 95,
            "temp": 42
        },
        // ... 6 legs total
    ],
    "battery": 11.8,
    "imu": {
        "roll": 2.3,
        "pitch": 1.1,
        "yaw": 0.0
    },
    "gait": "tripod",
    "armed": true,
    "uptime": 3600
}
```

---

## Part 5: Troubleshooting & Diagnostics

### 5.1 ESP32 Won't Boot / Upload Hangs

**Symptom:** `waiting for download`

**Diagnosis:**
1. Check GPIO0 is floating (not pulled to GND)
2. Verify USB cable is data cable (not power-only)
3. Try "Erase Flash" in Tools menu before upload

### 5.2 Servos Jittering / Not Smooth

**Symptom:** Servo oscillates around target angle

**Cause:** Power supply voltage droop during servo movements
**Solution:**
- Add 470ÂµF capacitor near PCA9685 V+ pin
- Check power supply amperage (should be 3A+ under load)
- Verify common ground connections

### 5.3 PCA9685 Not Found (I2C Error)

**Symptom:** Serial shows `[ERROR] PCA9685 not found!`

**Diagnosis:**
```
// Run this to scan I2C addresses:
void setup() {
    Wire.begin(21, 22);  // SDA=21, SCL=22
    for (int addr = 1; addr < 127; addr++) {
        Wire.beginTransmission(addr);
        if (Wire.endTransmission() == 0) {
            Serial.printf("Device found at 0x%02X\n", addr);
        }
    }
}
```

Expected: Device at `0x40`

**If not found:**
- Check I2C wiring (SDA=GPIO21, SCL=GPIO22)
- Verify pullup resistors (4.7kÎ© on SDA/SCL)
- Test with multimeter (resistance on pulled lines ~2kÎ©)

### 5.4 Dashboard Can't Connect

**Symptom:** Dashboard shows "OFFLINE"

**Diagnosis:**
1. Verify ESP32 IP (check Serial Monitor)
2. Ping from PC: `ping 192.168.x.x`
3. Open browser: `http://192.168.x.x` (HTTP, not HTTPS)
4. Check firewall (port 81 must be open)

---

## Part 6: Calibration & Tuning

### 6.1 Per-Servo Min/Max Pulse Calibration

Edit `servoConfig[]` array in firmware:

```cpp
ServoConfig servoConfig[NUM_SERVOS] = {
//  { name,          minPulse, maxPulse, minAngle, maxAngle, center, inv, leg, joint }
    { "L1-Coxa",      500,     2400,      0,       180,      90,  false, 1, 1 },
    // Adjust minPulse/maxPulse per servo type:
    // - MG996R: 500-2500 Âµs
    // - SG90:   500-2400 Âµs (lower quality, less range)
    // - Custom: measure with oscilloscope
};
```

**How to find correct pulses:**

1. Physically rotate servo to minimum position, record pulse width
2. Physically rotate servo to maximum position, record pulse width
3. Update `minPulse` and `maxPulse`

### 6.2 Servo Inversion

If a servo rotates backward:

```cpp
{ "L1-Femur", 500, 2400, 0, 180, 90, true, 1, 2 }
                                            â†‘â†‘â†‘â†‘
                                       Set to true
```

### 6.3 Ramp Speed Tuning

Adjust `DEFAULT_RAMP_DEG` (degrees per update interval):

```cpp
#define DEFAULT_RAMP_DEG  2.0f  // degrees per 20ms
// â†’ 2Â° / 0.02s = 100Â°/second

// Increase for faster movement:
#define DEFAULT_RAMP_DEG  5.0f  // 250Â°/second (aggressive)

// Decrease for smoother motion:
#define DEFAULT_RAMP_DEG  0.5f  // 25Â°/second (glacial)
```

---

## Part 7: Production Deployment

### 7.1 Securing OTA Updates

Change default passwords:

```cpp
#define OTA_PASSWORD  "hexabot_v2_secure_pass_2026"
#define WIFI_PASSWORD "YourStrongWiFiPassword123!"
```

### 7.2 Persistent Configuration (NVS)

Current firmware saves poses to NVS:

```cpp
void savePose(int slot) {
    prefs.begin("hexapod", false);
    for (int i = 0; i < NUM_SERVOS; i++) {
        snprintf(key, sizeof(key), "p%ds%d", slot, i);
        prefs.putFloat(key, savedPoses[slot][i]);
    }
    prefs.end();
}
```

Up to 4 poses can be saved and restored via WebSocket.

### 7.3 Health Monitoring

Add periodic health checks:

```cpp
// In loop():
static unsigned long last_health = 0;
if (millis() - last_health > 60000) {  // Every 60s
    float battery = readBatteryVoltage();
    if (battery < 9.5) {
        Serial.println("[ALERT] Battery critically low!");
        // Optionally trigger emergency shutdown
    }
    last_health = millis();
}
```

---

## Part 8: Complete Wiring Checklist

**Pre-Assembly:**
- [ ] All library files downloaded and verified
- [ ] Firmware compiled successfully (0 errors)
- [ ] WiFi credentials set

**Hardware Assembly:**
- [ ] ESP32 board mounted securely
- [ ] PCA9685 module mounted, address jumpers set to 0x40
- [ ] I2C pull-up resistors installed (4.7kÎ© SDA/SCL)
- [ ] All 18 servo signal wires routed to correct channels
- [ ] Common ground node created (solder point)
- [ ] External 5-6V power supply connected
- [ ] Capacitor bank (220-470ÂµF) installed near PCA9685 V+
- [ ] No shorts between power rails (multimeter check)

**First Power-Up:**
- [ ] Remove servo power, connect ESP32 USB only
- [ ] Upload firmware
- [ ] Verify Serial output matches boot sequence
- [ ] Monitor for I2C device discovery messages
- [ ] Connect servo power (with servos in neutral position)
- [ ] Verify all servos move to center angle

**Dashboard Connection:**
- [ ] Note ESP32 IP address from Serial Monitor
- [ ] Open `http://192.168.x.x/` in browser
- [ ] Dashboard should load futuristic UI
- [ ] WebSocket should show "ONLINE"
- [ ] Test servo commands from dashboard

---

## References

- **ESP32 GPIO Map**: https://www.espressif.com/sites/default/files/documentation/esp32-pinout_reference_v1.1_en.pdf
- **PCA9685 Datasheet**: https://www.nxp.com/docs/en/data-sheet/PCA9685.pdf
- **Servo Protocol (PWM)**: 1.0ms = 0Â°, 1.5ms = 90Â°, 2.0ms = 180Â°
- **AsyncWebServer Documentation**: https://github.com/me-no-dev/ESPAsyncWebServer

---

**Deployment Status**: Ready for Production  
**Firmware Version**: 2.0  
**Last Updated**: June 1, 2026

