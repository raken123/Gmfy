#!/usr/bin/env bash
# Build the Gmfy Android APK with Cordova.
# Requirements: Node 18+, Java 17+, Android SDK (ANDROID_HOME set).
set -euo pipefail
cd "$(dirname "$0")"

# assemble the web app into www/
rm -rf www
mkdir -p www
cp -r ../index.html ../css ../js ../vendor www/

npm install
npx cordova platform add android@14 2>/dev/null || true
npx cordova build android --debug

echo
echo "APK ready:"
echo "  $(pwd)/platforms/android/app/build/outputs/apk/debug/app-debug.apk"
