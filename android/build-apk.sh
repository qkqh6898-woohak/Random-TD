#!/usr/bin/env bash
# 서명 전 APK 만들기: dist/(npm run build 결과 — 그림 포함 약 20MB)를 APK assets/에 통째로 넣고 GameActivity를 붙인다.
# 사용: bash android/build-apk.sh <setup-sdk.sh로 만든 SDK 폴더> <출력 APK 경로>
# 서명은 하지 않는다 (GitHub Actions가 비밀값으로 apksigner 서명 — .github/workflows/android.yml).
set -euo pipefail

android=$(cd -- "$(dirname -- "$0")" && pwd)
project=$(cd -- "$android/.." && pwd)
sdk=$(cd -- "${1:?Pass an Android SDK directory created by setup-sdk.sh}" && pwd)
output=${2:?Pass the APK output path}
tools="$sdk/build-tools/android-15"
platform="$sdk/platforms/android-35/android.jar"
build=$(mktemp -d)
trap 'rm -rf -- "$build"' EXIT

# 웹 빌드가 있어야 한다
test -f "$project/dist/index.html" || { echo "dist/index.html이 없다 — 먼저 npm run build" >&2; exit 1; }

# 버전: AndroidManifest versionName = package.json version (tests/unit/a1.test.ts도 같은 것을 본다)
pkg_version=$(node -p 'require(process.argv[1]).version' "$project/package.json")
manifest_version=$(sed -n 's/.*android:versionName="\([^"]*\)".*/\1/p' "$android/AndroidManifest.xml")
if [[ "$pkg_version" != "$manifest_version" ]]; then
  echo "AndroidManifest versionName($manifest_version) ≠ package.json version($pkg_version)" >&2
  exit 1
fi

mkdir -p -- "$build/classes" "$build/dex" "$(dirname -- "$output")"
mapfile -t sources < <(find "$android/src" -name '*.java' | sort)
java -jar "$sdk/ecj.jar" -encoding UTF-8 -source 8 -target 8 \
  -bootclasspath "$platform" -proc:none -d "$build/classes" "${sources[@]}"
(cd "$build/classes" && zip -q -r "$build/classes.jar" .)
"$tools/d8" --min-api 29 --lib "$platform" --release --output "$build/dex" "$build/classes.jar"
"$tools/aapt2" compile --dir "$android/res" -o "$build/resources.zip"
# 그림(webp)은 이미 압축돼 있어 다시 압축하지 않는다 (-0 webp)
"$tools/aapt2" link -o "$build/unsigned.apk" -I "$platform" -0 webp \
  --manifest "$android/AndroidManifest.xml" -A "$project/dist" "$build/resources.zip"
(cd "$build/dex" && zip -q "$build/unsigned.apk" classes.dex)
"$tools/zipalign" -f 4 "$build/unsigned.apk" "$output"
"$tools/zipalign" -c 4 "$output"

# dist/의 모든 파일이 APK assets/에 같은 경로로 들어갔는지 (하위 폴더 그림까지)
(cd "$project/dist" && find . -type f | sed 's|^\./|assets/|' | sort) > "$build/want.txt"
unzip -Z1 "$output" | grep '^assets/' | grep -v '/$' | sort > "$build/have.txt"
if ! diff -u "$build/want.txt" "$build/have.txt"; then
  echo "APK assets/가 dist/와 다르다" >&2
  exit 1
fi
echo "APK: $output ($(wc -l < "$build/have.txt")개 파일, $(du -h "$output" | cut -f1))"
