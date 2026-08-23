#!/usr/bin/env bash
set -e

# Build a test Android APK from the WirralJobe web app.
# This script prepares the web assets and opens Android Studio.
# You still need Android Studio to click "Build APK".

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

echo "1. Checking environment..."
if [ ! -f .env ]; then
  echo ""
  echo "ERROR: .env file not found."
  echo "Please create one from .env.example and set VITE_API_URL to your live Apps Script URL."
  echo ""
  echo "Example:"
  echo "  cp .env.example .env"
  echo "  # then edit .env and replace YOUR_APPS_SCRIPT_DEPLOYMENT_ID"
  exit 1
fi

if ! grep -q "VITE_API_URL=https://script.google.com/macros/s/.*/exec" .env; then
  echo ""
  echo "WARNING: VITE_API_URL in .env does not look like a valid Apps Script URL."
  echo "Check .env before continuing."
fi

echo ""
echo "2. Building the web app..."
npm run build

echo ""
echo "3. Copying web assets into the Android project..."
npx cap sync android

echo ""
echo "4. Opening Android Studio..."
npx cap open android

echo ""
echo "5. Next steps in Android Studio:"
echo "   - Wait for Gradle sync to finish."
echo "   - Choose Build → Build Bundle(s) / APK(s) → Build APK(s)."
echo "   - The debug APK will appear at:"
echo "     android/app/build/outputs/apk/debug/app-debug.apk"
echo ""
echo "To install on a phone, connect it with USB debugging enabled and run:"
echo "   adb install android/app/build/outputs/apk/debug/app-debug.apk"
