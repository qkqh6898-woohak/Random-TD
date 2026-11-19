# V2.0 PR-A 다시 확인 메모 (보고만 — 코드 변경 없음)

> 갈래 `v2/pr-a` (기준 main 68052a7 + research.md). 2026-11-19.

## (a) 업데이트 이어짐 (기존 설치 앱 → 이 PR이 들어간 다음 APK)

| 확인 | 결과 |
|------|------|
| `.github/workflows/android.yml`·`ci.yml`·`tools/release-version.mjs`·`android/`(UpdateLogic·Updater·Manifest)·`src/update/`·`package.json` version | **이 PR에서 한 줄도 안 바뀜** (`git diff 68052a7..HEAD -- .github android tools/release-version.mjs package.json src/update` 비어 있음) |
| 태그·자산 이름 | android.yml이 그대로 `android-v<버전>` 태그 + `Random-TD_Offline_v<버전>.apk` + `SHA256SUMS`를 만든다. 설치된 앱의 `UpdateLogic`(TAG_PREFIX `android-v`, APK_PREFIX `Random-TD_Offline_v`, 공개 `Random-TD` releases/latest)이 그 이름을 그대로 찾는다 |
| versionCode 단조 증가 | package.json 0.1.9 < 가장 높은 태그(0.1.19) → CI가 0.1.20(versionCode 1,020)을 고른다 = 이전 1,019보다 큼. V2.0 버전 올리기(2.0.0 → 2,000,000)는 다음 단계 |
| 진행 중 판 무효화 | game.json·towers.json·cards.json·enemies.json이 바뀌어 데이터 지문(`dataFingerprint`)이 달라지고 앱 버전도 달라진다 → `MatchSaves.check()`가 `updateMismatch`로 슬롯을 지우고 로비 알림 '업데이트로 진행 중이던 판은 이어 할 수 없어요'. **의도한 동작** (판 상태 모양도 `summonCount`·`summonDiscountBp`로 바뀌어 예전 체크포인트는 어차피 되살릴 수 없다 — 버려지는 쪽이 맞다). 계정·설정·기록은 그대로 |
| 계정 저장 | `rtd.progress` v1 → v2: 읽을 때 🔥 불꽃 300을 한 번 더하고 다른 필드는 그대로. 모르는 필드·데이터에 없는 타워 기록은 들고 다니고, 읽을 수 없는 값은 덮기 전에 `rtd.progress.bak.<시각>` 백업 (검토 M4). 키 이름·다른 저장 키(`rtd.account`·`rtd.settings`·`rtd.records`·`rtd.match`) 그대로 |
| 앱 안 업데이트 화면 | `UpdateService`·`UpdateDialog`·testid `update-*` 그대로, 로비 위 띠에 🔥 칩이 더해졌을 뿐 업데이트 창 위치·흐름 변화 없음 |
| 남은 위험 | 사용자가 예전 APK로 되돌리면(서명 같고 versionCode가 낮아 보통 설치 안 됨) 예전 parseProgress가 `flame`을 지우고 v1로 쓴다 → 다시 올리면 300을 또 받는다. 실제로는 다운그레이드가 막혀 있어 무시 |

## (b) E2E가 Game 장면 안쪽에 기대는 곳 (`window.__rtd`)

- `window.__rtd` 사용 **212번 · 42개 스펙** (`__rtd.game.scene.getScene('Game')` 101번). 업데이트 쪽은 `window.__rtdUpdate` + 가짜 `RandomTDNative` (update·feedback 스펙 2개, 8번).
- 장면 멤버별 (호출 수 · 스펙 수 대략):

