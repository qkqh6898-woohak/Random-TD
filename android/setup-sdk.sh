#!/usr/bin/env bash
set -euo pipefail

sdk=${1:?Pass an Android SDK installation directory}
archives=$(mktemp -d)
trap 'rm -rf -- "$archives"' EXIT
mkdir -p "$sdk/build-tools" "$sdk/platforms"

download() {
  local url=$1 path=$2 sha=$3
  curl --fail --silent --show-error --location --retry 3 "$url" -o "$path"
  printf '%s  %s\n' "$sha" "$path" | sha256sum --check --status
}

download https://dl.google.com/android/repository/build-tools_r35_linux.zip \
  "$archives/build-tools.zip" bd3a4966912eb8b30ed0d00b0cda6b6543b949d5ffe00bea54c04c81e1561d88
download https://dl.google.com/android/repository/platform-35_r02.zip \
  "$archives/platform.zip" 0988cacad01b38a18a47bac14a0695f246bc76c1b06c0eeb8eb0dc825ab0c8e0
download https://repo.maven.apache.org/maven2/org/eclipse/jdt/ecj/3.40.0/ecj-3.40.0.jar \
  "$archives/ecj.jar" 05cc22a24e7982970f63a405fc6c820bc80b806f27f3c5a6236fc475f8f7152b

unzip -oq "$archives/build-tools.zip" -d "$sdk/build-tools"
unzip -oq "$archives/platform.zip" -d "$sdk/platforms"
mv "$archives/ecj.jar" "$sdk/ecj.jar"
