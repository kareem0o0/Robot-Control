#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>

Adafruit_PWMServoDriver pca = Adafruit_PWMServoDriver(0x40);

const uint8_t SERVO_CHANNELS = 16;
const uint16_t SERVO_FREQ = 50;

const uint16_t SERVO_MIN_US = 500;
const uint16_t SERVO_MAX_US = 2500;

const uint8_t STEP_DEGREES = 2;
const uint16_t STEP_DELAY_MS = 15;
const uint16_t CHANNEL_PAUSE_MS = 300;

uint16_t angleToPulse(uint8_t angle) {
  uint16_t pulseUs = map(angle, 0, 180, SERVO_MIN_US, SERVO_MAX_US);
  return (uint32_t)pulseUs * SERVO_FREQ * 4096 / 1000000;
}

void writeServo(uint8_t channel, uint8_t angle) {
  pca.setPWM(channel, 0, angleToPulse(angle));
}

void sweepChannel(uint8_t channel) {
  for (uint8_t angle = 0; angle <= 180; angle += STEP_DEGREES) {
    writeServo(channel, angle);
    delay(STEP_DELAY_MS);
  }

  for (int angle = 180; angle >= 0; angle -= STEP_DEGREES) {
    writeServo(channel, angle);
    delay(STEP_DELAY_MS);
  }
}

void setup() {
  Wire.begin();
  Serial.begin(9600);

  pca.begin();
  pca.setOscillatorFrequency(27000000);
  pca.setPWMFreq(SERVO_FREQ);

  delay(10);

  for (uint8_t channel = 0; channel < SERVO_CHANNELS; channel++) {
    writeServo(channel, 90);
  }

  delay(1000);
  Serial.println("PCA9685 servo sweep test started.");
}

void loop() {
  for (uint8_t channel = 0; channel < SERVO_CHANNELS; channel++) {
    Serial.print("Sweeping channel ");
    Serial.println(channel);

    sweepChannel(channel);
    writeServo(channel, 90);
    delay(CHANNEL_PAUSE_MS);
  }
}
