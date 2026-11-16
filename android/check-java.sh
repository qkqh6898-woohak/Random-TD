#!/usr/bin/env bash
# 안드로이드 SDK 없이 돌릴 수 있는 Java 검사: AssetPaths(순수 함수)를 JVM으로 컴파일·실행한다.
set -euo pipefail

android=$(cd -- "$(dirname -- "$0")" && pwd)
out=$(mktemp -d)
trap 'rm -rf -- "$out"' EXIT
javac -encoding UTF-8 -d "$out" \
  "$android/src/com/woohak/randomtd/AssetPaths.java" \
  "$android/test/com/woohak/randomtd/AssetPathsTest.java"
java -cp "$out" com.woohak.randomtd.AssetPathsTest
