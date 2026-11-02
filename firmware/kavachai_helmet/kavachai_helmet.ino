#include <Arduino.h>
#include <Wire.h>
#include <TinyGPSPlus.h>
#include <math.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>

// ================= KAVACHAI =================
// Direction-aware crash detection.
// Bad roads give mostly UP-DOWN (vertical) motion, little sideways motion.
// So acceleration is split into:
//   vertical   = along gravity (road bumps live here)  -> needs a much bigger spike
//   horizontal = across gravity (forward/back/left/right, crash-like) -> smaller spike enough
// Rotation counts only around axes other than gravity (yaw = normal head turning is ignored).
//
// Alert triggers (any one):
//   1) JERKS_REQUIRED separate impacts within JERK_WINDOW_MS
//   2) One very severe impact                         [SEVERE_BYPASS]
//   3) Continuous violent motion for SUSTAINED_MS     [SUSTAINED_ENABLED]
// Then: 15 s countdown -> SMS with GPS location. SOS button cancels.
// NOTE: keep the device still for ~1 s after power-on (gravity direction is learned at boot).
//
// GSM FIX NOTES (SIM900A / SIM900-type GSM module, 2G, 9600 baud):
//   - Setup me SIM + network registration check hota hai (CREG 1 ya 5 aane tak wait).
//   - SMS bhejne se pehle network check, fail par 2 baar retry.
//   - SMS ab Wi-Fi connect hone ka intezaar nahi karta (pehle SMS, phir server upload).
//   - 3 contacts ko SMS; har contact ka status (SENT/FAILED) server ko /sms-status par jata hai.
//   - SMS chhota (160 char ke andar) rakha hai, "\n" ab asli new line hai.
//   - Serial Monitor me type karein:  gsm  (status)   testsms  ("hello shravan" pehle number par)

HardwareSerial GPS(2);   // GPS: TX -> GPIO16, RX -> GPIO17
TinyGPSPlus gps;
HardwareSerial GSM(1);   // GSM: module TX (3VT) -> GPIO26, module RX (3VR) -> GPIO27, GND common
                         // SIM900A big board: power 5V 2A (buck), TTL pins 3VT/3VR, NOT the RS232 header

// Wi-Fi, server URL, device token and phone numbers live in secrets.h (copy secrets.example.h).
#include "secrets.h"

// Kitne numbers par SMS jaye (max 3). Har contact ka status server par jata hai.
const int SMS_CONTACTS_TO_SEND = 3;

// Active buzzer module: signal pin GPIO18, GND to ESP32 GND.
const int BUZZER_PIN = 18;

Preferences preferences;
String pendingSmsQueue = "[]";
String currentEventId = "";

// Background task timers and reported buzzer state
bool buzzerState = false;
bool alarmActive = false;  // countdown or SOS in progress
bool lastReportedBuzzer = false;
bool buzzerStatusDirty = true;
unsigned long lastBuzzerSync = 0;
unsigned long lastLocationUpload = 0;
unsigned long lastQueueSync = 0;
unsigned long lastWiFiAttempt = 0;
const unsigned long LOCATION_UPLOAD_INTERVAL_MS = 10000;
const unsigned long BUZZER_SYNC_INTERVAL_MS = 5000;
const unsigned long QUEUE_SYNC_INTERVAL_MS = 15000;
const unsigned long WIFI_RETRY_INTERVAL_MS = 10000; 

// ---------- TEST SWITCHES ----------
const bool DRY_RUN = false;            // true = SMS nahi bhejega (breadboard test). Final me false
const bool REQUIRE_RIDING = false;    // true = GPS speed >= RIDING_KMPH hone par hi detection (helmet par true)
const bool SEVERE_BYPASS = true;      // true = ek bahut zor ka takkar seedha alert
const bool SUSTAINED_ENABLED = true;  // true = lagatar tez motion se bhi alert

// Pins
const int SOS_PIN = 25;
const int SDA_PIN = 32;
const int SCL_PIN = 33;
const uint32_t I2C_CLOCK = 100000;  // 400000 breadboard par 'MPU read error' deta hai

// MPU6500
const uint8_t MPU_ADDR = 0x68;
const float ACC_SCALE = 2048.0f;  // +/-16g
const float GYRO_SCALE = 65.5f;   // +/-500 deg/s

const float GYRO_BIAS_X = -3.053f;
const float GYRO_BIAS_Y = -0.684f;
const float GYRO_BIAS_Z =  0.056f;

// ---------- Gravity direction estimate ----------
const float GRAV_ALPHA = 0.004f;   // slow filter (~0.5 s) taaki road bumps gravity me na ghusein
const float GRAV_BAND_G = 0.2f;    // gravity sirf tab update hoti hai jab |acc| ~ 1 g (+/-0.2)

// ---------- DETECTION 1: separate jerks ----------
const int   JERKS_REQUIRED = 4;                 // 4 ya 5
const float JERK_H_G = 1.2f;                    // horizontal spike (crash-like) -> 1 jhatka
const float JERK_V_G = 3.0f;                    // vertical spike (road bump jaisa) -> bada hi chahiye
const float SEVERE_FACTOR = 3.0f;               // threshold ka 3 guna = severe (H 3.6 g ya V 9 g)
const unsigned long JERK_WINDOW_MS = 10000;     // saare jhatke itne time ke andar
const unsigned long JERK_MIN_GAP_MS = 200;      // ek hi impact do baar count na ho

// ---------- DETECTION 2: sustained rapid motion ----------
const unsigned long SUSTAINED_MS = 5000;        // 5000-10000 ms
const float SUSTAINED_H_G = 0.5f;               // horizontal acc (g) itne se upar = active (vertical ignore)
const float SUSTAINED_GYRO = 100.0f;            // deg/s, yaw ke alawa rotation itne se upar = active
const unsigned long SUSTAINED_GAP_MS = 400;     // itni der shaant rahe to streak toot jaati hai

