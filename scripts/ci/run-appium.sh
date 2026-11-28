#!/usr/bin/env bash
set -euo pipefail

mkdir -p reports/evidence
PHARMALERT_DB=:memory: PHARMALERT_HOST=127.0.0.1 node --experimental-transform-types --env-file-if-exists=.env backend/index.ts > reports/evidence/appium-backend.log 2>&1 &
backend_pid=$!
appium > reports/evidence/appium-server.log 2>&1 &
appium_pid=$!
android_serial=""
cleanup() {
  status=$?
  trap - EXIT
  if [[ "$status" -ne 0 && -n "$android_serial" ]]; then
    adb -s "$android_serial" logcat -d -v threadtime > reports/evidence/android-logcat.txt 2>&1 || true
    adb -s "$android_serial" shell dumpsys activity activities > reports/evidence/android-activities.txt 2>&1 || true
  fi
  kill "$backend_pid" "$appium_pid" 2>/dev/null || true
  wait "$backend_pid" "$appium_pid" 2>/dev/null || true
  exit "$status"
}
trap cleanup EXIT

timeout 120 bash -c 'until curl -fsS http://127.0.0.1:4723/status; do sleep 2; done'
timeout 120 bash -c 'until curl -fsS http://127.0.0.1:8787/api/status; do sleep 2; done'

adb devices -l | tee reports/evidence/android-devices.log
android_serial="$(adb devices | awk '$2 == "device" && $1 ~ /^emulator-/ {print $1; exit}')"
if [[ -z "$android_serial" ]]; then
  echo 'No booted Android emulator is available to Appium.' >&2
  exit 1
fi

echo "Running Appium on $android_serial"
timeout 120 bash -c "until adb -s \"$android_serial\" shell pm path android >/dev/null 2>&1; do sleep 2; done"
adb -s "$android_serial" shell wm dismiss-keyguard || true
adb -s "$android_serial" shell input keyevent 224 || true
# Use a representative phone viewport for the catalogue and long evidence reports.
adb -s "$android_serial" shell wm size 1080x1920
adb -s "$android_serial" shell wm density 320
export ANDROID_SERIAL="$android_serial"
export PHARMALERT_TEST_OFFLINE=1
export PHARMALERT_APK="$GITHUB_WORKSPACE/apps/app-frontend/android/app/build/outputs/apk/release/app-release.apk"
npm run test:mobile
