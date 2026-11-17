#!/usr/bin/env bash
# 피드백 에이전트용: 이번 작업에서 바뀐 파일과 관련된 E2E 스펙 목록을 뽑는다 (FB-2).
#   bash .github/feedback-agent/related-e2e.sh [기준, 기본 origin/main]
# 고르는 방법 (한 줄에 스펙 하나, 중복 없음):
#   1) e2e/smoke.spec.ts 는 항상
#   2) 이번에 바뀐 e2e/*.spec.ts
#   3) 바뀐 src 줄(추가·삭제)에 나오는 data-testid 값을 쓰는 스펙 (템플릿 testid는 앞부분으로)
#   4) 폴더 → 스펙 짝 (아래 MAP) — testid 없이 동작만 바뀐 경우를 위해
# 에이전트는 이 목록을 전부 돌리고, 자기가 보기에 더 관련 있는 스펙이 있으면 더 돌린다.
set -euo pipefail
base="${1:-origin/main}"
cd "$(git rev-parse --show-toplevel)"

changed="$({ git diff --name-only "$base"...HEAD; git diff --name-only; git diff --name-only --cached; } 2>/dev/null | sort -u)"
out=()
add() { [[ -f "$1" ]] && out+=("$1"); return 0; }

add e2e/smoke.spec.ts
while IFS= read -r f; do
  [[ "$f" == e2e/*.spec.ts ]] && add "$f"
done <<<"$changed"

# 3) 바뀐 줄의 testid
ids="$({ git diff -U0 "$base"...HEAD -- src; git diff -U0 -- src; git diff -U0 --cached -- src; } 2>/dev/null \
  | grep -E '^[+-][^+-]' \
  | grep -oE "testid['\"]?\]?[[:space:]]*[:=,][[:space:]]*['\"\`][a-z0-9-]+" \
  | grep -oE "[a-z0-9-]+$" | sort -u || true)"
for id in $ids; do
  [[ ${#id} -lt 4 ]] && continue
  while IFS= read -r s; do add "$s"; done < <(grep -lF -- "$id" e2e/*.spec.ts 2>/dev/null || true)
done

# 4) 폴더 → 스펙 짝 (앞부분 일치)
MAP=(
  "src/ui/lobby/|e2e/g3.spec.ts"
  "src/meta/progress|e2e/g3.spec.ts"
  "src/ui/hud/|e2e/hud-layout.spec.ts"
  "src/ui/sheets/|e2e/m5.spec.ts"
  "src/ui/panels/|e2e/m3a.spec.ts"
  "src/view/input/|e2e/m3a.spec.ts"
  "src/view/render/|e2e/a1.spec.ts"
  "src/art/|e2e/characters.spec.ts"
  "src/ui/gallery/|e2e/characters.spec.ts"
  "src/ui/theme|e2e/g2.spec.ts"
  "src/ui/guide/|e2e/f10.spec.ts"
  "src/feedback/|e2e/feedback.spec.ts"
  "src/update/|e2e/update.spec.ts"
  "src/devMode|e2e/devtools.spec.ts"
  "src/view/viewport|e2e/t3-screen.spec.ts"
  "src/sim/systems/Stage|e2e/devtools.spec.ts"
  "src/sim/|e2e/g1.spec.ts"
  "src/data/game.json|e2e/m5.spec.ts"
)
while IFS= read -r f; do
  for pair in "${MAP[@]}"; do
    [[ "$f" == "${pair%%|*}"* ]] && add "${pair##*|}"
  done
done <<<"$changed"

printf '%s\n' "${out[@]}" | sort -u