// ---------- Timings ----------
const unsigned long COOLDOWN_MS = 10000;
const unsigned long COUNTDOWN_MS = 15000;
const unsigned long SENSOR_INTERVAL_MS = 2;     // ~500 Hz
const unsigned long DEBUG_INTERVAL_MS = 1000;
const unsigned long GPS_STALE_MS = 3000;
const unsigned long DEBOUNCE_MS = 40;

// ---------- Riding gate ----------
const float RIDING_KMPH = 10.0f;
const unsigned long RIDING_MEMORY_MS = 15000;

// ---------- GSM settings ----------
const unsigned long GSM_NETWORK_WAIT_MS = 45000;       // setup me network ka intezaar
const unsigned long GSM_SEND_NETWORK_WAIT_MS = 30000;  // SMS se pehle network gaya ho to itna wait
const int SMS_RETRIES = 2;                             // SMS fail hone par kitni baar try
bool gsmReady = false;                                 // AT + SIM + SMS text mode ready

// ---------- STATE ----------
enum State { IDLE, COUNTDOWN };
State state = IDLE;

struct Motion {
  float horizG;     // horizontal linear acceleration (g)
  float vertG;      // vertical linear acceleration (g), absolute
  float gyroNY;     // rotation excluding yaw (around gravity), deg/s
  float gyroTotal;  // total rotation, deg/s
};

bool mpuReady = false;

// gravity direction (unit vector, sensor frame)
bool gravityInit = false;
float gvx = 0, gvy = 0, gvz = 1;

unsigned long lastSensorRead = 0;
unsigned long lastDebugPrint = 0;
unsigned long lastMpuErrPrint = 0;
unsigned long lastRecover = 0;
int mpuFailCount = 0;
unsigned long lastIgnorePrint = 0;
unsigned long countdownStart = 0;
unsigned long lastDetection = 0;
unsigned long lastRidingTime = 0;

int jerkCount = 0;
unsigned long firstJerkTime = 0;
unsigned long lastJerkTime = 0;
float jerkPeakScore = 0;

unsigned long sustainedStart = 0;
unsigned long lastActiveTime = 0;

float printPeakH = 0;      // pichle 1 sec ke peaks (calibration ke liye)
float printPeakV = 0;
float printPeakGyro = 0;
int previousRemaining = -1;
const char *alertReason = "";

bool lastRawButton = HIGH;
bool stableButton = HIGH;
unsigned long lastButtonChange = 0;

// ================= MPU =================

bool writeMPU(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(reg);
  Wire.write(value);
  return Wire.endTransmission() == 0;
}

bool readRegister(uint8_t reg, uint8_t &value) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom((int)MPU_ADDR, 1) != 1) return false;
  value = Wire.read();
  return true;
}

bool initMPU() {
  uint8_t id = 0;
  if (!readRegister(0x75, id)) {
    Serial.println("MPU I2C read failed.");
    return false;
  }
  Serial.print("MPU WHO_AM_I: 0x");
  Serial.println(id, HEX);

  if (id != 0x70 && id != 0x71 && id != 0x68 && id != 0x69) {
    Serial.println("Unexpected MPU ID.");
    return false;
  }

  if (!writeMPU(0x6B, 0x80)) return false;  // reset
  delay(100);
  if (!writeMPU(0x6B, 0x01)) return false;  // wake, PLL clock
  delay(20);

  if (!writeMPU(0x1A, 0x03)) return false;  // gyro DLPF 41 Hz
  if (!writeMPU(0x19, 1)) return false;     // sample rate 500 Hz
  if (!writeMPU(0x1B, 0x08)) return false;  // gyro +/-500 dps
  if (!writeMPU(0x1C, 0x18)) return false;  // accel +/-16g
  if (!writeMPU(0x1D, 0x00)) return false;  // accel DLPF 218 Hz (impact spike na dabe)

  Serial.println("MPU configured successfully.");
  return true;
}

// Bytes ek-ek karke padhte hain (ek expression me 2 Wire.read() ka order guaranteed nahi hota)
int16_t read16() {
  uint8_t hi = Wire.read();
  uint8_t lo = Wire.read();
  return (int16_t)((hi << 8) | lo);
}

// Counters (debug line me dikhte hain)
unsigned long mpuRetryTotal = 0;  // read dobara karna pada
unsigned long mpuErrTotal = 0;    // 3 koshish ke baad bhi fail

// Ek baar 14 byte burst read. Galat/adhoori/glitch reading par false.
bool readMPUOnce(float &ax, float &ay, float &az,
                 float &gx, float &gy, float &gz) {
  while (Wire.available()) Wire.read();  // purana bacha data saaf

  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);
  if (Wire.endTransmission(true) != 0) return false;
  if (Wire.requestFrom((int)MPU_ADDR, 14) != 14) return false;

  int16_t axRaw = read16();
  int16_t ayRaw = read16();
  int16_t azRaw = read16();
  read16();  // temperature skip
  int16_t gxRaw = read16();
  int16_t gyRaw = read16();
  int16_t gzRaw = read16();

  // Teeno accel axis exactly 0 (ya sab -1) = bus glitch. Asli sensor aisa nahi deta.
  if (axRaw == 0 && ayRaw == 0 && azRaw == 0) return false;
  if (axRaw == -1 && ayRaw == -1 && azRaw == -1) return false;

  ax = axRaw / ACC_SCALE;
  ay = ayRaw / ACC_SCALE;
  az = azRaw / ACC_SCALE;

  gx = (gxRaw / GYRO_SCALE) - GYRO_BIAS_X;
  gy = (gyRaw / GYRO_SCALE) - GYRO_BIAS_Y;
  gz = (gzRaw / GYRO_SCALE) - GYRO_BIAS_Z;
  return true;
}

// Raw sample: acceleration in g, gyro in deg/s (bias removed). Fail par 3 baar try.
bool readMPU(float &ax, float &ay, float &az,
             float &gx, float &gy, float &gz) {
  for (int attempt = 0; attempt < 3; attempt++) {
    if (readMPUOnce(ax, ay, az, gx, gy, gz)) return true;
    mpuRetryTotal++;
    delayMicroseconds(200);
  }
  mpuErrTotal++;
  return false;
}

