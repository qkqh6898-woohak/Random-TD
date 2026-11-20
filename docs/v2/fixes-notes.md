# V2 고침 1차 — 검토(docs/v2/review.md) 결과 고친 것 · 결정 · 남긴 것

갈래 `v2/fixes` (= main 68052a7 + research.md). 다른 갈래 `v2/pr-a`가 동시에 고치는 파일(progress·progressStore·data JSON·load·rules·Sell·Summon·Game.ts·lobbyModel·Lobby·towerGeom·stackGeom·CLAUDE.md·기존 문서)은 건드리지 않았다. 그 파일이 필요한 부분은 맨 아래 **나중에 할 일**에 정확한 변경으로 적었다.

## 고친 것 (찾은 것마다: 먼저 실패하는 테스트 → 고침)

| ID | 무엇을 | 어떻게 | 테스트 |
|----|--------|--------|--------|
| H1 | '승급의 축복' [바꾸기]가 무더기 안 타워 하나만 바꿔 한 칸에 다른 타워가 섞임 | `pickMerge` pick 1: 결과 타워가 **혼자인 칸이면 예전처럼 제자리**에서 바꿈. **무더기(2개 이상) 안이면** 바꾼 타워를 ① alt의 덜 찬 내 무더기(`joinableStack`) → ② 빈 배치 칸(`freePad` = 자동 소환 칸)으로 옮김(`mergePicked.moved = true`). **둘 다 없으면 바꾸지 않고** `mergePickFail { reason: 'full' }` — 선택은 사라지고(창이 닫힘) 축복 1회를 돌려줌(`perks.mergeChoices + 1`). 뒷받침: `isUniformStack`(entities/Tower.ts) — `stackMergeCheck`(섞였으면 'stack')·`fullStacks`·`joinableStack`은 칸의 타워가 모두 같은 타워(같은 주인)일 때만 무더기로 본다 | `tests/unit/v2-h1-merge-pick.test.ts` (10개, 고치기 전 7개 실패) |
| L2 | 예전 명령(summon·merge·mergeAll·move)이 일반 판에서도 실행되어 무더기 규칙을 우회 | `World.setCommandFilter` — 거절한 명령은 **예약 단계에서** 받지 않아 실행 기록·리플레이에도 남지 않는다. `MatchOptions.legacyCommands`(playReplay·recordReplay만 켬). **개발자 판(debug)은 그대로 받음**(치트 판 · E2E가 판을 빨리 만드는 데 씀). 일반 판·이어 한 판은 거절 | `tests/unit/v2-l2-legacy-commands.test.ts` (5개: 일반 판 거절·debug 허용·이어 한 판 거절·예전 명령이 든 비개발자 리플레이 재생 해시 같음) |
| M1 | 저장소 쓰기 한 번 실패 뒤 `getItem`이 디스크의 옛 값을 돌려줘 자동 저장이 판 내내 죽고, 패배 뒤 지우기도 못 해 끝난 판이 되살아남 | `BrowserStorage.memoryOnly`: 기기 저장소에 못 쓴(또는 못 지운) 키는 다음 쓰기·지우기가 성공할 때까지 메모리 사본이 정답 | `tests/unit/v2-m1-storage.test.ts` (5개, 고치기 전 4개 실패) |
| M2a | 앱 업데이트로 버린 진행 중 판이 정산되지 않음 | `MatchSaves`가 **업데이트(형식·SIM_VERSION·데이터) 불일치나 되살리기 실패로 버리기 직전** 저장 JSON에서 `AbandonedRun`(runId·seed·mode·theme·stage·bossesKilled·summons·merges·challengeBest·tick·dev)을 꺼내 `onAbandoned` 훅 → `main.ts`가 `settleAbandonedRun`(src/save/settleAbandoned.ts)으로 **기존 공개 API `ProgressStore.settle`**(패배 화면과 같은 `MatchResult` — `matchResultOf`와 같은 값) + `BattleRecords.completeAbandoned`(일반 1인 무한만). 중복: progress `rewardedRuns`(runId) + 기록 `recent` id + 이번 실행 Set. 훅이 실패해도 저장은 버린다. 망가진 저장·개발자 표시 불일치는 정산하지 않음. 타이틀 알림: 보상을 줬으면 '게임 규칙이 바뀌어 진행 중이던 판(n단계)은 여기서 끝났어요. 그 판의 보상은 받았어요.' | `tests/integration/v2-m2-sim-version.test.ts` (10개) |
| M2b | 앱 버전이 다르면 무조건 저장을 버림 → CSS만 바꾼 릴리스도 모든 진행 중 판을 지움 | `src/sim/version.ts` `SIM_VERSION`(지금 1). 저장 지문 = `MATCH_SAVE_FORMAT` + `SIM_VERSION` + `dataFingerprint`. 앱 버전은 `app` 칸에 적어만 둔다. `sim` 칸이 없는 예전 저장은 '규칙 버전이 다름' → 정산 뒤 버림(이번 한 번) | 같은 파일: 같은 SIM_VERSION + 다른 앱 버전 → 그대로 이어 함 / 다른 SIM_VERSION → 정산 뒤 버림 |
| M3 | 업데이트 창 '저장한 판과 기록은 그대로예요'가 거짓 | `UPDATE_SAVE_NOTE`(ui/messages): '계정·기록은 그대로예요. 진행 중인 판은 이어 할 수 있고, 게임 규칙이 바뀐 업데이트면 그때까지의 보상을 받고 끝나요.' (내려받기 전·설치 확인 두 곳). E2E `update` 문구 맞춤 | `tests/unit/update.test.ts` 'V2 M3' |
| L3 | 전투 기록 통째 파싱 — 칸 하나만 이상해도 빈 기록 → 다음 패배 때 덮어씀 | `parseRecordInfo`: 이상한 칸·항목만 버림(최고 단계·최고 도전 → 0, 보스 처치는 1 이상·최고 단계 이하만, 최근 판은 맞는 것만). 모르는 더 높은 `version`(`future`)은 읽기만 하고 `complete`·`completeAbandoned`가 쓰지 않음 | `tests/integration/v2-l3-battle-records.test.ts` (4개), `battle-records.test.ts` 기대값 2줄을 새 규칙으로 |
| L5 | 캠페인(개발자 버튼)이 50단계 뒤 끝나지 않음 | `MatchPhase 'victory'`: 마지막 단계가 끝나는 시각까지 버티면(보스 제한 시간 검사를 먼저 통과) `'victory' { stage, theme }` 사건, 그 뒤 sim 멈춤. `Match.victory`·`Match.ended`(defeated는 패배만). 개발자 단계 건너뛰기: 50단계에서 누르면 클리어(단 50단계가 시작된 그 틱의 연타는 무시) | `tests/unit/v2-l5-campaign-end.test.ts` (5개), `Stage.test.ts` 두 개를 새 규칙으로 |
| L6 | 받는 중·설치 중 WebView가 다시 읽히면 웹이 'checking'에 멈추고 진행 사건을 모두 버림 | `Updater.check()`: 제안·권한 대기·받는 중·설치 중이면 제안(available)부터 지금 단계(progress → verifying / installing(step confirm) / permission)까지 다시 보냄. 받은 바이트·확인 중·확인 창 여부를 UI 스레드에서 들고 있음. 사건 목록은 순수 `UpdateLogic.resyncEvents` | JVM `UpdateLogicTest` (resync 8개, `bash android/check-java.sh`), `update.test.ts` 'V2 L6'(같은 JSON으로 웹 상태 기계가 되살아남) |
| L9 | ci.yml이 자바 검사를 안 돌리고 액션이 태그(@v4)만 가리킴 | setup-java(temurin 21) + `bash android/check-java.sh`. checkout·setup-node·setup-java를 android.yml과 같은 SHA로 고정. setup-python은 빼고 러너 python3(android.yml과 같음 — 알맞은 SHA를 이 세션에서 확인할 수 없었음) | `tests/unit/v2-l9-ci.test.ts` (두 워크플로 액션 모두 40자리 SHA) |
| L1 (일부) | 일일·업적 id가 겹치면 같은 id 업적을 영영 못 받고 [모두 받기]가 끝나지 않음 | 확인해 보니 `progressionData.crossCheckProgression`에 두 목록을 합친 겹침 검사가 **이미 있었다**(검토의 '목록별만'은 사실과 다름). 알림 경로를 실제 목록·순번으로 고치고 회귀 테스트 추가. 무한 루프 끊기는 progress.ts라 나중 | `g3-progress.test.ts` 'V2 L1' |