| 위험 | 멤버 | 쓰는 곳 | V2.0 Game.ts/HUD 대개편 때 |
|------|------|---------|-----------------------------|
| **매우 높음** | `s.match.state/world/towers/map/rules/tick/mobs/ctx` | 약 570번 · 24+ 스펙 (돈·타워·단계·명령 enqueue를 직접) | `match` 필드 이름·위치를 바꾸면 거의 모든 전투 스펙이 깨진다. 장면을 쪼개도 `__rtd`에 `match`를 그대로 내보내는 얇은 창구를 두는 게 싸다 |
| **매우 높음** | `s.debugFastForward(n)` | 94번 · 34 스펙 | 시간 빨리 감기 — 이름·의미(틱 수) 유지 필요 |
| **높음** | `s.mapLayout` (`originX/originY/tile/mapTop/hudBottom`) | 35번 · 17 스펙 (칸 좌표 → 화면 탭 좌표) | HUD 높이·맵 위치가 바뀌면 값은 따라가지만, 필드 이름·좌표계(1080 기준 캔버스)를 바꾸면 탭 도우미 전부 깨짐 |
| 높음 | UI 상태 `panelOpen/sheetOpen/dragState/buildHint/selectedTowerId/choiceCollapsed/saveState` | 약 70번 · 13 스펙 | 패널·시트를 다시 만들면 같은 의미의 읽기 전용 값을 남겨야 함 |
| 중간 | `s.towerLayer.artScaleOf/presentationOf/characterKeys/count` | 9 스펙 (b1·art·characters·fb66 등 크기 검사) | 렌더 층 이름 변경에 약함. 크기 규칙은 `towerGeom` 순수 함수 단위 테스트로 옮기는 편이 안전 |
| 중간 | 연출 카운터 `summonFxStats/abilityFxCount/floatingLabels/flyingCoins/statusIconCount/renderedMobCount/tintedMobCount/renderedTowers` | 11 스펙 | 연출 구조를 바꾸면 카운터도 옮겨야 함 |
| 중간 | Phaser 내부 `s.scene.pause/resume`, `s.tweens.*`, `s.children.list`, `s.textures.*`, `s.time.now`, `s.scale.height`, `s.events.on`, `s.update(...)` | 15 스펙 | Phaser 3.90 고정이라 API는 안전하지만 장면 이름 'Game'·장면 하나 구조에 묶임 |
| 낮음 (지켜야 함) | DOM testid (`hud-*`, `menu-*`, `tp-*`, `sheet-*`, `data-action`, `data-screen`) · `e2e/title.ts clickStart` | 거의 모든 스펙 | research.md 9장 '핵심 선택자'. 이 PR은 testid를 바꾸지 않았다 (`menu-mythic` 그대로, 새 `lobby-flame`·`go-flame`만 추가) |

- 제안 (V2.0 다음 단계용): Game.ts를 쪼개기 전에 `src/view/testApi.ts` 같은 **E2E 전용 읽기 창구**(`match`, `mapLayout`, `debugFastForward`, UI 상태 몇 개)를 만들어 `__rtd.game.scene.getScene('Game')` 대신 쓰게 바꾸면, 장면 내부를 옮겨도 스펙은 창구만 따라가면 된다.

## (c) 이 PR이 E2E 기대값을 바꾼 곳 (의도한 동작 변경)

- 리미티드 이름: g1·gi·g3·f10·fb21·fb24·fb61·v14-shots의 '신화' 글자 → '리미티드' (testid 그대로), f10 '레전드·신·리미티드 강화'.
- 소환 비용·경제: m2(22원·978원·'42원이 필요해요'·처치 +3원·10번 소환 = 310원으로 돈을 맞춤), t2(판매 +15원·+405원, 소환 버튼 글자), g1(소환 22원·행운 소환 600원), f10(강화 뒤 남는 돈 228원), fb29(종족 소환 400원), devtools(첫 소환 뒤 978원).
- 유닛 크기: b1(큰 캐릭터 배율 0.7~0.9, 머리 탭 높이를 실제 배율로, 초상 카드 테스트의 노말 배율 0.6~0.75).
- 🔥 불꽃: g3(레벨업 비용 불꽃·`lobby-flame`), fb31(모두 레벨업 불꽃 65), v14-shots(로비 영웅 준비 값).