// Raw sample -> vertical / horizontal / non-yaw rotation
bool analyzeMotion(float ax, float ay, float az,
                   float gx, float gy, float gz, Motion &m) {
  float mag = sqrtf(ax * ax + ay * ay + az * az);

  if (!gravityInit) {
    if (mag < 0.5f) return false;  // free-fall jaisi reading par gravity seekhna bekaar
    gvx = ax / mag;
    gvy = ay / mag;
    gvz = az / mag;
    gravityInit = true;
  } else if (fabsf(mag - 1.0f) < GRAV_BAND_G) {
    // Sirf tab update jab sensor lagbhag 1 g dekh raha ho (dhire dhire head tilt follow kare)
    gvx += GRAV_ALPHA * (ax - gvx);
    gvy += GRAV_ALPHA * (ay - gvy);
    gvz += GRAV_ALPHA * (az - gvz);
    float gm = sqrtf(gvx * gvx + gvy * gvy + gvz * gvz);
    if (gm > 0.1f) {
      gvx /= gm;
      gvy /= gm;
      gvz /= gm;
    }
  }

  // Linear acceleration = measured - gravity
  float lx = ax - gvx;
  float ly = ay - gvy;
  float lz = az - gvz;

  float vert = lx * gvx + ly * gvy + lz * gvz;   // gravity ki direction me (upar-neeche)
  float hx = lx - vert * gvx;                    // baaki = horizontal
  float hy = ly - vert * gvy;
  float hz = lz - vert * gvz;

  m.vertG = fabsf(vert);
  m.horizG = sqrtf(hx * hx + hy * hy + hz * hz);

  // Rotation: yaw (gravity axis ke around, sir ghumaana) hata ke
  float gTot2 = gx * gx + gy * gy + gz * gz;
  float gPar = gx * gvx + gy * gvy + gz * gvz;
  float ny2 = gTot2 - gPar * gPar;
  if (ny2 < 0) ny2 = 0;

  m.gyroTotal = sqrtf(gTot2);
  m.gyroNY = sqrtf(ny2);
  return true;
}

// I2C bus reset + MPU dobara init (bus hang ya MPU hang hone par)
void recoverI2C() {
  Serial.println("I2C recovery: bus reset + MPU re-init...");
  Wire.end();
  pinMode(SDA_PIN, INPUT_PULLUP);
  pinMode(SCL_PIN, OUTPUT);
  // Agar slave ne SDA low pakad rakha ho to SCL ke 9 pulse use chhod dete hain
  for (int i = 0; i < 9; i++) {
    digitalWrite(SCL_PIN, LOW);
    delayMicroseconds(10);
    digitalWrite(SCL_PIN, HIGH);
    delayMicroseconds(10);
  }
  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(I2C_CLOCK);
  gravityInit = false;
  mpuFailCount = 0;
  mpuReady = initMPU();
  if (mpuReady) Serial.println("MPU recovered.");
  else Serial.println("MPU still not responding. Wiring/power check karo.");
}

// ================= GPS =================

void updateGPS() {
  while (GPS.available()) gps.encode(GPS.read());
}

bool gpsIsFresh() {
  return gps.location.isValid() && gps.location.age() < GPS_STALE_MS;
}

void updateRidingMemory() {
  if (gps.speed.isValid() && gps.speed.age() < GPS_STALE_MS &&
      gps.speed.kmph() >= RIDING_KMPH) {
    lastRidingTime = millis();
  }
}

bool wasRiding() {
  return lastRidingTime != 0 && millis() - lastRidingTime < RIDING_MEMORY_MS;
}

// ================= GSM =================

void clearGSM() {
  while (GSM.available()) GSM.read();
}

// Kisi khaas jawab (jaise ">" ya "+CMGS:") ka intezaar. ERROR aaye to turant false.
bool waitForResponse(const char *expected, unsigned long timeout) {
  String response;
  unsigned long start = millis();

  while (millis() - start < timeout) {
    updateGPS();

    while (GSM.available()) {
      char c = (char)GSM.read();
      response += c;

      if (response.indexOf(expected) >= 0) {
        Serial.print("GSM RESPONSE: ");
        Serial.println(response);
        return true;
      }

      if (response.indexOf("ERROR") >= 0) {
        Serial.print("GSM response: ");
        Serial.println(response);
        return false;
      }

      if (response.length() > 400) response.remove(0, 200);
    }
    delay(2);
  }

  Serial.println("GSM response timeout.");
  return false;
}

// Command bhejo aur "OK" ya "ERROR" aane tak (ya timeout) poora jawab resp me lo.
// true = OK mila.
bool gsmQuery(const char *command, String &resp, unsigned long timeout = 2000) {
  clearGSM();
  Serial.print(">> ");
  Serial.println(command);
  GSM.println(command);

  resp = "";
  unsigned long start = millis();
  bool ok = false;

  while (millis() - start < timeout) {
    updateGPS();
    while (GSM.available()) resp += (char)GSM.read();

    if (resp.indexOf("\r\nOK\r\n") >= 0) { ok = true; break; }
    if (resp.indexOf("ERROR") >= 0) break;
    delay(2);
  }

  resp.trim();
  Serial.println(resp.length() ? resp : "(no reply)");
  return ok;
}

// +CREG ka status: 1 = home network, 5 = roaming (dono theek). -1 = jawab nahi mila.
int gsmCreg() {
  String r;
  if (!gsmQuery("AT+CREG?", r)) return -1;
  int i = r.indexOf("+CREG:");
  if (i < 0) return -1;
  int c = r.indexOf(',', i);
  if (c < 0) return -1;
  return r.substring(c + 1).toInt();
}

// Signal: 0-31 (10+ theek), 99 = nahi. -1 = jawab nahi mila.
int gsmCsq() {
  String r;
  if (!gsmQuery("AT+CSQ", r)) return -1;
  int i = r.indexOf("+CSQ:");
  if (i < 0) return -1;
  return r.substring(i + 5).toInt();
}

bool gsmRegistered() {
  int s = gsmCreg();
  return s == 1 || s == 5;
}

