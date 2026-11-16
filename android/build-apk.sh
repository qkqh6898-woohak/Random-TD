#!/usr/bin/env bash
set -euo pipefail

android=$(cd -- "$(dirname -- "$0")" && pwd)
project=$(cd -- "$android/.." && pwd)
sdk=$(cd -- "${1:?Pass an Android SDK directory created by setup-sdk.sh}" && pwd)
output=${2:?Pass the APK output path}
tools="$sdk/build-tools/android-15"
platform="$sdk/platforms/android-35/android.jar"
build=$(mktemp -d)
trap 'rm -rf -- "$build"' EXIT

test -f "$project/dist/index.html"
mkdir -p -- "$build/classes" "$build/dex" "$(dirname -- "$output")"
java -jar "$sdk/ecj.jar" -encoding UTF-8 -source 8 -target 8 \
  -bootclasspath "$platform" -proc:none -d "$build/classes" \
  "$android/src/com/woohak/randomtd/GameActivity.java"
(cd "$build/classes" && zip -q -r "$build/classes.jar" .)
"$tools/d8" --min-api 29 --lib "$platform" --release --output "$build/dex" "$build/classes.jar"
"$tools/aapt2" compile --dir "$android/res" -o "$build/resources.zip"
"$tools/aapt2" link -o "$build/unsigned.apk" -I "$platform" \
  --manifest "$android/AndroidManifest.xml" -A "$project/dist" "$build/resources.zip"
(cd "$build/dex" && zip -q "$build/unsigned.apk" classes.dex)
"$tools/zipalign" -f 4 "$build/unsigned.apk" "$output"
"$tools/zipalign" -c 4 "$output"