### 리플레이 해시

**바뀐 것 없음** — 저장된 리플레이 8개(r1~r7) 모두 그대로 통과, `npm run replays` 다시 만들지 않았다.
- H1은 '축복 [바꾸기]를 무더기 안 타워에 쓴' 판만 결과가 달라지는데 저장된 리플레이에는 pickMerge가 없다. 섞인 무더기 검사도 섞인 칸이 없는 판에서는 결과가 같다.
- L2는 예약 단계 필터라 리플레이 재생(legacyCommands)·개발자 판(debug — 예전 명령을 쓰는 r2·r3-invisible·r5·r6은 모두 debug)에서는 그대로다. 비개발자 리플레이(r1·r3-campaign)는 예전 명령을 쓰지 않는다.
- L5는 50단계까지 가는 리플레이가 없다.

## SIM_VERSION — 언제 올리나 (CLAUDE.md 6장에 옮겨 적을 것, 그 파일은 다른 갈래 소유)

`src/sim/version.ts`의 `SIM_VERSION`을 **+1** 하는 때 (하나라도 해당하면):
1. `src/sim/` 코드가 **같은 상태·같은 명령에서 다른 결과**를 내게 바뀜 — 리플레이 해시가 바뀌어 `npm run replays`로 다시 만든 커밋은 언제나 해당.
2. 판 상태(`MatchState`)·엔티티 모양이 바뀜 (필드 추가·삭제·뜻 변경. 처음엔 없는 선택 필드는 `OPTIONAL_STATE_KEYS`로 둘 수 있지만, 옛 저장에서 그 필드가 없을 때 같은 결과가 나와야 한다).
3. 명령 모양·처리 순서가 바뀜.