// Network register hone ka intezaar (CREG 1 ya 5)
bool gsmWaitNetwork(unsigned long timeoutMs) {
  Serial.println("Waiting for GSM network registration...");
  unsigned long start = millis();
  bool triedCops = false;
  bool triedCfun = false;

  while (millis() - start < timeoutMs) {
    int stat = gsmCreg();
    int csq = gsmCsq();

    Serial.print("GSM network check -> CREG stat: ");
    Serial.print(stat);
    Serial.print(" | CSQ: ");
    Serial.println(csq);

    if (stat == 1 || stat == 5) {
      Serial.println("GSM NETWORK REGISTERED.");
      return true;
    }

    String r;
    // stat 0 = search hi nahi ho rahi: pehle auto operator, phir full functionality
    if (stat == 0 && !triedCops && millis() - start > 10000) {
      triedCops = true;
      gsmQuery("AT+COPS=0", r, 10000);
    }
    if (stat == 0 && !triedCfun && millis() - start > 20000) {
      triedCfun = true;
      gsmQuery("AT+CFUN=1", r, 5000);
    }

    unsigned long t = millis();
    while (millis() - t < 2000) {
      updateGPS();
      delay(5);
    }
  }

  Serial.println("GSM NOT REGISTERED. SMS nahi jayega jab tak network na mile.");
  Serial.println("Check: antenna, module power (5V 2A + 1000uF cap), SIM me 2G chalta ho, signal (CSQ>=10).");
  return false;
}

// Module jagao, echo band, SIM check, SMS text mode
bool gsmInit() {
  Serial.println("Initializing GSM...");
  String r;
  bool alive = false;

  // Pehle 1-2 AT autobaud me ignore ho sakte hain
  for (int i = 0; i < 8 && !alive; i++) {
    alive = gsmQuery("AT", r, 1000);
    if (!alive) delay(300);
  }
  if (!alive) {
    Serial.println("GSM NOT RESPONDING. Check TX/RX (GPIO26/27), GND, module power (SIM900A 5V 2A), baud 9600.");
    gsmReady = false;
    return false;
  }

  gsmQuery("ATE0", r);        // echo band
  gsmQuery("AT+CMEE=2", r);   // saaf error message

  if (!gsmQuery("AT+CPIN?", r) || r.indexOf("READY") < 0) {
    Serial.println("SIM NOT READY. SIM direction/size/PIN check karo (power band karke lagao).");
    gsmReady = false;
    return false;
  }

  gsmQuery("AT+CMGF=1", r);          // SMS text mode
  gsmQuery("AT+CSCS=\"GSM\"", r);

  gsmReady = true;
  Serial.println("GSM module ready.");
  return true;
}

bool sendSMS(const String &number, const String &message) {
  Serial.print("Preparing SMS for ");
  Serial.println(number);

  if (!gsmReady && !gsmInit()) return false;

  if (!gsmRegistered()) {
    Serial.println("Not registered on network. Waiting...");
    if (!gsmWaitNetwork(GSM_SEND_NETWORK_WAIT_MS)) return false;
  }

  for (int attempt = 1; attempt <= SMS_RETRIES; attempt++) {
    Serial.print("SMS attempt ");
    Serial.print(attempt);
    Serial.print("/");
    Serial.println(SMS_RETRIES);

    String r;
    gsmQuery("AT+CMGF=1", r);

    clearGSM();
    GSM.print("AT+CMGS=\"");
    GSM.print(number);
    GSM.println("\"");

    if (!waitForResponse(">", 8000)) {
      Serial.println("SMS prompt not received.");
      GSM.write(27);  // ESC: adhura SMS cancel
      delay(1000);
      continue;
    }

    delay(100);
    GSM.print(message);
    GSM.write(26);  // Ctrl+Z

    if (waitForResponse("+CMGS:", 40000)) {
      Serial.println("Modem accepted SMS submission.");
      return true;
    }

    Serial.println("SMS submission was not confirmed.");
    GSM.write(27);
    delay(2000);
  }
  return false;
}

void setBuzzer(bool on) {
  buzzerState = on;
  digitalWrite(BUZZER_PIN, on ? HIGH : LOW);
}

// Server sees the buzzer as ON for the whole countdown/SOS, not each 180 ms beep.
bool reportedBuzzer() {
  return alarmActive || buzzerState;
}

