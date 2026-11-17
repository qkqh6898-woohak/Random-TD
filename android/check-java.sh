#!/usr/bin/env bash
# 안드로이드 SDK 없이 돌릴 수 있는 Java 검사: 순수 클래스(AssetPaths · UpdateLogic · FeedbackLinks)를 JVM으로 컴파일·실행한다.
# 안드로이드 빌드와 같은 언어 수준(-source 8 -target 8 — build-apk.sh의 ecj와 같음)으로 컴파일한다.
set -euo pipefail

android=$(cd -- "$(dirname -- "$0")" && pwd)
out=$(mktemp -d)
trap 'rm -rf -- "$out"' EXIT
javac -encoding UTF-8 --release 8 -Xlint:-options -d "$out" \
  "$android/src/com/woohak/randomtd/AssetPaths.java" \
  "$android/src/com/woohak/randomtd/UpdateLogic.java" \
  "$android/src/com/woohak/randomtd/FeedbackLinks.java" \
  "$android/test/com/woohak/randomtd/AssetPathsTest.java" \
  "$android/test/com/woohak/randomtd/UpdateLogicTest.java" \
  "$android/test/com/woohak/randomtd/FeedbackLinksTest.java"
run() { java -Dstdout.encoding=UTF-8 -Dstderr.encoding=UTF-8 -cp "$out" "$@"; }
run com.woohak.randomtd.AssetPathsTest
run com.woohak.randomtd.UpdateLogicTest
run com.woohak.randomtd.FeedbackLinksTest