올리지 않는 때: 화면(`src/view`·`src/ui`)·판 밖 메타(`src/meta`)·소리·그림·문서만 바뀜, 또는 **JSON 수치만** 바뀜(데이터 지문 `dataFingerprint`가 알아서 달라져 저장이 정산 뒤 버려진다).

헷갈리면 올린다: 올리면 진행 중 판은 **정산(보상 지급) 뒤** 버려지고(손해는 '이어 하기'뿐), 안 올렸는데 규칙이 바뀌면 이어 한 판이 다른 규칙으로 돈다(되살리기 자체가 실패하면 그것도 정산 뒤 버린다 — 그물).

- 이번 갈래의 H1·L2·L5도 sim 규칙 변경이지만 `SIM_VERSION`을 처음 만드는 갈래라 1로 시작한다(예전 저장에는 `sim` 칸이 없어 어차피 한 번 정산 뒤 버려진다).
- `v2/pr-a`(판매가 분리·소환 비용 등 sim/data 변경)를 합칠 때: 데이터 JSON이 바뀌면 지문으로 충분, `rules.ts`·`Sell.ts`·`Summon.ts` 규칙이 바뀌면 **SIM_VERSION을 2로**.

## 나중에 할 일 (다른 갈래 소유 파일 — 정확한 변경)

| ID | 파일 | 변경 |
|----|------|------|
| M4 | `src/meta/progressStore.ts` 생성자 · `src/meta/progress.ts parseProgress` | ① 생성자: `raw !== null`인데 `parseProgress`가 새 계정을 돌려준 경우(JSON 오류·`v` 없음/정수 아님) 또는 `v > PROGRESS_VERSION`이면 저장 전에 `storage.setItem(\`${this.key}.bak.${Date.now()}\`, raw)`로 원문을 남기고, `v > PROGRESS_VERSION`이면 **쓰지 않는다**(읽기 전용). ② 생성자의 `this.save()`는 파싱 결과를 다시 직렬화한 값이 `raw`와 다를 때만. ③ `parseProgress`: 결과를 `{ ...original, ...parsed }`로 — 모르는 최상위 필드(예: 불꽃 화폐)를 지우지 않게, `heroes`도 `{ ...src(모르는 id 그대로), ...parsed }` |
| L1 | `src/meta/progress.ts claimAllQuests` (673행 while) | 한 바퀴에 받은 것이 없으면 멈춤: `while (claimableQuests(...) > 0) { const before = got.length; …세 줄…; if (got.length === before) break; }` (+ 테스트: 같은 id 일일·업적을 강제로 넣은 상태에서 끝나는지) |
| L4 | `src/view/scenes/Game.ts` 1842행 `case 'summon'` | 자동 판매 대상에서 소환 도박 결과를 뺀다: `if (ev.player === LOCAL_PLAYER && ev.debug !== true && ev.gacha === undefined) summonedIds.push(Number(ev.id));` (의도라면 대신 설정 설명에 '도박 결과도 판매'를 적는다 — 사용자 확인 필요) |
| L7 | `src/ui/lobby/lobbyModel.ts` 93행 `ready` · `heroesReady` · 도감 `canUnlock` | 배지 하나의 규칙: `ready: need !== null && e.cards >= need && checkLevelUp(...) === 'ok'`(카드 + 골드) — 또는 `heroActionable(state, pd, t)` 하나를 만들어 영웅 ▲·[영웅] 탭 점·[⬆ 모두 레벨업 N]이 같이 쓴다. 잠긴 신화 해방 가능(조각 ≥ unlockFragments)은 [도감] 배지에서만 센다(`heroesReady`에서 `locked` 제외) |
| L8 | `src/view/scenes/Game.ts create()` | `this.slots` 초기화 옆에 `this.ultSent = new Map();` 한 줄 |
| H1 화면 | `src/view/scenes/Game.ts` 사건 switch | `case 'mergePickFail': if (ev.player === LOCAL_PLAYER && ev.reason === 'full') this.ctx.ui.toast('바꾼 타워를 놓을 칸이 없어 그대로 두었어요 (축복 1회는 돌려받음)');` — 문구는 `ui/messages.ts`에 상수로. 지금은 알림 없이 창만 닫힌다 |
| L5 화면 | `src/view/scenes/Game.ts` (875·894·2343행 `match.defeated`) · `src/ui/lobby/Lobby.ts` 291~300행 | `match.defeated` 대신 `match.ended`로 멈추고, `match.victory`면 결과 화면 제목을 '테마 n 클리어!'로(정산은 그대로 `matchResultOf`). 지금은 50단계 클리어 뒤 sim이 멈추기만 하고 결과 화면이 없다(개발자 버튼만 닿음). 아니면 캠페인 버튼을 M6까지 숨김 |
| M2 문서 | `CLAUDE.md` 6장 마지막 줄 | '저장 형식·앱 버전·데이터가 바뀌면 진행 중이던 판은 이어 할 수 없다' → '저장 형식·**SIM_VERSION**(src/sim/version.ts)·데이터가 바뀌면 진행 중이던 판은 **정산(보상 지급) 뒤** 이어 할 수 없다. 앱 버전만 바뀐 릴리스는 이어 한다' + 위 'SIM_VERSION — 언제 올리나' 세 줄 |
| H2 | `rules.ts` · `Sell.ts` · `Summon.ts` | `v2/pr-a`의 판매가 분리 작업 몫 (이 갈래에서 건드리지 않음): `sellPrice(normal) < 도달할 수 있는 가장 싼 summonCost` 불변식 테스트 |