void sendEmergencyAlert(const char *reason) {
  alarmActive = true;
  setBuzzer(true);
  Serial.println("\n========== KAVACHAI SOS ==========");

  // NOTE: Wi-Fi ka intezaar yahan nahi: pehle SMS jayega, phir server upload.
  String eventId = String(DEVICE_ID) + "-" + String((uint32_t)millis());
  currentEventId = eventId;

  bool hasLocation = false;
  bool usedServerLocation = false;
  double lat = 0.0, lon = 0.0;
  String locationTimestamp = "";

  // Prefer fresh GPS coordinates.
  if (gpsIsFresh()) {
    hasLocation = true;
    lat = gps.location.lat();
    lon = gps.location.lng();
    locationTimestamp = "current GPS";
  } else {
    Serial.println("Current GPS unavailable. Fetching last server location...");
    if (fetchLastServerLocation(lat, lon, locationTimestamp)) {
      hasLocation = true;
      usedServerLocation = true;
      Serial.println("Last known server location received.");
    } else {
      Serial.println("No usable server location available.");
    }
  }

  // Chhota SMS (160 char ke andar) taaki ek hi message me jaye
  String msg = "KAVACHAI SOS ";
  msg += DEVICE_ID;
  msg += ": ";
  msg += reason;

  if (hasLocation) {
    msg += "\nhttps://maps.google.com/?q=";
    msg += String(lat, 6) + "," + String(lon, 6);
    if (usedServerLocation) msg += "\n(last known location)";
  } else {
    msg += "\nGPS unavailable. Contact helmet user now.";
  }

  Serial.print("SMS length: ");
  Serial.println(msg.length());

  int contacts = SMS_CONTACTS_TO_SEND;
  if (contacts > 3) contacts = 3;

  // Wi-Fi pehle se connected ho to incident turant server par (intezaar nahi karta).
  // Nahi hua to SMS ke baad connect karke bhejenge.
  bool incidentUploaded = uploadIncident(eventId, reason, hasLocation, lat, lon);

  int sentCount = 0;
  for (int i = 0; i < contacts; i++) {
    String number = String(PHONE_NUMBERS[i]);
    Serial.print("Sending emergency SMS ");
    Serial.print(i + 1);
    Serial.print("/");
    Serial.print(contacts);
    Serial.print(" to ");
    Serial.println(number);

    bool sent = false;
    String modemResult = "Modem did not confirm SMS submission.";

    if (DRY_RUN) {
      Serial.println("[DRY RUN] SMS not sent:");
      Serial.println(msg);
      modemResult = "DRY_RUN: not actually sent";
    } else {
      sent = sendSMS(number, msg);
      modemResult = sent
          ? "Modem accepted SMS submission (+CMGS). Delivery not guaranteed."
          : "SMS submission failed or timed out.";
    }

    if (sent) sentCount++;

    Serial.print("Contact ");
    Serial.print(i + 1);
    Serial.println(sent ? ": SENT (modem accepted)" : ": FAILED / NOT SENT");

    // Har contact ka status turant server ko. Wi-Fi/server na ho to Preferences queue me
    // save hota hai aur baad me sync hota hai. Ek contact fail ho to agla phir bhi try hota hai.
    reportSmsResult(eventId, i + 1, number, sent, modemResult);
    delay(1000);
  }

  setBuzzer(false);
  alarmActive = false;

  Serial.print("SMS summary: ");
  Serial.print(sentCount);
  Serial.print("/");
  Serial.print(contacts);
  Serial.println(" contacts accepted by modem.");

  // Wi-Fi pehle nahi tha to ab connect karke incident aur queued statuses bhejo
  if (!incidentUploaded) {
    connectWiFi();
    incidentUploaded = uploadIncident(eventId, reason, hasLocation, lat, lon);
  }
  syncBuzzerStatus();
  syncPendingSmsResults();

  Serial.println("========== SOS PROCESS FINISHED ==========");
}

// ================= NETWORK / SERVER / SMS REPORTING =================

String deviceUrl(const String &path) {
  return String(SERVER_BASE) + path;
}

// http:// URLs use a plain connection; https:// needs the caller's TLS client to outlive http.
bool beginHttp(HTTPClient &http, WiFiClientSecure &tls, const String &url) {
  if (url.startsWith("https://")) {
    tls.setInsecure();  // Certificate is not verified; pin a root CA before real deployment.
    http.setTimeout(10000);
    return http.begin(tls, url);
  }
  http.setTimeout(4000);
  return http.begin(url);
}

const char *wifiStatusText(wl_status_t status) {
  switch (status) {
    case WL_IDLE_STATUS: return "IDLE";
    case WL_NO_SSID_AVAIL: return "SSID_NOT_FOUND";
    case WL_SCAN_COMPLETED: return "SCAN_COMPLETED";
    case WL_CONNECTED: return "CONNECTED";
    case WL_CONNECT_FAILED: return "CONNECT_FAILED";
    case WL_CONNECTION_LOST: return "CONNECTION_LOST";
    case WL_DISCONNECTED: return "DISCONNECTED";
    default: return "UNKNOWN";
  }
}

