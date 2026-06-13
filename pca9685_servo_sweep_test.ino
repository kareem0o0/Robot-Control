#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>

const uint8_t PCA9685_ADDRESS = 0x40;
Adafruit_PWMServoDriver pca = Adafruit_PWMServoDriver(PCA9685_ADDRESS);

const uint8_t I2C_SDA_PIN = 21;
const uint8_t I2C_SCL_PIN = 22;

const uint8_t SERVO_CHANNELS = 16;
const uint16_t SERVO_FREQ = 50;

const uint16_t SERVO_MIN_US = 600;
const uint16_t SERVO_MAX_US = 2400;

const int MIN_ANGLE = 0;
const int MAX_ANGLE = 180;
const int CENTER_ANGLE = 90;

const int STEP_DEGREES = 2;
const int STEP_DELAY_MS = 15;
const int CYCLE_PAUSE_MS = 300;
const int DETAIL_PRINT_EVERY_DEGREES = 10;

bool restartRequested = false;
uint32_t cycleNumber = 0;

uint16_t angleToPWM(int angle)
{
    angle = constrain(angle, MIN_ANGLE, MAX_ANGLE);

    uint16_t pulseUs = map(
        angle,
        MIN_ANGLE,
        MAX_ANGLE,
        SERVO_MIN_US,
        SERVO_MAX_US);

    return (uint32_t)pulseUs * SERVO_FREQ * 4096UL / 1000000UL;
}

uint16_t angleToPulseUs(int angle)
{
    angle = constrain(angle, MIN_ANGLE, MAX_ANGLE);
    return map(angle, MIN_ANGLE, MAX_ANGLE, SERVO_MIN_US, SERVO_MAX_US);
}

void writeServo(uint8_t channel, int angle)
{
    if (channel >= SERVO_CHANNELS)
        return;

    pca.setPWM(channel, 0, angleToPWM(angle));
}

void writeAllServos(int angle)
{
    for (uint8_t channel = 0; channel < SERVO_CHANNELS; channel++)
    {
        writeServo(channel, angle);
    }
}

void printAngleDetails(int angle)
{
    Serial.print("[SWEEP] angle=");
    Serial.print(angle);
    Serial.print(" deg, pulse=");
    Serial.print(angleToPulseUs(angle));
    Serial.print(" us, pca_tick=");
    Serial.println(angleToPWM(angle));
}

void printConfig()
{
    Serial.println("=================================");
    Serial.println("ESP32 PCA9685 Parallel Servo Test");
    Serial.println("=================================");
    Serial.print("I2C SDA GPIO: ");
    Serial.println(I2C_SDA_PIN);
    Serial.print("I2C SCL GPIO: ");
    Serial.println(I2C_SCL_PIN);
    Serial.print("PCA9685 address: 0x");
    Serial.println(PCA9685_ADDRESS, HEX);
    Serial.print("Servo channels: ");
    Serial.println(SERVO_CHANNELS);
    Serial.print("Servo frequency: ");
    Serial.print(SERVO_FREQ);
    Serial.println(" Hz");
    Serial.print("Pulse range: ");
    Serial.print(SERVO_MIN_US);
    Serial.print("-");
    Serial.print(SERVO_MAX_US);
    Serial.println(" us");
    Serial.print("Angle range: ");
    Serial.print(MIN_ANGLE);
    Serial.print("-");
    Serial.print(MAX_ANGLE);
    Serial.println(" deg");
    Serial.println("Send 'r' in Serial Monitor to restart the sweep cycle.");
}

void checkPcaConnection()
{
    Wire.beginTransmission(PCA9685_ADDRESS);
    uint8_t error = Wire.endTransmission();

    if (error == 0)
    {
        Serial.println("[I2C] PCA9685 detected.");
    }
    else
    {
        Serial.print("[I2C ERR] PCA9685 not detected. Wire.endTransmission()=");
        Serial.println(error);
    }
}

void handleSerialInput()
{
    while (Serial.available() > 0)
    {
        char incomingChar = Serial.read();
        if (incomingChar == 'r' || incomingChar == 'R')
        {
            restartRequested = true;
            Serial.println("[CMD] Restart requested.");
        }
    }
}

bool delayWithSerialCheck(int durationMs)
{
    uint32_t startMs = millis();
    while (millis() - startMs < (uint32_t)durationMs)
    {
        handleSerialInput();
        if (restartRequested)
            return false;
        delay(1);
    }
    return true;
}

bool writeSweepAngle(int angle)
{
    writeAllServos(angle);

    if (angle % DETAIL_PRINT_EVERY_DEGREES == 0)
    {
        printAngleDetails(angle);
    }

    return delayWithSerialCheck(STEP_DELAY_MS);
}

bool runSweepCycle()
{
    cycleNumber++;
    Serial.print("[CYCLE] Starting cycle ");
    Serial.println(cycleNumber);
    Serial.println("[CYCLE] Forward sweep 0 -> 180");

    for (int angle = MIN_ANGLE; angle <= MAX_ANGLE; angle += STEP_DEGREES)
    {
        if (!writeSweepAngle(angle))
            return false;
    }

    if (!delayWithSerialCheck(CYCLE_PAUSE_MS))
        return false;

    Serial.println("[CYCLE] Reverse sweep 180 -> 0");

    for (int angle = MAX_ANGLE; angle >= MIN_ANGLE; angle -= STEP_DEGREES)
    {
        if (!writeSweepAngle(angle))
            return false;
    }

    return delayWithSerialCheck(CYCLE_PAUSE_MS);
}

void setup()
{
    Serial.begin(115200);
    delay(500);

    Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);   // ESP32: SDA=GPIO21, SCL=GPIO22

    printConfig();
    checkPcaConnection();

    pca.begin();
    pca.setOscillatorFrequency(27000000);
    pca.setPWMFreq(SERVO_FREQ);

    delay(100);

    writeAllServos(CENTER_ANGLE);

    Serial.println("[INIT] All servos centered at 90 deg.");
    printAngleDetails(CENTER_ANGLE);

    delay(1000);
}

void loop()
{
    if (!runSweepCycle())
    {
        restartRequested = false;
        writeAllServos(CENTER_ANGLE);
        Serial.println("[CYCLE] Restarting from center.");
        printAngleDetails(CENTER_ANGLE);
        delay(500);
    }
}