## 완료 조건 (이 갈래)

- `npm test`: 108파일 1,575 통과 · 3 건너뜀 · `npm run check`(타입·결정성 79파일·곡선·데이터) · `npm run build` 통과 · `bash android/check-java.sh` 통과(UpdateLogicTest에 resync 8개).
- **관련 E2E** (`E2E_PORT=5181`, 기기 부하 load average 7~8 / 4코어 — 다른 세션 E2E와 같이 돎): `related-e2e.sh 68052a7` 결과(a1·devtools·g1·g3·m2·smoke·update) + smoke·update·g1·m4·m5·t2·f10·b1·devtools·g3·gi + 예전 명령을 쓰는 스펙(m3a·g2·g2-shots) = 127개.
  - 첫 실행: 실패 12개(b1 360×800 a · devtools 2 · m4 3 · m5 4 · m2 1 · m3a 1), 나머지 통과.
  - 실패한 것만 다시: b1·devtools ×16 배속·m4 일꾼·m4 편대·m5 도박·m5 미션 통과, devtools ⏭ 꾹·m4 보스 카드는 세 번째에 통과.
  - **끝까지 실패 4개 = 기준 커밋 68052a7(고치기 전)에서도 똑같이 실패**(임시 worktree로 같은 4개를 돌려 확인): `m2:257` 자동 공격 '+10원' 글자, `m3a:236` '승급 가능' 알림, `m5:159` 바텀 시트 알림 위치(알림이 이미 사라져 null), `m5:236` 도전 배너 — 모두 잠깐 떴다 사라지는 알림·배너를 느린 브라우저가 놓치는 것(내 변경과 무관).
  - E2E가 다시 찍은 스크린샷(G3-gameover-rewards·G3-hero-detail·G3-lobby·U1-update-dialog·U1-update-progress)은 되돌림. `U1-update-dialog.png`는 M3 문구가 바뀌어 다음에 찍으면 새 문구로 나온다.
- 전체 E2E는 `v2/pr-a`와 합친 뒤.

## 그 밖에 알아 둘 것

- 되살리기 실패(SIM_VERSION을 안 올렸는데 상태 모양이 바뀐 경우 등)로 버린 판도 정산하지만, 타이틀 알림은 지금 `discardedByUpdate`(형식·규칙·데이터 불일치)일 때만 뜬다 — 되살리기 실패로 정산된 판은 말없이 보상만 들어간다. 알리려면 `Boot.ts` 조건을 `!saved && (discardedByUpdate || lastAbandoned?.credited)`로.
- L2 거절은 예약 단계라 `enqueue`가 `{ ok: false, reason: '예전 명령은 리플레이에서만 받는다: …' }`를 돌려준다. 화면은 예전 명령을 보내지 않는다(Game.sendMerge도 mergeStack). 네트워크(M13)가 생기면 상대 명령도 같은 필터를 지난다.
- `MatchPhase`에 'victory'가 늘었다 — 판 상태를 phase로 나누는 새 코드는 'defeat'만 끝으로 보지 말고 `Match.ended`를 쓴다.