void printServerHealth() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  WiFiClientSecure tls;
  String healthUrl = String(SERVER_BASE) + "/api/v1/health";

  Serial.print("Checking KavachAI server: ");
  Serial.println(healthUrl);

  if (!beginHttp(http, tls, healthUrl)) {
    Serial.println("Server check failed: could not start HTTP connection.");
    return;
  }

  int code = http.GET();
  if (code >= 200 && code < 300) {
    Serial.print("KAVACHAI SERVER CONNECTED. HTTP ");
    Serial.println(code);
    Serial.println(http.getString());
  } else {
    Serial.print("Wi-Fi is connected, but server is not reachable. HTTP code: ");
    Serial.println(code);
    if (code > 0) Serial.println(http.getString());
  }
  http.end();
}

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("Wi-Fi already connected. IP: ");
    Serial.println(WiFi.localIP());
    return;
  }

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.setSleep(false);

  Serial.print("Connecting to hotspot SSID: ");
  Serial.println(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  // Allow slower phone hotspots enough time to complete association.
  unsigned long started = millis();
  unsigned long lastDot = 0;
  while (WiFi.status() != WL_CONNECTED && millis() - started < 30000) {
    if (millis() - lastDot >= 1000) {
      lastDot = millis();
      Serial.print(".");
    }
    delay(50);
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("WIFI CONNECTED.");
    Serial.print("Connected SSID: ");
    Serial.println(WiFi.SSID());
    Serial.print("ESP32 IP: ");
    Serial.println(WiFi.localIP());
    Serial.print("Signal RSSI: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
    printServerHealth();
  } else {
    Serial.print("WIFI NOT CONNECTED. Status: ");
    Serial.print((int)WiFi.status());
    Serial.print(" (");
    Serial.print(wifiStatusText(WiFi.status()));
    Serial.println("). GSM emergency SMS can still work.");
  }
}

bool httpRequest(const String &url, const String &method,
                 const String &body, String &response) {
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  WiFiClientSecure tls;
  if (!beginHttp(http, tls, url)) return false;
  http.addHeader("X-Device-Token", DEVICE_SECRET);
  if (method == "POST") http.addHeader("Content-Type", "application/json");

  int code = (method == "POST")
      ? http.POST(body)
      : http.GET();

  if (code > 0) response = http.getString();
  http.end();
  return code >= 200 && code < 300;
}

void syncBuzzerStatus() {
  if (WiFi.status() != WL_CONNECTED) return;

  bool reported = reportedBuzzer();
  if (reported != lastReportedBuzzer) buzzerStatusDirty = true;
  if (!buzzerStatusDirty &&
      millis() - lastBuzzerSync < BUZZER_SYNC_INTERVAL_MS) return;

  StaticJsonDocument<128> doc;
  doc["buzzer_active"] = reported;
  String body, response;
  serializeJson(doc, body);

  bool ok = httpRequest(
      deviceUrl("/api/v1/device/" + String(DEVICE_ID) + "/buzzer-status"),
      "POST", body, response);
  lastBuzzerSync = millis();

  if (ok) {
    buzzerStatusDirty = false;
    lastReportedBuzzer = reported;
    Serial.println("Buzzer status synced with server.");
  } else {
    Serial.println("Buzzer status sync failed; will retry.");
  }
}

void uploadLocation() {
  if (!gpsIsFresh() || WiFi.status() != WL_CONNECTED) return;

  StaticJsonDocument<256> doc;
  doc["latitude"] = gps.location.lat();
  doc["longitude"] = gps.location.lng();
  doc["gps_valid"] = true;
  if (gps.speed.isValid()) doc["speed_kmh"] = gps.speed.kmph();

  String body;
  serializeJson(doc, body);
  String response;
  bool ok = httpRequest(
      deviceUrl("/api/v1/device/" + String(DEVICE_ID) + "/location"),
      "POST", body, response);

  Serial.println(ok ? "GPS uploaded to KavachAI server." :
                      "GPS upload failed; will retry on next interval.");
}

bool fetchLastServerLocation(double &lat, double &lon, String &recordedAt) {
  if (WiFi.status() != WL_CONNECTED) return false;

  String response;
  bool ok = httpRequest(
      deviceUrl("/api/v1/device/" + String(DEVICE_ID) + "/location/latest-for-device"),
      "GET", "", response);
  if (!ok) {
    Serial.println("Could not fetch last server location.");
    return false;
  }

  StaticJsonDocument<512> doc;
  if (deserializeJson(doc, response)) return false;
  if (!doc["gps_valid"].as<bool>()) return false;
  if (doc["latitude"].isNull() || doc["longitude"].isNull()) return false;

  lat = doc["latitude"].as<double>();
  lon = doc["longitude"].as<double>();
  recordedAt = doc["recorded_at"] | "timestamp unavailable";
  return true;
}

bool uploadIncident(const String &eventId, const char *reason,
                    bool hasLocation, double lat, double lon) {
  if (WiFi.status() != WL_CONNECTED) return false;

  StaticJsonDocument<384> doc;
  doc["event_id"] = eventId;
  doc["event_type"] = "SOS";
  if (hasLocation) {
    doc["latitude"] = lat;
    doc["longitude"] = lon;
  } else {
    doc["latitude"] = nullptr;
    doc["longitude"] = nullptr;
  }
  doc["details"] = reason;

  String body, response;
  serializeJson(doc, body);
  bool ok = httpRequest(
      deviceUrl("/api/v1/device/" + String(DEVICE_ID) + "/incidents"),
      "POST", body, response);
  Serial.println(ok ? "SOS incident uploaded." : "SOS incident upload failed.");
  return ok;
}

bool postSmsResult(const String &eventId, int index,
                   const String &number, bool sent, const String &modemResponse) {
  if (WiFi.status() != WL_CONNECTED) return false;

  StaticJsonDocument<384> doc;
  doc["event_id"] = eventId;
  doc["contact_index"] = index;
  doc["contact_number"] = number;
  doc["status"] = sent ? "SENT" : "FAILED";
  doc["modem_response"] = modemResponse;

  String body, response;
  serializeJson(doc, body);
  return httpRequest(
      deviceUrl("/api/v1/device/" + String(DEVICE_ID) + "/sms-status"),
      "POST", body, response);
}

void savePendingSmsResult(const String &eventId, int index,
                          const String &number, bool sent,
                          const String &modemResponse) {
  StaticJsonDocument<2048> queueDoc;
  deserializeJson(queueDoc, pendingSmsQueue);
  JsonArray arr = queueDoc.as<JsonArray>();
  if (arr.isNull()) arr = queueDoc.to<JsonArray>();

  JsonObject item = arr.add<JsonObject>();
  item["event_id"] = eventId;
  item["contact_index"] = index;
  item["contact_number"] = number;
  item["status"] = sent ? "SENT" : "FAILED";
  item["modem_response"] = modemResponse;

  pendingSmsQueue = "";
  serializeJson(queueDoc, pendingSmsQueue);
  preferences.putString("smsqueue", pendingSmsQueue);
}

void syncPendingSmsResults() {
  if (WiFi.status() != WL_CONNECTED) return;

  StaticJsonDocument<2048> queueDoc;
  if (deserializeJson(queueDoc, pendingSmsQueue)) {
    pendingSmsQueue = "[]";
    preferences.putString("smsqueue", pendingSmsQueue);
    return;
  }

  JsonArray arr = queueDoc.as<JsonArray>();
  StaticJsonDocument<2048> remainingDoc;
  JsonArray remaining = remainingDoc.to<JsonArray>();

  for (JsonObject item : arr) {
    String eventId = item["event_id"] | "";
    int index = item["contact_index"] | 0;
    String number = item["contact_number"] | "";
    String status = item["status"] | "FAILED";
    String modem = item["modem_response"] | "";

    bool ok = postSmsResult(eventId, index, number,
                            status == "SENT", modem);
    if (!ok) {
      JsonObject copy = remaining.add<JsonObject>();
      copy.set(item);
    }
  }

  pendingSmsQueue = "";
  serializeJson(remainingDoc, pendingSmsQueue);
  preferences.putString("smsqueue", pendingSmsQueue);
}

void reportSmsResult(const String &eventId, int index,
                     const String &number, bool sent,
                     const String &modemResponse) {
  if (postSmsResult(eventId, index, number, sent, modemResponse)) {
    Serial.print("SMS result uploaded to server for contact ");
    Serial.println(index);
  } else {
    savePendingSmsResult(eventId, index, number, sent, modemResponse);
    Serial.print("SMS result for contact ");
    Serial.print(index);
    Serial.println(" saved locally; server sync pending.");
  }
}


// ================= SOS BUTTON =================

bool buttonPressedEvent() {
  bool raw = digitalRead(SOS_PIN);

  if (raw != lastRawButton) {
    lastRawButton = raw;
    lastButtonChange = millis();
  }

  if (millis() - lastButtonChange >= DEBOUNCE_MS) {
    if (stableButton != raw) {
      stableButton = raw;
      if (stableButton == LOW) return true;
    }
  }
  return false;
}

// ================= SERIAL TEST COMMANDS =================
// Serial Monitor me type karein (115200, Both NL & CR):
//   gsm      -> module / SIM / signal / network status
//   testsms  -> "hello shravan" pehle emergency number par

void handleSerialCommands() {
  if (!Serial.available()) return;

  String cmd = Serial.readStringUntil('\n');
  cmd.trim();
  if (cmd.length() == 0) return;

  if (cmd.equalsIgnoreCase("gsm")) {
    Serial.println("--- GSM STATUS ---");
    if (gsmInit()) {
      int csq = gsmCsq();
      int stat = gsmCreg();
      if (csq >= 0 && csq != 99) {
        Serial.print("Signal: CSQ ");
        Serial.print(csq);
        Serial.print(" = ");
        Serial.print(-113 + 2 * csq);
        Serial.println(" dBm");
      } else {
        Serial.println("Signal: none (CSQ 0/99)");
      }
      Serial.println((stat == 1 || stat == 5) ? "Network: REGISTERED"
                                               : "Network: NOT registered");
      String r;
      gsmQuery("AT+COPS?", r);
    }
    Serial.println("------------------");
  } else if (cmd.equalsIgnoreCase("testsms")) {
    Serial.println("Sending test SMS...");
    bool ok = sendSMS(String(PHONE_NUMBERS[0]), "hello shravan");
    Serial.println(ok ? "[PASS] Test SMS sent" : "[FAIL] Test SMS not sent");
  } else {
    Serial.println("Unknown command. Use: gsm  or  testsms");
  }
}

// ================= DETECTION =================

void resetJerks() {
  jerkCount = 0;
  firstJerkTime = 0;
  lastJerkTime = 0;
  jerkPeakScore = 0;
}

void resetSustained() {
  sustainedStart = 0;
  lastActiveTime = 0;
}

const char *stateName() {
  return state == IDLE ? "IDLE" : "COUNTDOWN";
}

void startCountdown(const char *reason) {
  state = COUNTDOWN;
  countdownStart = millis();
  previousRemaining = -1;
  alertReason = reason;
  resetJerks();
  resetSustained();

  Serial.println("\n*** POSSIBLE ACCIDENT ***");
  Serial.print("Reason: ");
  Serial.println(reason);
  Serial.println("15-second countdown started.");
  Serial.println("Press SOS button to cancel.");

  alarmActive = true;
  syncBuzzerStatus();
}

void updateDetection(const Motion &m) {
  unsigned long now = millis();

  // Jerk score: 1.0 = threshold. Horizontal aur vertical ke alag thresholds.
  float scoreH = m.horizG / JERK_H_G;
  float scoreV = m.vertG / JERK_V_G;
  float score = scoreH > scoreV ? scoreH : scoreV;

  if (m.horizG > printPeakH) printPeakH = m.horizG;
  if (m.vertG > printPeakV) printPeakV = m.vertG;
  if (m.gyroNY > printPeakGyro) printPeakGyro = m.gyroNY;

  if (now - lastDebugPrint >= DEBUG_INTERVAL_MS) {
    lastDebugPrint = now;
    float activeSec = sustainedStart ? (now - sustainedStart) / 1000.0f : 0.0f;
    Serial.print(stateName());
    Serial.print(" | H: ");
    Serial.print(m.horizG, 2);
    Serial.print(" g V: ");
    Serial.print(m.vertG, 2);
    Serial.print(" g GyroNY: ");
    Serial.print(m.gyroNY, 0);
    Serial.print(" dps | Peak(1s) H: ");
    Serial.print(printPeakH, 2);
    Serial.print(" V: ");
    Serial.print(printPeakV, 2);
    Serial.print(" GyroNY: ");
    Serial.print(printPeakGyro, 0);
    Serial.print(" | Jerks: ");
    Serial.print(jerkCount);
    Serial.print("/");
    Serial.print(JERKS_REQUIRED);
    Serial.print(" | Active: ");
    Serial.print(activeSec, 1);
    Serial.print("/");
    Serial.print(SUSTAINED_MS / 1000.0f, 0);
    Serial.print(" s | I2C retry/err: ");
    Serial.print(mpuRetryTotal);
    Serial.print("/");
    Serial.println(mpuErrTotal);
    printPeakH = 0;
    printPeakV = 0;
    printPeakGyro = 0;
  }

  if (state != IDLE || !mpuReady) return;
  if (lastDetection != 0 && now - lastDetection < COOLDOWN_MS) return;

  // Riding gate: bike chalte hue hi detection (helmet haath se gira to ignore)
  if (REQUIRE_RIDING && !wasRiding()) {
    if ((score >= 1.0f || m.gyroNY >= SUSTAINED_GYRO) &&
        now - lastIgnorePrint > 1000) {
      lastIgnorePrint = now;
      Serial.println("Motion ignored (not riding).");
    }
    resetJerks();
    resetSustained();
    return;
  }

  // ---------- Detection 1: separate jerks ----------
  if (jerkCount > 0 && now - firstJerkTime > JERK_WINDOW_MS) {
    Serial.println("Jerk window expired, count reset.");
    resetJerks();
  }

  if (score >= 1.0f) {
    if (jerkCount > 0 && now - lastJerkTime < JERK_MIN_GAP_MS) {
      // Ye usi impact ka hissa hai, dobara count nahi karna
      if (score > jerkPeakScore) jerkPeakScore = score;
    } else {
      if (jerkCount == 0) firstJerkTime = now;
      jerkCount++;
      lastJerkTime = now;
      if (score > jerkPeakScore) jerkPeakScore = score;

      Serial.print("Jerk ");
      Serial.print(jerkCount);
      Serial.print("/");
      Serial.print(JERKS_REQUIRED);
      Serial.print(" (H ");
      Serial.print(m.horizG, 1);
      Serial.print(" g, V ");
      Serial.print(m.vertG, 1);
      Serial.println(" g)");
    }

    if (jerkCount >= JERKS_REQUIRED) {
      startCountdown("Multiple impacts detected; countdown not cancelled");
      return;
    }
    if (SEVERE_BYPASS && jerkPeakScore >= SEVERE_FACTOR) {
      startCountdown("Severe impact detected; countdown not cancelled");
      return;
    }
  }

  // ---------- Detection 2: sustained rapid motion ----------
  if (SUSTAINED_ENABLED) {
    // Vertical (road bumps) aur yaw (sir ghumaana) is check me count nahi hote
    bool active = (m.horizG >= SUSTAINED_H_G) || (m.gyroNY >= SUSTAINED_GYRO);

    if (active) {
      if (sustainedStart == 0) sustainedStart = now;
      lastActiveTime = now;
    } else if (sustainedStart != 0 && now - lastActiveTime > SUSTAINED_GAP_MS) {
      sustainedStart = 0;  // streak toot gayi
    }

    if (sustainedStart != 0 && now - sustainedStart >= SUSTAINED_MS) {
      startCountdown("Continuous violent motion; countdown not cancelled");
      return;
    }
  }
}

void updateCountdown() {
  if (state != COUNTDOWN) return;

  unsigned long elapsed = millis() - countdownStart;
  unsigned long remaining =
      elapsed >= COUNTDOWN_MS ? 0 : (COUNTDOWN_MS - elapsed + 999) / 1000;

  if ((int)remaining != previousRemaining) {
    previousRemaining = (int)remaining;
    Serial.print("Countdown: ");
    Serial.print(remaining);
    Serial.println(" seconds");
  }

  // Beep briefly at the beginning of each countdown second.
  unsigned long phase = elapsed % 1000;
  setBuzzer(phase < 180);

  if (elapsed >= COUNTDOWN_MS) {
    setBuzzer(false);
    state = IDLE;
    previousRemaining = -1;
    sendEmergencyAlert(alertReason);
    lastDetection = millis();
  }
}

// ================= SETUP =================

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n=== KavachAI Integrated Prototype ===");
  Serial.print("DRY_RUN: ");
  Serial.println(DRY_RUN ? "ON (SMS nahi jayega)" : "OFF (real SMS)");
  Serial.print("REQUIRE_RIDING: ");
  Serial.println(REQUIRE_RIDING ? "ON" : "OFF");

  pinMode(SOS_PIN, INPUT_PULLUP);
  pinMode(BUZZER_PIN, OUTPUT);
  setBuzzer(false);

  preferences.begin("kavach", false);
  pendingSmsQueue = preferences.getString("smsqueue", "[]");

  // Start UART peripherals before Wi-Fi setup so GPS parsing is initialized.
  GPS.begin(9600, SERIAL_8N1, 16, 17);
  GSM.begin(9600, SERIAL_8N1, 26, 27);

  // GSM pehle jagao: network search Wi-Fi connect hote waqt background me chalti rahegi
  Serial.println("Checking GSM...");
  gsmInit();

  connectWiFi();
  syncPendingSmsResults();

  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(I2C_CLOCK);

  // SMS ke liye network registration zaroori hai
  if (gsmReady) gsmWaitNetwork(GSM_NETWORK_WAIT_MS);

  Serial.println("Initializing MPU... (device ko abhi still rakho)");
  mpuReady = initMPU();

  if (!mpuReady) {
    Serial.println("Automatic detection disabled.");
    Serial.println("Manual SOS is still available.");
  }

  lastDebugPrint = millis();
  lastWiFiAttempt = millis();
  lastLocationUpload = millis() - LOCATION_UPLOAD_INTERVAL_MS;
  lastBuzzerSync = millis() - BUZZER_SYNC_INTERVAL_MS;
  lastQueueSync = millis() - QUEUE_SYNC_INTERVAL_MS;

  Serial.println("GPS is running.");
  Serial.println("Press SOS for manual alert. Serial: gsm / testsms");
}

