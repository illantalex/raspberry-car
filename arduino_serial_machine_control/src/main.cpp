#include <AFMotor.h>  // подключаем библиотеку для шилда
// #include <Adafruit_LSM303.h>
// #include <Adafruit_LSM303DLH_Mag.h>
// #include <Adafruit_LSM303_Accel.h>
// #include <Adafruit_Sensor.h>
// #include <LSM303.h>
#include <Adafruit_LSM303.h>
#include <Arduino.h>
#include <Arduino_FreeRTOS.h>
#include <NewPing.h>
#include <SoftwareSerial.h>
#include <TinyGPS++.h>
#include <Wire.h>

#define TRIGGER_PIN A0
#define ECHO_PIN A1
#define MAX_DISTANCE 400

#define MOTOR_DELAY 100
#define INTERVAL_SEND 1000

NewPing sonar(TRIGGER_PIN, ECHO_PIN, MAX_DISTANCE);
AF_DCMotor motorList[4] = {AF_DCMotor(1), AF_DCMotor(2), AF_DCMotor(3), AF_DCMotor(4)};
SoftwareSerial GpsSerial(A3, A2);
TinyGPSPlus gps;
Adafruit_LSM303_Accel_Unified accel = Adafruit_LSM303_Accel_Unified(12345);
Adafruit_LSM303_Mag_Unified mag = Adafruit_LSM303_Mag_Unified(54321);
// LSM303 compass;
// Adafruit_LSM303 lsm;

// float MagMinX, MagMaxX;
// float MagMinY, MagMaxY;
// float MagMinZ, MagMaxZ;

uint8_t cmds[6][4] = {
    {1, 1, 1, 1},  // forward
    {2, 2, 2, 2},  // backward
    {1, 1, 4, 4},  // front-left
    {4, 4, 1, 1},  // front-right
    {2, 2, 4, 4},  // back-left
    {4, 4, 2, 2},  // back-right
};

uint8_t command;
// unsigned long timeSend = 0;

TaskFunction_t sender_handler() {
  for (;;) {
    Serial.print(sonar.ping_cm());
    Serial.print(" ");
    bool newData = false;
    for (unsigned long start = millis(); millis() - start < 500;) {
      while (GpsSerial.available()) {
        char c = GpsSerial.read();
        // Serial.write(c);    // uncomment this line if you want to see the GPS data flowing
        if (gps.encode(c))  // Did a new valid sentence come in?
        {
          newData = true;
          // displayInfo();
        }
      }
    }
    if (newData) {
      // Serial.print(F("Location: "));
      if (gps.location.isValid()) {
        Serial.print(gps.location.lat(), 6);
        Serial.print(F(","));
        Serial.print(gps.location.lng(), 6);
      } else {
        Serial.print(F("INVALID"));
      }
      // Serial.println();
    } else {
      Serial.print("NO_DATA");
    }
    Serial.print(" ");
    // compass.read();
    sensors_event_t event;
    accel.getEvent(&event);

    /* Display the results (acceleration is measured in m/s^2) */
    // Serial.print("X: ");
    // Serial.print(compass.a.x);
    Serial.print(event.acceleration.x);
    Serial.print(",");
    // Serial.print("Y: ");
    // Serial.print(compass.a.y);
    Serial.print(event.acceleration.y);
    Serial.print(",");
    Serial.print(event.acceleration.z);
    // Serial.print("Z: ");
    // Serial.print(compass.a.z);
    Serial.print(" ");
    sensors_event_t magEvent;
    mag.getEvent(&magEvent);

    // float Pi = 3.1415926;
    // float heading = (atan2(magEvent.magnetic.y, magEvent.magnetic.x) * 180) / Pi;

    // Normalize to 0-360
    // if (heading < 0) {
    //   heading = 360 + heading;
    // }

    // Serial.print("Compass Heading: ");
    // Serial.println(magEvent.magnetic.heading);
    // float heading = atan2(compass.m.y, compass.m.x);  // высчитываем направление

    // корректируем значения с учетом знаков
    // if (heading < 0) heading += 2 * PI;
    // if (heading > 2 * PI) heading -= 2 * PI;
    // Serial.println(heading * RAD_TO_DEG);
    // Serial.print(compass.m.x);
    Serial.print(magEvent.magnetic.x);
    Serial.print(",");
    Serial.print(magEvent.magnetic.y);
    // Serial.print(compass.m.y);
    Serial.print(",");
    Serial.println(magEvent.magnetic.z);
    // Serial.println(compass.m.z);
    // Serial.print(magEvent.magnetic.y);
    // Serial.print(",");
    // Serial.println(magEvent.magnetic.z);
    // if (millis() - timeSend > INTERVAL_SEND) {
    //   timeSend = millis();
    //   Serial.print("Ping: ");
    //   Serial.print(sonar.ping_cm());
    //   Serial.println("cm");
    delay(1000);
  }
}

void move(uint8_t cmd[4]) {
  // int motorTime = millis();
  for (int i = 0; i < 4; ++i) {
    motorList[i].run(cmd[i]);
    // motorList[i].setSpeed(255);
  }
  delay(MOTOR_DELAY);
  for (int i = 0; i < 4; ++i) {
    motorList[i].run(RELEASE);
  }
}

void moving_handler() {
  for (;;) {
    if (Serial.available()) {
      command = Serial.read();
      if (command > '0' && command < '7') {
        move(cmds[command - 1 - '0']);
      }
    }
  }
}

void setup() {
  Serial.begin(9600);
  GpsSerial.begin(9600);
  // Wire.begin();
  accel.begin();
  mag.begin();
  // compass.init();
  // compass.enableDefault();
  for (int i = 0; i < 4; ++i) {
    // motorList[i] = AF_DCMotor(i + 1);
    motorList[i].setSpeed(255);
    motorList[i].run(RELEASE);
  }
  xTaskCreate((TaskFunction_t)moving_handler, "Moving handler", configMINIMAL_STACK_SIZE, NULL, 1, NULL);
  xTaskCreate((TaskFunction_t)sender_handler, "Sender handler", configMINIMAL_STACK_SIZE, NULL, 1, NULL);
  vTaskStartScheduler();
}

void loop() {
}
