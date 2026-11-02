#pragma once

// Copy this file to secrets.h and fill in your own values.
const char WIFI_SSID[] = "your-wifi-name";
const char WIFI_PASSWORD[] = "your-wifi-password";
// Backend computer's LAN IP and port, e.g. run `ipconfig` on that computer.
const char SERVER_BASE[] = "http://192.168.0.10:5000";
const char DEVICE_ID[] = "H1";
// Must equal HELMET_DEVICE_KEY in backend/.env.
const char DEVICE_SECRET[] = "same-value-as-HELMET_DEVICE_KEY";

const char *PHONE_NUMBERS[3] = {
  "+910000000000",
  "+910000000000",
  "+910000000000"
};