// ================= LOOP =================

void loop() {
  updateGPS();
  updateRidingMemory();
  handleSerialCommands();

  // Wi-Fi is for dashboard sync only; GSM SMS works independently.
  if (WiFi.status() != WL_CONNECTED &&
      millis() - lastWiFiAttempt >= WIFI_RETRY_INTERVAL_MS) {
    lastWiFiAttempt = millis();
    connectWiFi();
  }

  if (WiFi.status() == WL_CONNECTED) {
    if (millis() - lastLocationUpload >= LOCATION_UPLOAD_INTERVAL_MS) {
      lastLocationUpload = millis();
      uploadLocation();
    }
    syncBuzzerStatus();

    if (millis() - lastQueueSync >= QUEUE_SYNC_INTERVAL_MS) {
      lastQueueSync = millis();
      syncPendingSmsResults();
    }
  }

  if (buttonPressedEvent()) {
    if (state == COUNTDOWN) {
      state = IDLE;
      previousRemaining = -1;
      lastDetection = millis();
      resetJerks();
      resetSustained();
      setBuzzer(false);
      alarmActive = false;
      syncBuzzerStatus();
      Serial.println("Countdown cancelled.");
    } else {
      Serial.println("Manual SOS pressed.");
      sendEmergencyAlert("Manual SOS button");
    }
  }

  if (!mpuReady && millis() - lastRecover >= 3000) {
    lastRecover = millis();
    recoverI2C();
  }

  if (mpuReady && millis() - lastSensorRead >= SENSOR_INTERVAL_MS) {
    lastSensorRead = millis();
    float ax, ay, az, gx, gy, gz;

    if (readMPU(ax, ay, az, gx, gy, gz)) {
      mpuFailCount = 0;
      Motion m;
      if (analyzeMotion(ax, ay, az, gx, gy, gz, m)) {
        updateDetection(m);
      }
    } else {
      mpuFailCount++;
      if (millis() - lastMpuErrPrint >= DEBUG_INTERVAL_MS) {
        lastMpuErrPrint = millis();
        Serial.print("MPU read error (lagatar: ");
        Serial.print(mpuFailCount);
        Serial.println(")");
      }
      if (mpuFailCount >= 20 && millis() - lastRecover >= 1000) {
        lastRecover = millis();
        recoverI2C();
      }
    }
  }

  updateCountdown();
}
