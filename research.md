# Random TD V2.0 — 1단계 기존 프로젝트 분석 (research.md)

> 기준: `main` **68052a7** (= 배포된 `android-v0.1.19`), 갈래 `v2/research`. 작성 2026-11-19.
> 원칙: **코드가 정답**이다. 문서(CLAUDE.md, docs/*.md)와 코드가 다르면 코드 동작을 적고, 다른 점은 11장 '문서-코드 불일치' 표에 모았다.
> 확인 못 한 것은 **미확인**으로 적었다. 이 문서 말고는 아무것도 바꾸지 않았다(소스·데이터·문서 그대로).
> 확인 방법: 파일 읽기 + `npx vitest run`(101파일 **1,531 통과 · 3 건너뜀**, 20.9초) + `npx playwright test --list`(**50파일 234개**) + 작은 node 스크립트(JSON 값 읽기·크기 계산) + `git fetch`(피드백 갈래).

---

## 0. 한눈에 보기 (5a~5e 답)

| 질문 | 답 (근거) |
|------|-----------|
| **5a 등급 수·이름** | **정확히 7개**: `normal 노말 · rare 레어 · unique 유니크 · hero 히어로 · legend 레전드 · god 신 · hidden 신화` (`src/data/load.ts:50` `GRADES`, towers.json 65종 = 10·10·10·10·10·3·12). 승급 사슬은 앞 5개뿐(노말→레전드, `src/sim/Deck.ts:28`), 신은 0.01% 확률, 신화는 조합(recipe). **신과 신화의 위아래 순서가 코드마다 다르다**(아래 5a). |
| **5b 소환 비용** | **고정 100원** (`game.json summon.cost`), 카드 '소환 할인'(−20)·'단골 할인'(−10)이 판 전체에 영구로 깎고 **최소 50원** (`src/sim/systems/Summon.ts:59-66`). 소환 횟수·웨이브에 따라 **변하지 않는다**. 소환 도박은 종류별 고정 300/200/400/1000원. 천장(pity) 있음. |
| **5c 상대 진영·상대 프로필** | **없다.** `src/net/` 폴더 없음, 2인 판 화면·상대 보드·상대 HUD·아바타 없음. sim만 2인 준비(플레이어별 배열, `game.json maxPlayers 2`, `Tower.owner`)이고 화면은 `LOCAL_PLAYER = 0` 고정(`Game.ts:251`). 지금 위 HUD = 왼쪽 [×1 배속](+개발자 [⏭][💰+]) · 가운데 'WAVE n'+⏱ · 오른쪽 [⚡ n 필살기][⏸]. |
| **5d 알림(빨간 점) 판단** | **15곳 이상에 흩어져 있다**(로비 탭 배지 5종, 로비 옆 버튼 2종, 영웅 카드 ▲, 웨이브 길·도감 강조, 전투 메뉴 배지 4종, [⏫ 모두 승급 n], 천장 강조, 정보 패널 보유 n/3, 2/3 배지, 승급 가능 알림, 업데이트 창 등). **중복 집계**(신화 조각 해방 가능이 [영웅] 탭과 [도감] 탭 양쪽에 셈)와 **기준 불일치**(영웅 ▲는 카드만, [모두 레벨업 N]은 카드+골드)가 있다 → 7장 표. |
| **5e 불꽃 재화** | **없다.** 코드·데이터·문서 어디에도 '불꽃' 화폐 없음('불꽃'은 그림 설명·연출 글자, 🔥은 원소 '화염'과 카드 '투지' 아이콘뿐). 있는 재화: 판 안 💰돈(원) / 판 밖 💰골드·💎보석·🃏영웅 카드·🧩신화 조각·⭐경험치·🎺모집 게이지. |

---

## 1. 프로젝트 구조 요약

### 1.1 폴더와 책임

| 폴더 | 책임 | 비고 |
|------|------|------|
| `src/main.ts` | 진입점: 데이터 로드·검사(`loadGameData`, `allLooks`) → 저장소·스토어 생성 → `GameContext` → Phaser 시작. `?gallery=1`이면 DOM 갤러리만 | 143줄 |
| `src/sim/` | 결정적 게임 로직. `World`(20틱/초, 명령 큐, 난수 흐름), `match.ts`(판 만들기·시스템 등록), `rules.ts`(JSON → 정수 규칙), `Commands.ts`(명령 30종), `replay.ts`, `hash.ts`, `state.ts`, `entities/`(Tower·Mob·Projectile·Puddle·Soldier), `systems/`(31개), `abilities/`(특색 18종), `bosses/` | Phaser·DOM·window import 없음. `tools/check-determinism.mjs`가 검사 |
| `src/view/` | Phaser 장면: `scenes/Boot.ts`(타이틀 그림 + 로비 띄움), `scenes/Game.ts`(**3,240줄**, 판 진행·입력·연출·HUD 연결), `render/`(타워·몹·투사체·맵·연출·안내 그리기, 순수 기하 `towerGeom.ts`·`stackGeom.ts`), `input/`, `viewport.ts`(화면 꽉 채움) | |
| `src/ui/` | DOM 오버레이: `root.ts`(층 10개: screen·hud·cutin·guide·quick·panel·sheet·modal·card·toast), `hud/`(Hud·hudModel·speed), `lobby/`(Lobby·lobbyModel·css), `panels/`(정보 패널·캐릭터 카드·고르기 창·변환·칸 위 [⬆]), `sheets/`(도전·강화·미션·신화·소환 도박·개발자), `screens/`(일시정지·패배·업데이트·피드백·등급 설명·기록·예전 타이틀), `guide/`(첫 10단계 안내), `gallery/`, `theme.ts/css`(금테 테마) | 프레임워크 없음 (`h()` 도우미, `src/ui/dom.ts`) |
| `src/meta/` | 판 밖: `account.ts`(rtd.account — 히든 미션 기록·본 도움말·신화 도감 발견), `progress.ts`(순수 규칙: 계정 레벨·골드·보석·영웅·퀘스트·웨이브 길·모집·상점), `progressStore.ts`(저장소 + 구독), `progressionData.ts`(progression.json 검사), `settings.ts`(rtd.settings), `matchResult.ts` | CLAUDE.md가 말하는 shop/talents/towerGrowth/attendance/missions/achievements 파일은 **없다** |
| `src/save/` | `storage.ts`(KeyValueStorage + localStorage 감싸기), `MatchSaves.ts`(진행 중 판), `BattleRecords.ts`(전투 기록), `ScreenShake.ts` | `save/migrations/` 없음 |
| `src/update/` | `UpdateService.ts`(자바 다리와 대화), `updateModel.ts`(사건 파싱·상태 기계·글) | |
| `src/art/` | 그림: 절차 SD 캐릭터(`characters/`), WebP 연결(`characters/phaserArt.ts`, `external.ts`), 등급 받침대·테두리(`presentation.ts`, `palette.ts`), 몹·연출·UI 아이콘 | 그림 파일은 `public/assets/`(characters 159장 WebP, backgrounds, cutins, title, ui) |
| `src/audio/` | `EffectAudio.ts` WebAudio 효과음 합성 | 파일 없음 |
| `src/feedback/` | 게임 안 피드백 → 미리 채운 GitHub 이슈 URL | |
| `src/data/` | JSON 데이터 + `load.ts`(스키마 검사, 1,300줄+) · `schema.ts` · `deck.ts` | 1.5절 |
| `android/` | 자바 WebView 앱: `GameActivity`(+`RandomTDNative` 다리), `Updater`·`UpdateLogic`(앱 안 업데이트), `InstallReceiver`, `AssetPaths`, `FeedbackLinks`, `test/`(자바 단위 테스트), `build-apk.sh`·`setup-sdk.sh`·`check-java.sh`, `AndroidManifest.xml`(앱 ID `com.woohak.randomtd`, versionName 0.1.9/Code 10 — CI가 덮어씀) | Capacitor는 쓰지 않는다 |
| `tools/` | `check-determinism.mjs`, `precompute-curves.mjs`(curves.json), `gen_tables.py --check`(데이터 검사·문서 표), `release-version.mjs`, `build-single.mjs`(한 파일 빌드), `sim.mjs`(헤드리스 봇), 그림 변환 py | |
| `tests/` | Vitest 101파일: `unit/`(91), `integration/`(10: replay·match-saves·firstBoss·botCheck 등), `replays/`(리플레이 8개 + bot.ts), `bots/`, `helpers/`, `fixtures/` | |
| `e2e/` | Playwright 50스펙 234개 + 도우미 `title.ts` | 9장 |
| `src/net/` | **없음** (멀티 미구현) | |

### 1.2 시작 흐름

```
index.html (#stage > #game, #ui-root)
 └ main.ts boot()
    ├ loadGameData() + allLooks()           데이터 검사 실패 = 'boot' 오류 화면
    ├ defaultStorage() → AccountStore(rtd.account) · ProgressStore(rtd.progress[.dev]) · SettingsStore(rtd.settings)
    │   · EffectAudio(rtd.effectVolume) · MatchSaves(rtd.match[.dev]) · BattleRecords(rtd.records) · ScreenShake(rtd.screenShake)
    ├ UpdateService.fromWindow(window)      자바 다리 없으면 null (브라우저·PWA)
    └ createGame(#game, ctx)  → Phaser
        ├ Boot 장면 (src/view/scenes/Boot.ts)
        │   preload: WebP 매니페스트·타이틀 그림 → create: 타이틀 그림 + createLobbyScreen() → ui.show('screen', lobby)
        │   이어 할 판(saves.read()) → [▶ 이어 하기]   / 업데이트로 버려졌으면 알림 (Boot.ts:190)
        │   update?.setTitleVisible(true) → 이번 실행 첫 확인
        └ [빠른 시작]/[이어 하기]/[캠페인] → scene.start(SCENE_GAME, {seed, mode, theme} | {saved})
            Game 장면 create (Game.ts:491~): createMatch(data, {seed, mode, theme, maxPlayers, debug, accountLevels:[progress.level()], ...progress.matchOptions(debug)})
            새 판이면 resetMatchSettings (피드백 #62)
            패배 → GameOverScreen(정산 progress.settle) → [다시 하기]/[로비로] → Boot
```

### 1.3 UI가 sim을 읽고 명령을 보내는 방식

- 화면은 `this.match.state`·`this.match.world`(엔티티)·`this.match.ctx`(rules)를 **읽기만** 한다. 미리 검사는 sim의 순수 함수(`summonCheck`, `summonStackCheck`, `stackMergeCheck`, `sellCheck` …)를 같이 쓴다.
- 바꿀 때는 `this.match.world.enqueue({type, ...})` (Game.ts에 30곳, `World.enqueue` = `src/sim/World.ts:257`). CLAUDE.md의 `sim.enqueue()`는 실제로 `world.enqueue()`다.
- 명령 30종 (`src/sim/Commands.ts` `COMMAND_TYPES`): `noop, debugSkipStage, summon, debugAddGold, merge, mergeAll, move, hold, debugTower, hireWorker, pickCard, pickMerge, debugCard, upgrade, gamble, startChallenge, claimMission, claimAllMissions, sellTower, debugConvertTower, debugSetChance, readyNow, summonPad, summonAuto, mergeStack, mergeAllStacks, moveStack, gacha, craft, ult`. 지금 화면이 쓰는 소환은 `summonPad`(칸 누름)·`summonAuto`(버튼·꾹), 승급은 `mergeStack`·`mergeAllStacks`, 이동은 `moveStack`(G-1 무더기). 예전 `summon/merge/move`는 리플레이 호환으로 남아 있다.
- 자동 판매·자동 승급·필살기 자동은 **화면이 평소 명령을 보내는 방식**(sim 규칙 없음, 리플레이에 남음).
- sim 사건(`world.emit`)을 화면이 프레임마다 읽어 연출·알림·HUD를 갱신한다.

### 1.4 저장 키와 형식 버전

| 키 | 내용 | 버전 | 코드 |
|----|------|------|------|
| `rtd.progress` / `rtd.progress.dev` | 판 밖 성장 (계정 레벨·경험치·골드·보석·영웅 레벨/카드·최고 웨이브·받은 웨이브·모집·누적/오늘 기록·업적·보상 준 판) | `v: 1` (`PROGRESS_VERSION`) | `src/meta/progress.ts:22`, `progressStore.ts:42-43` |
| `rtd.account` | 예전 계정: `{v:1, level, hidden[], guides[], codex{}}` — 히든 미션 발견·본 도움말('firstMerge')·신화 도감 발견. **레벨의 정답은 이제 rtd.progress**(처음 한 번만 옮김) | `v: 1` | `src/meta/account.ts:16-17` |
| `rtd.settings` | 화면 설정 (2.? 아래 3.4 표) | `v: 2` (v1 → tapMerge 한 번 꺼짐) | `src/meta/settings.ts:20-21` |
| `rtd.match` / `rtd.match.dev` | 진행 중 판: `RTD1 <해시8>\n<JSON>` = {format, app 버전, dataHash, dev, speed, runId, inputs, world 체크포인트} | `MATCH_SAVE_FORMAT = 1` | `src/save/MatchSaves.ts:23-27` |
| `rtd.records` (예전 `random-td.battle-records`) | 전투 기록 (최고 단계·보스별·도전·최근 5판) | `version: 2` | `src/save/BattleRecords.ts:16-19` |
| `rtd.effectVolume` (예전 `random-td.effect-volume`) | 효과음 0~100, 기본 40 | 없음 | `src/audio/EffectAudio.ts:13-15` |
| `rtd.screenShake` (예전 `random-td.screen-shake`) | 'on'/'off', 없으면 기기 '동작 줄이기'를 따름 | 없음 | `src/save/ScreenShake.ts:10-11` |
| `rtd.dev.pastRuns` (**sessionStorage**) | 개발자 '지난 판 기록' | — | `src/ui/guide/runHistory.ts:13` |

- E2E는 `playwright.config.ts`에서 `rtd.account`에 `guides:['firstMerge']`를 미리 넣는다(첫 승급 안내 끔).

### 1.5 데이터 JSON

| 파일 | 역할 |
|------|------|
| `src/data/towers.json` | 타워 65종(필드: id·name·lore·role·grade·special·unlock·tags·damageType·shape·shapeValue·aps·range·armorPen·magicPen·crit·critMul·detect·detectRange·target·dot·ability·awaken·params·recipe·design·atk·matk·tatk·faction·element), `baseDps`(등급별), factions·rivals·alliance·elements |
| `src/data/game.json` | 판 공통: speeds/devSpeeds, match(시작 1000원·준비 60초·단계 60초·보스 10단계마다), summon(cost 100·godChance 0.0001·pity 30/rare), board(stackMax 3·unitCap 30), summonGamble, ultimate, sell, devChances, combat, merge(count 3·chainMax 12), hud, guide, debug, status, aura, towerLevel(max 15·+4%/Lv), worker(300원·10명·5초 5원), interest(100원당 10원·최대 10,000), boss, detection, formation, upgrade(grade/stat/transcend/summon/unitCap), gamble, challenge, art |
| `src/data/progression.json` | 판 밖: account·matchRewards·heroes·hidden(unlockFragments 5)·waveRoad(10~1000, 100개)·recruit·quests(일일 4 + 보너스 + 업적 21)·shop(5)·modes(캠페인 Lv10) |
| `src/data/enemies.json` | 몹 13종·보스·도전 보스·편대·등장 구성 |
| `src/data/cards.json` | 보스 카드·3택 1 카드 (`summonDiscount` 2장 포함) |
| `src/data/campaign.json` | 캠페인 테마 10 (맵은 테마 1 = crossroads만 실제 파일) |
| `src/data/decks.json` | 기본 덱(등급별 5종) |
| `src/data/missions.json` | 판 안 일반·히든 미션 |
| `src/data/characterLooks.json` | 캐릭터 외형 106개(타워 65 + 각성/적/인물), **`scale` = 전투 그림 등급 배율** |
| `src/data/curves.json` | 미리 계산한 곡선(체력·초월 비용 등, `tools/precompute-curves.mjs`) |
| `src/data/maps/circle.json` | 무한 모드 '소환 마당' 6×8, 배치 칸 24 (`layout: "field"`) |
| `src/data/maps/crossroads.json` | 캠페인 테마 1 사거리 미로 |

---

## 2. 빌드·릴리스·업데이트 파이프라인

### 2.1 `.github/workflows/android.yml` (Android APK)

- 트리거: `push` → `main`, `feat/android`. **paths-ignore**: `docs/**`, `**/*.md`, `.github/**` (이 셋만 바뀐 푸시는 APK 안 만듦). `workflow_dispatch` 수동 실행. concurrency `android-${ref}` (취소 안 함).
- **build** (ubuntu, 40분, Node 22, Java 21 temurin, 액션은 커밋 SHA 고정):
  1. `fetch-depth: 0` + 태그 → `git tag -l 'android-v*'` → `node tools/release-version.mjs --tags-file … --write` → `version`·`versionCode`·`previousTag` (package.json·package-lock·AndroidManifest를 **CI 작업 폴더에만** 씀).
     - 규칙(`tools/release-version.mjs:5-11`): package.json 버전이 가장 높은 태그보다 크면 그대로, 아니면 **가장 높은 태그의 patch + 1**. versionCode = major·1e6 + minor·1e3 + patch, minor·patch < 1000, Manifest versionCode보다 커야 함.
  2. 릴리스 노트 = 이전 태그 이후 `--no-merges` 커밋 제목 30개.
  3. 버전 일치 확인 → `npm ci` → `npm test` → `npm run check` → `npm run build` → `bash android/check-java.sh`(AssetPaths·UpdateLogic 자바 테스트).
  4. `android/setup-sdk.sh` + `build-apk.sh` → `Random-TD_Offline_v<버전>-unsigned.apk`, aapt2로 앱 ID `com.woohak.randomtd`·버전·권한(INTERNET, REQUEST_INSTALL_PACKAGES) 확인 → 아티팩트.
- **sign** (`main`만, Environment **`android-release`**): 저장소 코드는 `android/setup-sdk.sh`만 sparse. 비밀값 `ANDROID_KEYSTORE_BASE64`·`ANDROID_KEYSTORE_PASSWORD`·`ANDROID_KEY_PASSWORD`(+`ANDROID_KEY_ALIAS`, 없으면 'randomtd') → apksigner v2+v3(v1 끔) → verify(v3 필수) → **서명 인증서 SHA-256 `0422434c…a7cd02a` 확인**(다르면 실패) → `SHA256SUMS`.
- **publish** (`main`, 서명됐을 때): `gh release create android-v<버전>` + APK + `SHA256SUMS`, 제목 '운빨 디펜스 Android v<버전>'. 태그가 이미 있으면 건너뜀.

### 2.2 `.github/workflows/ci.yml`

- 모든 브랜치 push + PR. Node 22 + Python 3.12 → `npm ci` → `npm test` → `npm run check` → `npm run build` → 번들 크기 출력. 15분. **E2E는 CI에 없다**(사람/에이전트가 로컬에서).

### 2.3 피드백 에이전트 (`.github/workflows/feedback-agent.yml` + `.github/feedback-agent/`)

- 트리거: 이슈 `labeled` = `feedback`, **이슈 작성자 = 저장소 주인 AND 라벨 단 사람 = 주인**일 때만. 같은 이슈는 하나씩.
- `run.mjs`: Anthropic SDK `@anthropic-ai/sdk@1.9.0`, Managed Agents(이름 `random-td-feedback`, 모델 `claude-opus-5-5`, web_fetch/web_search 끔), 저장소를 `/workspace/repo`에 마운트, 브랜치 `fix/feedback-<번호>`.
- 한도: `FB_BUDGET_CENTS=500`(5달러), `FB_DEADLINE_MIN=45`, 마무리 신호 `FB_WRAPUP_MIN=10`·`FB_WRAPUP_PCT=80`, 유예 `FB_GRACE_MIN=5`, job 60분. 한도 도달이면 초안 PR '(미완성 · 한도 도달)'.
- 시스템 지시: 이슈 글은 데이터, `.github/`·서명·저장 형식·타워 ID 금지, main 푸시 금지, 단계마다 커밋·푸시, `related-e2e.sh`가 고른 스펙 모두 실행.
- `related-e2e.sh`: smoke + 바뀐 스펙 + 바뀐 줄의 testid를 쓰는 스펙 + 폴더→스펙 짝(lobby·progress→g3, hud→hud-layout, sheets→m5, panels·input→m3a, render→a1, art·gallery→characters, theme→g2, guide→f10, feedback, update, devMode→devtools, viewport→t3-screen, Stage→devtools, sim→g1, game.json→m5).

### 2.4 앱 안 업데이트

- 자바 `android/src/com/woohak/randomtd/UpdateLogic.java`: `RELEASES_LATEST_URL = https://api.github.com/repos/qkqh6898-woohak/Random-TD/releases/latest`(인증 없음 = 공개 저장소), 태그 `android-v`, 자산 `Random-TD_Offline_v<x.y.z>.apk`, `SHA256SUMS` 또는 자산 `digest`로 SHA-256 확인, 최대 64MB, 노트 4,000자, 허용 호스트 목록. `Updater.java`가 받기·검증·PackageInstaller.
- 웹 `src/update/UpdateService.ts`: 다리 `window.RandomTDNative`의 `checkUpdate/startUpdate/openInstallSettings/cancelUpdate`(인자 없음), 결과는 `window.__rtdUpdate(사건)` → `updateModel.reduceUpdate`. **로비(타이틀)가 보일 때 실행당 한 번** 확인(`setTitleVisible`), 창(`UpdateDialog`, testid `update-dialog`·`update-now`·`update-status`·`update-progress`…)은 로비에서만. 실패해도 게임 영향 없음.
- **판 저장 무효화**: `MatchSaves.check()`가 `format`·`app`(= `__APP_VERSION__` = 빌드 때 package.json version)·`dataHash`(데이터 지문) 중 하나라도 다르면 `updateMismatch()` → 슬롯 지움 + `discardedByUpdate = true` → Boot가 알림 '업데이트로 진행 중이던 판은 이어 할 수 없어요…'(`MatchSaves.ts:141-166`, `Boot.ts:190`). 계정·설정·기록은 그대로.
- 참고: 저장소의 package.json version은 **0.1.9** 그대로(CI가 0.1.19로 덮어 씀) → 로컬 빌드와 배포 APK의 판 저장은 서로 호환되지 않는다(의도된 동작).

### 2.5 V2.0에서 깨면 안 되는 것

1. 앱 ID `com.woohak.randomtd` + 서명 인증서 SHA-256 `04:22:43:4C:…:D0:2A`(바뀌면 기존 앱 위 업데이트 불가).
2. 태그 `android-v<x.y.z>`·APK 이름 `Random-TD_Offline_v<x.y.z>.apk`·`SHA256SUMS` — **이미 설치된 앱의 자바 UpdateLogic이 이 이름을 찾는다**. 바꾸면 기존 사용자가 V2.0으로 업데이트를 못 받는다.
3. versionCode 단조 증가(`release-version.mjs`). V2.0을 `2.0.0`으로 올리려면 package.json을 손으로 `2.0.0`으로(→ versionCode 2,000,000).
4. 자바 다리 메서드 이름·`__rtdUpdate` 사건 모양, INTERNET·REQUEST_INSTALL_PACKAGES 권한.
5. `main` 푸시 = 자동 서명 릴리스. paths-ignore 규칙.
6. 저장 키·버전(1.4절) — 특히 `rtd.progress` v1(계정 재화·영웅). 형식을 바꾸면 이전(마이그레이션) 코드가 필요(지금은 `save/migrations/` 없음, `parseProgress`가 필드별 기본값으로 관대하게 읽음).

---

## 3. 로비 현황 (`src/ui/lobby/Lobby.ts` 958줄, `lobbyModel.ts` 326줄)

### 3.1 구성

- 뿌리: `div.screen.lobby-screen.title-screen` `data-screen="title"` `data-lobby="1"` `data-tab=<탭>` `data-keyart` (Lobby.ts:900~).
- **위 띠** `lobby-top`(testid): 계정 문장(`lobby-avatar` 안에 레벨 숫자) + `Lv n`(`lobby-level`) + 경험치 바 + `xp/need`, 오른쪽 `💰 골드`(`lobby-gold`) · `💎 보석`(`lobby-gems`). 모델 `topBar()`(lobbyModel.ts:194). ⚙는 위 띠에 **없다**(전투 탭 오른쪽 줄).
- **아래 메뉴** `lobby-nav`(testid) 5칸 `data-tab`: `shop 🛒 상점` · `heroes 🦸 영웅` · `battle ⚔️ 전투`(기본, `is-main`) · `codex 📖 도감` · `locked 🔒 캠페인`(열리면 🏰). 배지 `.lobby-badge`(빨간 숫자, 9 넘으면 '9+').
- 탭 패널 `section[data-panel=…]`:

| 탭 | 내용 | 모델·데이터 |
|----|------|-------------|
| 전투 | 로고, 왼쪽 [📜 퀘스트](`data-action="quests"`, 배지) · [🎺 영웅 모집](`data-action="recruit"`, 게이지 `recruit-gauge`, 배지), 가운데 '최고 웨이브'(`wave-best`) + 웨이브 길(`wave-road`, 노드 `data-wave`, [받기] `wave-claim-<n>` = 모두 받기, `wave-here`), 오른쪽 [🏆 기록](`data-action="records"`) · [⚙️ 설정](`data-action="settings"`) · (개발자 [🛠 +재화] `dev-grant`), 큰 버튼 [▶ 빠른 시작](`data-action="start"`) 또는 [▶ 이어 하기 · n단계](`resume-match`) + [새 게임](`new-game` → 창 `new-game-dialog`/`new-game-ok`/`new-game-cancel`), 개발자 [🏰 캠페인 1 (디버그)](`campaign`), 아래 안내 `wave-next` | `waveRoad()`, `claimableQuests()`, `pd.recruit` |
| 영웅 | [영웅]/[신화](`data-hero-tab`), '보유 n/m', [⬆ 모두 레벨업 N](`hero-levelup-all`), 정렬 [등급 순]/[레벨 순]/[레벨업 가능](`data-sort`), 격자 `hero-grid-owned`/`hero-grid-unowned`, 카드 `button.hero-card[data-hero][data-grade][data-level]` + ▲(`hero-up`) → 상세 창 `hero-detail`(`hero-detail-level`·`-cards`·`-bonus`, [레벨업] `hero-levelup`, [해방] `hero-unlock`) | `heroGrid()`, `heroDetail()`, `levelUpCost`, `heroAtkBonusBp` |
| 상점 | 5개 상품 `shop-item[data-item]`, [💰/💎 가격] `shop-buy-<id>` → '받았어요' 창 `grant-dialog`(`grant-body`, 닫기 `grant-dialog-close`) | `pd.shop`, `buyShopItem` |
| 도감 | '신화 도감' 해방 n/12(`codex-count`), 12줄 `codex-row[data-hero]` 조각 `codex-frag-<id>`, [해방] `codex-unlock-<id>` / [보기] | `fragmentRows()` |
| 캠페인 | 모드 카드 `mode-card[data-mode]`, 잠김 `mode-lock-<id>` / [시작] `mode-start-<id>` | `pd.modes`, `modeUnlocked` |

- 창(모두 `<dialog>`): `quest-dialog`(일일/업적 `data-quest-tab`, `quest-claim-<id>`, `quest-claim-bonus`, `quest-claim-all`), `recruit-dialog`(`recruit-progress`, `recruit-claim`), `settings-dialog`, `grant-dialog`, `hero-detail`, `new-game-dialog`, 기록 창(BattleRecordsDialog), 피드백 창. 닫기 버튼 testid = `<창>-close`.
- 다시 그리기: `progress.subscribe(renderAll)` — 바뀔 때마다 위 띠·메뉴·지금 패널을 통째로 다시 만든다(`replaceChildren`), 스크롤 위치는 피드백 #61로 보존(Lobby.ts:883-896). 뒤로 가기: 열린 창(nativeBack) → 다른 탭이면 전투 → 전투면 앱 종료.

### 3.2 E2E가 기대는 로비 선택자 (V2.0에서 유지해야 할 핵심)

- **반드시 유지**: `[data-screen="title"]`(28회), `.lobby-nav [data-tab="battle"]` 및 `data-tab` 값들, `[data-lobby="1"]`, `data-action="start"`·`resume-match`·`new-game` + `new-game-ok`(→ `e2e/title.ts clickStart`가 **거의 모든 스펙의 시작점**), `data-action="quests"/"recruit"/"records"/"settings"/"campaign"`.
- 자주 쓰임: `lobby-gold`, `lobby-gems`, `lobby-level`, `wave-best`, `wave-road`, `wave-claim-<n>`, `hero-grid-owned`, `data-hero`, `data-hero-tab`, `data-sort`, `hero-levelup(-all)`, `hero-detail*`, `hero-unlock`, `codex-*`, `quest-*`, `recruit-*`, `grant-dialog(-close)`, `settings-dialog`, `lobby-volume`·`lobby-shake`·`lobby-tap-merge`·`lobby-feedback`, `mode-lock-campaign`.

### 3.3 설정은 지금 어디에

1. **로비 설정 창** (전투 탭 오른쪽 [⚙️ 설정] → `settings-dialog`, Lobby.ts:806-832): 효과음 크기(`lobby-volume`, rtd.effectVolume) · 화면 흔들림(`lobby-shake`, rtd.screenShake) · 눌러서 바로 승급(`lobby-tap-merge`, rtd.settings.tapMerge) · [💬 피드백 보내기](`lobby-feedback`) · 버전 글.
2. **전투 일시정지 메뉴** (`src/ui/screens/PauseMenu.ts`, `data-screen="pause"`): [계속](`data-action="resume"`) · 눌러서 바로 승급(`pause-tap-merge`) · 자동 승급 [노말][레어 이하][유니크 이하](`pause-auto-merge-{normal,rare,unique}`) · 필살기 자동(`pause-ult-auto`) · 노말 자동 판매(`pause-auto-sell-normal`) · 레어 이하 자동 판매(`pause-auto-sell-rare`) · 효과음(`pause-volume`, `-preview`, `-value`) · 화면 흔들림(`pause-screen-shake`) · [❔ 도움말 다시 보기](`pause-help`) · [📘 등급·조합 설명](`grade-guide-open`) · [💬 피드백](`pause-feedback`) · [로비로](`data-action="exit"`) · 안내(`pause-note`).
3. **개발자 시트** [🛠 개발] → ⚙ 설정 탭: 연출 끄기(effectsOff)·히든 미션 조건 보기(revealHidden).

### 3.4 설정 키 전부

| 키 (저장 위치) | 기본 | 버전/비고 | 바꾸는 곳 |
|----------------|------|-----------|-----------|
| `tapMerge` (rtd.settings) | **false** | v1·버전 없는 값은 한 번 false로 (v0.1.16) | 로비·일시정지 |
| `effectsOff` (rtd.settings) | false | 개발자 모드에서만 사용 | 개발자 시트 |
| `revealHidden` (rtd.settings) | false | | 개발자 시트 |
| `ultAuto` (rtd.settings) | false | **새 판이면 초기화**(MATCH_SETTING_KEYS) | 일시정지 |
| `autoSellNormal` (rtd.settings) | false | 새 판 초기화 | 일시정지 |
| `autoSellRare` (rtd.settings) | false | 새 판 초기화 | 일시정지 |
| `autoMergeNormal` / `autoMergeRare` / `autoMergeUnique` (rtd.settings) | false | 새 판 초기화, 화면은 하나만 켬 | 일시정지 |
| 효과음 크기 (rtd.effectVolume) | 40 | 0~100, 5단위 | 로비·일시정지 |
| 화면 흔들림 (rtd.screenShake) | 저장값 없으면 `!prefers-reduced-motion` | | 로비·일시정지 |

- rtd.settings 형식: `{ v: 2, ...Settings }` (`settings.ts:120`). 모르는/틀린 값은 기본값(관대한 읽기).

---

## 4. 진행도·재화 현황 (`src/meta/progress.ts`, `progression.json`)

### 4.1 재화

| 재화 | 저장 | 얻는 곳 | 쓰는 곳 | 표시 |
|------|------|---------|---------|------|
| 💰 **돈(원)** — 판 안 | `MatchState.gold` (판 저장) | 시작 1,000원, 처치·보스·특색·일꾼(5초 5원/명)·단계 이자(100원당 10원, 최대 10,000)·도박·판매(가치 50%)·미션 | 소환 100원, 일꾼 300원, 강화, 도박, 소환 도박, 도전? | HUD `hud-gold` |
| 💰 **골드** — 판 밖 | `rtd.progress.gold` | 판 정산(단계×20 + 보스×100), 웨이브 길, 일일 퀘스트, 상점 '골드 주머니'(💎40 → 2,000) | 영웅 레벨업(표 `heroes.gold` × 등급%), 상점 '영웅 카드 묶음' 800 | 로비 `lobby-gold` |
| 💎 **보석** | `rtd.progress.gems` | 시작 50, 계정 레벨업 +10(10의 배수 +50 추가), 웨이브 길, 퀘스트·업적, 모집 보상 +10 | 상점(고급 묶음 60, 레전드 상자 150, 신화 조각 80, 골드 주머니 40) | 로비 `lobby-gems` |
| 🃏 **영웅 카드** (영웅별) | `heroes[id].cards` | 판 정산(`cardsByStage` 2~30장, 등급 가중치), 상점, 퀘스트(`cards`), 웨이브 길, 모집(5장) | 영웅 레벨업(`heroes.cards` × `gradeCardPct`) | 영웅 카드 '가진/필요' |
| 🧩 **신화 조각** (히든 영웅별, `cards` 칸 공용) | `heroes[hiddenId].cards` | 보스 처치당 1(정산), 웨이브 길, 오늘 보너스, 상점 3개 | 해방 5개(`hidden.unlockFragments`) → Lv1. 해방 뒤엔 레벨업 카드 | 도감 `codex-frag-*` |
| ⭐ **경험치/계정 레벨** | `level`, `xp` | 정산(단계×10 + 보스×50 + 새 기록 100) | 다음 레벨 = 100 + 50×(Lv−1). 계정 레벨 = 도박 테이블 해금(sim 입력)·캠페인 Lv10 | 로비 위 띠 |
| 🎺 **모집 게이지** | `recruit`, `recruitSummons` | 판 소환 5회당 1칸 | 30칸 → 카드 5장 + 💎10 | 전투 탭 |

- 이름 충돌 주의: 판 안 '돈'과 판 밖 '골드'가 같은 💰 아이콘.
- '행운석'(PROGRESSION.md·ARCHITECTURE.md·GDD.md 등)은 **코드에 없다** — 💎 보석이 그 자리.

### 4.2 영웅 수집·레벨

- `heroes: Record<towerId, {level 0~15, cards}>`. 새 계정은 기본 덱 25종 Lv1(`newProgress`, progress.ts:114). 미보유 카드를 받으면 첫 장으로 영입(Lv1).
- 레벨업 비용 `levelUpCost(pd, grade, lv)` = `ceil(cards[lv-1] × gradeCardPct/100)`장 + `floor(gold[lv-1] × gradeGoldPct/100)`골드 (progress.ts:250). 최대 15.
- 판 영향: `heroMatchLevels()` → `MatchOptions.levels[0]`(Lv2 이상만) → sim이 **공격력 +4%/Lv**(Aura.ts:101-105, `towerLevel.atkPerLevel`)와 특색 수치 보간(params `[Lv1, Lv15]`)을 적용. 잠긴 히든은 `lockedHidden` → 조합 불가.
- 모두 레벨업(`levelUpAllHeroes`, 피드백 #31): 돌아가며 한 레벨씩.

### 4.3 퀘스트·웨이브 길·상점·모집

- 일일 4개(전투 1판 → 200골드, 15웨이브 → 💎10, 소환 50 → 카드 2, 승급 10 → 300골드) + 오늘 모두 완료 보너스(💎20·🧩1), 날짜는 기기 지역 날짜, 시계가 과거로 가면 세지 않음. 업적 21개(누적). 모두 받기(`claimAllQuests`).
- 웨이브 길: 10~1000웨이브 100개(피드백 #61), 최고 웨이브(무한 모드 일반 판 기준) 이상이면 받기, 한 번에 모두 받기(`claimAllMilestones`).
- 상점 5개(위 표). 무작위는 `accountRng(state, name)` = 계정 시드 + 굴림 번호(Math.random 안 씀). 판 보상은 판 시드 + 결과.
- 판 정산 `settleMatch`(같은 runId 한 번만, 최근 20개 기억).

---

## 5. 사용자 요청 항목

### 5a. 등급 단계 수와 이름

**코드의 등급은 정확히 7개.** `src/data/load.ts:50` `GRADES = ['normal','rare','unique','hero','legend','god','hidden']`, towers.json 개수 노말 10 · 레어 10 · 유니크 10 · 히어로 10 · 레전드 10 · 신 3 · 신화(hidden) 12 = 65.

| id | 화면 이름 (피드백 #23 통일) | 별 | 얻는 법 | baseDps | 판매 배율 | 전투 그림 배율(looks scale) |
|----|------|----|---------|---------|-----------|------|
| normal | 노말 | ★ | 소환 | 15 | ×1 | 0.66~0.90 |
| rare | 레어 | ★★ | 승급 / 레어 직행 | 52.5 | ×3 | 0.78~0.86 |
| unique | 유니크 | ★★★ | 승급 | 180 | ×9 | 0.90~0.98 |
| hero | 히어로 | ★★★★ | 승급 | 600 | ×27 | 1.02~1.10 |
| legend | 레전드 | ★★★★★ | 승급 (끝) | 2100 | ×81 | 1.14~1.22 |
| god | 신 | 👑 | 소환·승급 때 0.01% (`summon.godChance`), 신화 도박 0.4% | **9000** | ×81 (= 레전드) | 1.30~1.38 |
| hidden | 신화 (히든 등급) | 💠 | 조합(recipe 재료 3개) + 판 밖 해방 | **4500** | 재료 가치 합 | **1.46~1.54** |

- 승급 사슬은 **5단계뿐**: `nextGrade()`(`src/sim/Deck.ts:28`) 노말→레어→유니크→히어로→레전드, 레전드·신·신화는 승급 불가.
- **신 vs 신화 순서가 코드마다 다르다** (V2.0의 '7등급' 순서를 정할 때 꼭 결정):
  - 힘·설명 창: baseDps 신화 4500 < 신 9000 → 등급 설명 창(`gradeGuideModel.ts:60`)·UI.md 4.6은 '… 레전드 < 신화 < 신'.
  - 로비 정렬: `lobbyModel.ts:34` `GRADE_RANK` = hidden 7 > god 6 (신화가 위).
  - 전투 그림 크기(FB-D1 #54): 신 1.30~1.38 < 신화 1.46~1.54 (신화가 큼).
  - 소환 도박 순위·천장: `rules.ts:1053 gradeRank` = hidden을 레전드(5)와 같게, god 6.
  - 판매: 신 = 레전드 배율(81).
- V2.0 7등급 대응(제안 없이 사실만): 지금 7개 id를 그대로 7단계로 쓸 수 있다. 다만 '승급 사슬 7단계'를 원한다면 지금은 5단계 사슬 + 특수 획득 2종(신·신화) 구조라 규칙 변경이 필요.
- **등급 목록이 코드에 박힌 곳** (데이터 주도 아님):
  - 등급 id: `load.ts:50 GRADES`, `load.ts:398 GACHA_GRADES`(+'none'), `deck.ts:8 DECK_GRADES`(5), `progressionData.ts:16 CARD_GRADES`(5), `settings.ts:56 AUTO_MERGE_GRADES`, `Game.ts:2507`, `Gallery.ts:35-38`.
  - 한국어 이름 표 **6벌**: `lobbyModel.ts:23 GRADE_KO`, `towerPanelModel.ts:25 GRADE_NAMES`(등급 설명 창·캐릭터 카드도 이것), `choiceModel.ts:73`, `Gallery.ts:42`, `g1Models.ts:20 GACHA_GRADE_NAMES`, `sheetModels.ts:33 GRADE_SHORT`. + game.json 강화 이름('노말·레어 강화' 등)·missions.json 글자.
  - 순위: `lobbyModel.ts:34 GRADE_RANK`, `rules.ts:133 GACHA_RANK`, `rules.ts:1053 gradeRank`.
  - 색·모양: `art/palette.ts:7 GRADE_COLORS`, `art/presentation.ts:37 GRADE_STYLE`, `art/towerLook.ts:35 GRADE_STARS`, `lobbyModel.ts:45 gradeColor`, `towerPanelModel.ts gradeStars`, 등급 테두리 `gradeOutline.ts`.
- **데이터 주도인 것**: 타워별 `grade`(towers.json), `baseDps`, `game.json sell.gradeMul`·`confirmGrades`·`ultimate.grades`·`summon.pity.grade`·`summonGamble.outcomes`·`upgrade.grade[].grades`, `progression.json gradeCardPct/gradeGoldPct/카드 가중치`, `characterLooks.json scale`.

### 5b. 현재 소환 비용 규칙

- **값**: `game.json summon.cost = 100` → `rules.summonCost`(`rules.ts:688`).
- **계산** (`src/sim/systems/Summon.ts:59-66 summonCost`): `cost = max(min, 100 − state.summonDiscount)`, `min = summonCostMin`(= cards.json 첫 `summonDiscount` 카드의 `min` 50, `rules.ts:836`). 할인이 0이면 100.
  - 할인 카드: `summonDiscount`(보스 카드, −20원) · `pickDiscount`(3택 1, −10원), 둘 다 '이번 판 영구, 최소 50원' (`Cards.ts:121`).
  - `state.summonDiscount`는 **플레이어별이 아니라 판 전체 하나**(`state.ts:142`).
- **소환마다/웨이브마다 바뀌지 않는다.** 소환 횟수 카운터 `state.summons`(`state.ts:91`)는 있지만 비용에 쓰이지 않음. 단계 전환(`Stage.ts`)도 비용을 건드리지 않음.
- 비용을 쓰는 경로: `summonCheck`(Summon.ts:55)·옛 `summon`(Summon.ts:205), `summonStackCheck`(Board.ts:116)·`summonStack`(Board.ts:146) — 지금 화면은 `summonPad`/`summonAuto` → `summonStack`. 화면은 `summonCost(ctx)`를 매 프레임 읽어 버튼 글자 `[🎲 소환 100원]`(`hud-summon`, hudModel.ts:315)과 '돈 부족' 알림(Game.ts:1153·1183·1781)에 쓴다 → **동적 비용이 되면 화면 표시는 이미 따라간다**.
- **소환 도박** (`game.json summonGamble.kinds`, `Gacha.ts`): 행운 소환 300원(천장 20/유니크), 종족 소환 200원(10/레어), 등급 도전 400원(10/유니크, 꽝 75%), 신화 도박 1000원(25/레전드). 고정 비용, 소환 횟수(`state.summons`)에 **포함**(Gacha.ts:122).
- **천장(pity)**: 일반 소환 30회 안에 레어 이상이 없으면 다음은 레어 확정(`summon.pity {n:30, grade:'rare'}`, `state.pity[player][0]`, Board.ts:127·152). 도박 종류별 칸은 `pity[player][1 + k]`(Gacha.ts:9). 카드 '행운의 소환'(rareSummons)·'쌍둥이 소환'(twin — 비용 없이 하나 더, `summons`는 안 셈).
- **소환 확률 강화**(피드백 #27)는 레어 직행 확률만 올리고 비용과 무관.
- 판매 가치도 소환 비용에 묶여 있다: `rules.ts:1024-1036 buildTowerValues` = **`game.summon.cost` × gradeMul** (노말 100·레어 300 … 레전드 8,100), 판매가 = 50%.

**V2.0 목표(기본 20, 소환마다 +2, 최대 200, 웨이브 바뀌어도 초기화 없음)로 바꿀 때 영향 (바꾸지 않음, 메모만)**

| 영역 | 영향 |
|------|------|
| sim 상태 | 비용을 '소환 횟수'로 계산하려면 **플레이어별 카운터**가 필요. `state.summons`는 판 전체·소환 도박 포함·쌍둥이 제외라 그대로 쓰기 애매 → 새 필드(예: `summonCount[player]`)를 넣으면 `MatchState` 모양이 바뀜 → 해시·판 저장 체크포인트 변경. `OPTIONAL_STATE_KEYS`(state.ts:245 — `chanceOv`·`sells`처럼 처음 쓸 때만 생기는 키)로 넣으면 옛 저장 복원 호환 가능. |
| 규칙 | `summonCost()` 한 곳 + `game.json summon` 스키마(`load.ts`)·`rules.ts`. 할인 카드(−20/−10, 최소 50)와 '최대 200'의 관계, 소환 도박을 카운터에 넣을지 결정 필요. |
| 판매 가치 | `buildTowerValues`가 `summon.cost`를 기준으로 하므로 기본을 20으로 바꾸면 **판매가가 1/5로** 줄어든다 → 판매 기준값을 따로 떼야 함(`sell.baseValue` 같은 데이터). 히든 가치·자동 판매·정보 패널 판매가·tests(T2, feedback-46 등) 영향. |
| 리플레이 | `tests/replays/*.json` 8개 모두 소환이 있어 **finalHash·checkpoints 전부 바뀜**(`npm run replays`로 다시 기록). 돈이 달라져 이후 명령이 실패할 수 있어 시나리오 검사(요약 값 기대)도 바뀔 수 있음. dataHash도 바뀜. |
| 판 저장 | game.json이 바뀌면 dataHash가 달라져 진행 중 판은 어차피 버려짐(정상 동작). |
| 테스트 | 비용 100을 기대하는 단위·통합: `Summon`, `Cards`, `Mission`, `G1`, `T2`, `Gamble`, `load`, `f10`, `view-m2/m3/m5`, `feedback-45/59/65`, `stageInterest`, `combat`, `replay` 등. E2E: `g1`, `f10`, `fb27`, `m2`, `t2`(버튼 글자 '100원'·돈 계산). |
| 밸런스 봇 | `tests/replays/bot.ts`, `tests/bots/firstBoss.ts`(첫 보스 봇 A 18/20·B 20/20 기준), `tools/sim.mjs`, `tests/integration/botCheck.test.ts` — 경제가 크게 바뀌므로 다시 재야 함. 미션 `maxSummons`·일일 퀘스트 '소환 50번'·모집 게이지(소환 5회당 1칸) 체감도 바뀜. |
| 화면 | 꾹 눌러 연속 소환(`Game.ts` `autoSummonTick`·같은 틱 대기)은 비용을 실행 때 sim이 다시 계산하므로 문제 없음. 돈 부족 알림 문구는 `summonCost(ctx)`를 읽음. |

### 5c. 전투 화면 상대 진영·상대 프로필 UI

- **멀티 화면 코드는 없다.** `src/net/` 없음, `opponent`/'상대' 화면 코드 없음, 2인 맵 레이아웃 없음(circle.json `layout:"field"` 1인 마당 24칸, crossroads.json 1인). 로비에 '함께하기' 없음.
- 있는 것 = sim 준비뿐: `game.json maxPlayers: 2`, `World` 플레이어 수·명령 큐 플레이어별, `Tower.owner`, `state.perks/mods/pity/gamble/upgrades …[player]`, 리플레이 `players`, 단위 테스트 일부가 `players: 2`(Move·Merge·Upgrade·World·headless 등). 화면은 `const LOCAL_PLAYER = 0`(`Game.ts:251`, 주석 '2인 판은 M13'), 판 생성은 `players` 생략 = 1(Game.ts:497-507), 판 저장은 1인 판만(`MatchSaves.ts:151`). 배속은 화면 설정(멀티에선 ×1 고정 예정, `speed.ts:4`).
- docs/MULTIPLAYER.md 5장에 계획만('협동 B·대결: 상단에 친구 정원 미니맵'). 솔로에서 보이는 상대 UI: **없음**.
- **지금 위 HUD** (`src/ui/hud/Hud.ts:336-342`):
  - 1줄 `hud-top-row`: 왼쪽 `hud-side-l` = [×1](`data-action="speed"`) (+ 개발자 [⏭](`skip-stage`) [💰+](`add-gold`)) · 가운데 `hud-wave` = 'WAVE n'(`hud-stage`, 보스 '👑 …', 준비 '준비') + ⏱(`hud-timer`) · 오른쪽 `hud-side-r` = [⚡ n](`hud-ult`, 찬 캐릭터 있을 때만) + [⏸](`data-action="pause"`).
  - 2줄 `hud-resources`: 💰 돈(`hud-gold`, '+n원' 개별) · 🗼 인원 n/30(`hud-towers`).
  - 3줄 `hud-count-row`: 몹 수 막대(`hud-count-fill`) + n/150(`hud-count`) 또는 ❤ 목숨(캠페인).
  - 그 아래 보스·도전·[▶ 준비 완료] 자리(`hud-banner-slot`, `hud-boss`, `hud-challenge`, `hud-ready`, `hud-boss-note`).
  - 맵 오른쪽 위 떠 있는 [⏫ 모두 승급 n](`hud-merge-all`, `data-action="merge-all-stacks"`).
- **V2.0 목표(왼쪽: 내 아바타+레벨 작게, 오른쪽: 일시정지)와 비교**: 지금 왼쪽은 배속, 가운데는 웨이브·타이머, 오른쪽은 필살기 칩+⏸. 아바타·계정 레벨은 전투 HUD에 **없음**(로비 `lobby-avatar`에 레벨 숫자 문장이 있어 재사용 가능). 배속 버튼·⚡ 칩·웨이브·타이머를 어디로 옮길지 결정 필요. 맵 위쪽 끝은 Game이 HUD 띠 높이를 재서 정하므로(HUD 높이 변화 = 맵 위치 변화) `hud-layout`·`g2`·`fb25`·`t3-screen`·`map-fill` 스펙이 영향받는다.

### 5d. 알림 표시(빨간 점·배지·강조) 판단 로직 위치

| # | 표시 | 파일:줄 | 조건 | 데이터 출처 |
|---|------|---------|------|-------------|
| 1 | 로비 [영웅] 탭 배지 | `Lobby.ts:860` → `lobbyModel.ts:125 heroesReady` | [영웅]+[신화] 탭에서 `ready`(카드 ≥ 필요, **골드 무시**) 수. **잠긴 신화의 조각 ≥ 5도 ready로 셈** | rtd.progress heroes, progression.json heroes/hidden |
| 2 | 로비 [전투] 탭 배지 | `Lobby.ts:861` | 웨이브 길 받기 수 + `claimableQuests` + (모집 가득이면 1) | rtd.progress |
| 3 | 로비 [도감] 탭 배지 | `Lobby.ts:862` | `fragmentRows().canUnlock` 수 (= 1번과 **중복**) | rtd.progress |
| 4 | 로비 [상점]·[캠페인] 탭 | `Lobby.ts:859,863` | 늘 0 (캠페인이 열려도 배지 없음, 아이콘만 🏰) | — |
| 5 | [📜 퀘스트] 옆 버튼 배지 | `Lobby.ts:365,374` | `claimableQuests` (일일 끝+안 받음 + 업적 끝+안 받음 + 보너스 준비) | `progress.ts:686` |
| 6 | [🎺 영웅 모집] 배지 | `Lobby.ts:383` | `recruit ≥ goal`이면 1 | progression.json recruit.goal 30 |
| 7 | 퀘스트 창 [모두 받기 N] | `Lobby.ts:768-774` | 5와 같은 수 | |
| 8 | 영웅 카드 ▲(`hero-up`)·`is-ready` | `Lobby.ts:443,447` ← `lobbyModel.ts:93` | 카드 ≥ 필요(골드 무시) | |
| 9 | [⬆ 모두 레벨업 N] | `Lobby.ts:494` ← `lobbyModel.ts:120 canLevel` | `checkLevelUp === 'ok'`(카드 **+ 골드**) — 8과 기준 다름 | |
| 10 | 웨이브 길 노드 `is-ready` + 안내 '받을 웨이브 보상 n개!' | `Lobby.ts:345,323` | `milestoneState === 'ready'` | |
| 11 | 도감 줄 `is-ready` | `Lobby.ts:642` | canUnlock | |
| 12 | 전투 [⚔](도전) 배지·빨간 점 | `sheetModels.ts:91-102 menuBadges` → `Hud.ts:~540`(`is-alert` → CSS `styles.css:1673` 빨간 점) | `challengesAvailable > 0` ('n 가능'), 진행 중이면 '진행 중'(점 없음) | 판 state |
| 13 | 전투 [📋](미션) 배지·빨간 점 | 같은 곳 | `missionsClaimable > 0` ('n 받기') | 판 state |
| 14 | 전투 [⬆ 강화] 배지 | 같은 곳 | 늘 'Lv n'(강조 없음) | |
| 15 | 전투 [💠 신화] 배지·빨간 점 | `Game.ts:3163-3170 syncG1` → `Hud.ts:566 setG1Badges` | 제작 가능 신화 > 0 ('n 제작'), 아니면 '발견 n/12'(점 없음) | `codexModel`, rtd.account codex |
| 16 | [🎲 소환] 천장 강조 `is-pity` | 같은 곳 (`styles.css:4210`) | 천장 남은 수 ≤ 0 → '레어 확정!' | state.pity |
| 17 | [🎰 도박] 배지 | 같은 곳 | '잭팟 n/10'(강조 없음) | state.gamble |
| 18 | 소환 도박 시트 천장 `is-hot` | `SummonSheet.ts:139,146` | 남은 천장 ≤ 3 (숫자 박힘) | |
| 19 | 강화 시트 잭팟 게이지 `is-ready` | `UpgradeSheet.ts:323` | jackpotReady | |
| 20 | 신화 시트 줄 `is-ready` | `MythicSheet.ts:70` | craftable | |
| 21 | 미션 시트 [모두 받기 n · +n원] | `MissionSheet.ts:144-148` | claimable | |
| 22 | [⏫ 모두 승급 n] 보임/숨김 | `Game.ts:2347-2362 → 3145 setMergeAll` (`messages.ts:292`) | 손으로 승급할 무더기 묶음 수 > 0 (자동 승급 대상 제외) | world |
| 23 | [⏫] 반짝임 `is-guide` | `Hud.ts:638` ← Game 첫 승급 안내 | 계정 첫 승급 안내 중 (rtd.account guides) | |
| 24 | '{타워} 승급 가능!' 알림 | `Game.ts:2358-2362` | 새로 승급 가능해진 종류, **판당 3번** | |
| 25 | 정보 패널 '보유 n/3' `is-ready` | `TowerPanel.ts:255` ← `towerPanelModel.ownedReady` | 승급 가능 등급 + 3개 | |
| 26 | 칸 '2/3' 배지 | `guideModel.ts:41 pairBadges` → `GuideLayer` | 같은 종류 2개 | |
| 27 | [⚡ n] 필살기 칩 보임 | `Hud.ts setUlts` ← `readyUlts` | 게이지 찬 히어로 이상 수 | Tower.ult |
| 28 | 카드 고르기 알약 `cp-pill` | `ChoicePanel.ts:80` | 고르지 않은 카드 묶음 | state.cardOffers |
| 29 | 업데이트 창 | `UpdateDialog.ts` ← `UpdateService` | 로비가 보일 때 새 버전 | GitHub releases (자바) |
| 30 | '업데이트로 판을 이어 할 수 없어요' 알림 | `Boot.ts:190` | `saves.discardedByUpdate` | MatchSaves |

- **불일치·중복 정리**: ① 잠긴 신화 해방 가능이 [영웅] 탭(1)과 [도감] 탭(3)에 같이 잡힘. ② 영웅 ▲·탭 배지(카드만)와 [모두 레벨업 N](카드+골드) 기준이 다름 → 골드가 없으면 배지는 뜨는데 버튼은 꺼짐. ③ [전투] 탭 배지(2)는 웨이브 길·퀘스트·모집의 합인데, 옆 버튼(5·6)이 같은 것을 다시 셈(같은 화면 안 이중 표시는 의도일 수 있음). ④ 배지 모양이 3가지(로비 빨간 숫자 `.lobby-badge` / 전투 금색 글자+빨간 점 `.is-alert` / 둥근 버튼 아래 글자). ⑤ 판 안 배지는 매 프레임(또는 5틱마다) 다시 계산, 로비는 `progress.subscribe`로 다시 그릴 때 계산 — 계산 시점 규칙이 없음. ⑥ '9+' 상한·천장 ≤ 3·판당 3번 같은 수가 코드에 박힘.

### 5e. 불꽃 재화

- 검색: `불꽃`, `flame`, `fire`, `ember`, `🔥` (src·data·docs).
- 결과: **불꽃 재화는 없다.** 걸린 것은 몹 생김새 '불꽃 몸'(enemies.json:740), 타워 lore 글자, 그림 코드 주석(`art/characters/*`), 맞음 연출 '불꽃'(Fx.ts·fxModel.ts·Game.ts 주석), 원소 `element: "fire"`(towers.json, 🔥화염 — dragoncaller·archmage), 카드 아이콘 `ultCharge: '🔥'`(choiceModel.ts:44 — 카드 '투지', 필살기 충전). 저장 키·HUD·로비 표시 없음.
- 있는 재화: 4.1절 표(판 안 💰돈 / 판 밖 💰골드·💎보석·🃏카드·🧩조각·⭐경험치·🎺모집).

---

## 6. 유닛 정보 패널 데이터 현황

- 지금 패널: `src/ui/panels/TowerPanel.ts`(DOM, `tower-panel`·`tp-*`·`data-action` merge/merge-all/move/sell/convert/panel-close/panel-info) + 모델 `towerPanelModel.ts buildTowerPanelModel`(순수). 입력은 `Game.ts:~1595-1620`이 만든다(stats = `rules.towers`, eff = `effectiveStats(rules, stats, mods, towerBonus(...))`, level = `towerLevel()`, owned/stack = `towersAt().length`, sell = `sellPrice()`). 칸 위 [⬆] `TowerQuick.ts`(`tq-merge`), 캐릭터 카드 `CharacterCard.ts`(`character-card`).

| V2.0 필드 | 지금 있는 곳 | 상태 |
|-----------|-------------|------|
| **고정** id | towers.json `id` | 있음 |
| name | `name` | 있음 |
| grade | `grade` | 있음 (5a 순서 문제) |
| race | `faction` + `towers.json factions[f].name` (패널은 `shortFactionName`) | 있음 (이름: '종족') |
| portrait | WebP `public/assets/characters/<id>.webp` (`externalArtUrl`, `towerPortraitKey`), 없으면 절차 그림 | 있음 (코드로 경로 결정, 데이터 필드 아님) |
| baseAttack | `atk`·`matk`·`tatk` (물리·마법·고정 3갈래, 소수) → `rules.towers` `atkC/matkC/tatkC`(× ATK_SCALE) | 있음 (단일 값 아님) |
| baseAttackSpeed | `aps` → `apsMilli` | 있음 |
| range | `range`(칸, ≥50 = 맵 전체) | 있음 |
| sellPrice | `sellPrice(rules, id)` = `towerValues`(소환 비용 × gradeMul, 신화 = 재료 합) × 50% (`Sell.ts:28`) | 계산값 (5b 소환 비용 결합 주의) |
| skills[] | `ability`(글자) + `special`(1 = 특색 45종) + `params`(수치, `[Lv1, Lv15]` 보간) + `awaken`(글자) + 필살기(`game.json ultimate` — 종류는 shape/tags/damageType 규칙, 히어로 이상만) | 부분 — 배열 구조 아님 |
| skill.name | 필살기만 이름(`kinds.nuke.name '필살 폭격'` 등). 특색은 이름 없음(설명만) | **없음**(특색) |
| skill.type passive/active | 특색 = 주기/패시브 혼재(params `cd`·`puddleCd`·`summonCd` 있으면 주기), 필살기 = active | 명시 필드 **없음** |
| descTemplate `{value}` | `ability`가 '1% → 20%'처럼 수치를 글자에 박음 | **없음** |
| value | `params`의 숫자(키 이름 제각각) | 있음(구조 다름) |
| icon | 필살기 kinds `icon`(💥💫📯), 원소 아이콘(towers.json elements) | 특색 아이콘 **없음** |
| cooldown | `params.cd`/`puddleCd`/`summonCd`/`perMobCd` 등 일부 타워만, 필살기는 쿨다운이 아니라 공격 횟수 충전 | 부분 |
| **인스턴스** unitId | `Tower.id` (엔티티 ID, 소환 순서) | 있음 |
| level | `towerLevel(ctx, owner, towerId)` ← `MatchOptions.levels` (판 밖 영웅 레벨, **종류별**이지 개체별 아님), 패널 'Lv n' | 있음 |
| cellIndex | `Tower.tx, ty`(칸 좌표). 배치 칸 번호는 없음(`map.buildable` 순서로 만들 수 있음) | 변환 필요 |
| stackCount 1–3 | `towersAt(world, tx, ty).length` (한 칸 = 같은 종류 최대 `board.stackMax 3`, 개체마다 엔티티) | 계산값 |
| skillGauge 0–1 | `Tower.ult` (bp 0~10000, 히어로 이상만 충전) | 있음 |
| selectedSkill | — | **없음** |
| **계산** 최종 공격력 | `atkC × eff.atkMulBp`(레벨 +4%/Lv·오라·강화·카드) — 패널 `cell('물리', …)` | 있음 |
| 공격력 보너스 | 패널이 '지금 값 + (기본값)' `buffed/base`로 표시 | 있음(차이 값은 따로 없음) |
| 최종 공속 | `eff.apsMilli`(한도 적용) | 있음 |
| 공속 보너스 | `eff.apsMulBp`(×배율) | 있음 |
| canMerge = stackCount==3 | `stackMergeCheck`/`fullStacks`(Merge.ts:243·257) + `canMergeGrade`; 패널 `mergeEnabled`(owned ≥ 3) | 있음 |

- 그 밖에 패널이 보여 주는 것: lore·role, 별, 부제(등급·종족·피해 종류·태그), 사거리·범위(shape), 방관·마관·치명, 감지, 대상 규칙, 승급 결과 후보(덱 다음 등급 5종), 이동/기절 상태, 접기 단계(density 0~6).

---

## 7. 전투 HUD·유닛 크기·배속 현황

### 7.1 HUD 배치 (`Hud.ts`)

- 위 띠 `.hud > .hud-bar`: 5c 참고(1줄 배속·웨이브·⚡·⏸ / 2줄 돈·인원 / 3줄 몹 막대 / 보스 자리).
- 아래 `.hud-dock`:
  - `hud-side-btns`(맵 오른쪽 아래 둥근 버튼): [⚔](`menu-challenge`, 배지 `menu-badge-challenge`) [📋](`menu-mission`, `menu-badge-mission`) (+개발자 [🛠] `menu-dev`).
  - `hud-bottom is-g1`(얇은 자원 줄): 👷 n/10(`hud-workers`) · 카드 알약 자리(`hud-choice-slot`) · [👷 300원](`hud-hire`, 꾹 = 연속). 안내 `hud-hint`.
  - `hud-menu is-g1`(큰 버튼): [💠 신화](`menu-mythic`) · [🎲 소환 100원](`hud-summon`, 천장 `hud-summon-pity`) · [🎰 도박](`menu-gamble`) · [⬆ 강화](`menu-upgrade`).
- 맵: Game이 위 띠 아래 끝·아래 묶음 위 끝을 재서 그 사이에 놓는다(ResizeObserver). 화면 높이 1920~2600 가변(`viewport.ts`).
- E2E가 가장 많이 쓰는 전투 선택자: `hud-summon`(30) · `tower-panel`(26) · `hud-merge-all`(26) · `hud-towers`(25) · `hud-stage`(21) · `menu-upgrade`(16) · `sheet-close`(14) · `hud-count`·`hud-gold`·`menu-mission`·`hud-ult`·`menu-gamble`·`hud-hire`·`tp-sell`·`hud-workers`·`hud-boss` …, `data-action` `pause`(14)·`panel-close`(14)·`merge`(10)·`resume`·`speed`·`move`·`exit`, `[data-screen="game"]`(60)·`[data-screen="pause"]`(23)·`[data-screen="gameover"]`.

### 7.2 유닛 크기 (v0.1.17 이후)

- `src/view/render/towerGeom.ts:17-22`: `figureArtScale(s) = s ≤ 1 ? s × 1.4 : 1.4 + (s − 1) × 0.7` (s = characterLooks `scale`, 이웃과 무관). HUD 앞에서만 더 줄임(`battleFigureScale`, :62). 그림 높이 기준 `FIGURE_TILES = 1.1`칸.
- 그림 너비 ≈ 배율 × 0.92칸 (`stackGeom.ts:12 STACK_HALF_W_PER_ART = 0.46` 반폭). 데이터로 계산한 실제 값(혼자 있는 칸):

| 등급 | looks scale | 전투 배율 | 그림 너비(칸) |
|------|-------------|-----------|---------------|
| 노말 | 0.66~0.90 | 0.92~1.26 | **0.85~1.16** |
| 레어 | 0.78~0.86 | 1.09~1.20 | 1.00~1.11 |
| 유니크 | 0.90~0.98 | 1.26~1.37 | 1.16~1.26 |
| 히어로 | 1.02~1.10 | 1.41~1.47 | 1.30~1.35 |
| 레전드 | 1.14~1.22 | 1.50~1.55 | 1.38~1.43 |
| 신 | 1.30~1.38 | 1.61~1.67 | 1.48~1.53 |
| 신화 | 1.46~1.54 | 1.72~1.78 | **1.58~1.64** |

- 무더기(`stackGeom.ts`): 한 칸 최대 3개(`game.json board.stackMax 3`). 2개 = 좌우 dx ±0.16, 배수 0.78, 상한 `maxArt = (0.56 − 0.16)/0.46 ≈ 0.870` → 각 너비 ≤ 0.80칸. 3개 = 삼각형 dx ±0.17, 배수 0.68, 상한 ≈ 0.848 → 각 너비 ≤ 0.78칸(노말 0.98×0.68 ≈ 0.67 → 0.61칸).
- **V2.0 목표(유닛 ≈ 칸의 70%, 칸당 같은 유닛 최대 3)와 비교**: 칸당 3개는 **이미 같다**. 크기는 혼자 있는 노말도 칸 너비의 약 85~116%, 레전드 ≈140%, 신화 ≈160%로 **목표보다 크다**(70% ≈ 전투 배율 0.76). 무더기 2·3개는 이미 칸 안(≤ 0.80칸)이지만 70%보다는 큼.
- 받침대 0.78칸 × `pedestalScaleFor`(0.85~1.22), 별 배지 0.72칸(`towerGeom.ts:36-37`). 머리 탭 영역(`towerHeadZone`)도 크기를 따라감.

### 7.3 배속

- `game.json speeds` = ×1·×2·×4·×8·×16 (모두 unlockLevel 1), `devSpeeds` = [1,2,4,8,16]. `src/ui/hud/speed.ts availableSpeeds/nextSpeed` 순환(끝 → ×1). 새 판 ×1, 이어 하기는 저장된 배속(`MatchSaves` speed). 배속은 화면 `TickClock` 설정(sim 상태 아님), 한 프레임 따라잡기 `maxFrameMs`. ×4 이상 연출 줄임(`fxModel`), 느린 기기 틱 버림(`tickBudget.ts`).

---

## 8. 열린 PR #71·#72 상태 메모 (2단계용)

- PROGRESS v0.1.19: 초안 PR #70(#65)·#71(#63)·#72(#66)를 `fix/v0.1.19-feedback`에서 마무리 → main **68052a7**(배포 v0.1.19). #70은 `--no-ff`로 합침, **#71·#72는 갈래를 합치지 않고 다시 구현**.
- `git fetch origin '+refs/heads/fix/feedback-*:…'` 결과:
  - `origin/fix/feedback-65` 5eb99e1 — HEAD의 조상(합쳐짐).
  - `origin/fix/feedback-63` **ed77e55** 'WIP FB63 마무리' — HEAD 조상 **아님**(기준 97afd09, 커밋 8개). main에 **없는 것**: sim 새 명령 `autoMerge {g}`(Commands.ts·match.ts·Merge.ts — 기준 등급 위로 연쇄하지 않는 엄격한 자동 승급), 누를 때마다 도는 순환 버튼 UI, 그 메시지·스타일·`feedback-63.test.ts`(초안 버전). main은 화면이 `mergeStack`을 보내는 방식 + 고르기 칩(의도적 선택, 연쇄가 기준 한 단계 위까지 갈 수 있음 = PROGRESS 남은 문제).
  - `origin/fix/feedback-66` **932f2cf** — HEAD 조상 **아님**(커밋 6개). main에 **없는 것**: 유닛 크기 '1.4배 하나'(`BATTLE_FIGURE_SCALE = 1.4`, `isCrowded`·`fillOccupancy` 삭제, `battleFigureScale(lookScale, headroom)` 2인자) — main은 v0.1.17 `figureArtScale`(1 넘는 부분 ×0.7)로 대체. 일꾼 꾹 누르기는 main에 옮겨짐(fb66 E2E·feedback-66 단위 테스트 main 버전 있음).
- GitHub의 PR 열림/닫힘 상태는 이 세션에서 GitHub API에 닿지 않아 **미확인**.

---

## 9. 테스트 현황

| 항목 | 값 |
|------|----|
| Vitest | **101파일 · 1,531 통과 · 3 건너뜀** (이번에 직접 실행, 20.9초). unit 91 · integration 10. 리플레이 8개(`tests/replays/r*.json`, `npm run replays`로 다시 기록) |
| E2E | **50스펙 · 234개** (`playwright test --list`). workers 1, 순차, 타임아웃 90초, 뷰포트 412×915 DPR1 터치, `PW_CHROMIUM_PATH`로 브라우저 지정 |
| 전체 E2E 시간 | v0.1.19 **1.4시간**(다른 세션과 동시라 느림), v0.1.14 1.4~1.5시간, G 통합 약 58분 (PROGRESS) |
| 건너뜀 | SAVE_SCREENS=1일 때만 도는 스크린샷 테스트(characters·g2-shots·v14-shots·v19-shots 등) |
| 완료 조건 | `npm test && npm run check && npm run build && npm run e2e` (작은 피드백 묶음은 관련 E2E만 — CLAUDE.md 7장) |

- 핵심 도우미: `e2e/title.ts clickStart(page)` — 로비 → [전투] 탭 → 이어 하기가 있으면 [새 게임] → `new-game-ok`, 없으면 `data-action="start"`. 시작 흐름이 바뀌면 여기만 고치면 된다.
- E2E는 `window.__rtd`(개발 서버·개발자 모드에서 `{game, ctx}`)로 **Game 장면 안쪽을 직접 읽는다**(`__rtd.game.scene.getScene(...)` 101회): `match`, `towerLayer`, 배치(`tile`·`originX/Y`·`mapTop`·`hudBottom`), 안내 상태(`guide`·`preview`), 연출 수, `debugFastForward`, `selectTower` 등 E2E용 공개 멤버(Game.ts:324~1018, 2606~2620, 2791). Game.ts를 쪼개거나 이름을 바꾸면 이 경로들이 깨진다. 업데이트 E2E는 `window.__rtdUpdate`·가짜 `RandomTDNative`.
- '핵심 사용자 흐름' 선택자 묶음(지켜야 할 최소): 시작(`data-screen="title"`·`data-tab`·`start`/`resume-match`/`new-game`/`new-game-ok`), 전투(`data-screen="game"`·`hud-summon`·`hud-merge-all`·`hud-stage`·`hud-gold`·`hud-towers`·`hud-count`·`tower-panel`·`tp-sell`·`panel-close`·`merge`), 메뉴·시트(`menu-*`·`sheet-*`·`sheet-close`·`menu-badge-*`), 일시정지(`pause`·`[data-screen="pause"]`·`resume`·`exit`·`pause-*`), 패배(`[data-screen="gameover"]`·`retry`/`exit`), 업데이트(`update-*`), 피드백(`feedback-*`).

---

## 10. V2.0 위험·제약 메모

**지켜야 할 것**
1. 타워 ID 65종(+각성 그림 이름), 등급 id 7개, 덱·조합식 연결 — 판 밖 저장(`rtd.progress.heroes`)과 리플레이가 id로 묶여 있다.
2. 저장 키·형식 버전(1.4절), 설정 키(3.4절). 특히 `rtd.progress` v1 재화·영웅을 잃지 않게.
3. Phaser **3.90.0** 고정, TypeScript strict, DOM UI 프레임워크 없음.
4. 결정성 규칙(`check-determinism.mjs`), 정수 연산, 명령 패턴 — 새 sim 규칙(소환 비용 증가 등)도 명령/상태로.
5. 오프라인 에셋(WebP 159장 + 절차 그림 대체), 시스템 한글 글꼴.
6. 배속 ×1·2·4·8·16, 20틱/초.
7. 앱 ID·서명·태그·APK 이름·자바 업데이트 다리(2.5절).
8. `e2e/title.ts` 시작 흐름과 핵심 선택자(9장), `window.__rtd` 노출.

**일찍 보인 위험**
- **Game.ts 3,240줄 단일 장면**이 입력·연출·HUD·안내·자동 판매/승급·저장을 모두 가진다 — 화면 대개편 때 충돌·회귀 범위가 크다.
- 소환 비용 변경은 **판매 가치·리플레이·봇 밸런스**까지 번진다(5b). `state.summonDiscount`·`state.summons`가 플레이어별이 아니라 멀티를 생각하면 지금 정리할지 결정 필요.
- 등급 순서(신 vs 신화)가 4곳에서 서로 다르다(5a) — '7등급'을 한 표로 정하지 않으면 정렬·크기·설명이 계속 어긋난다. 이름 표 6벌 중복.
- 알림 로직이 30곳 가까이 흩어지고 중복 집계가 있다(5d) — BadgeManager로 모을 때 로비(구독)와 전투(매 프레임) 계산 시점이 다르다.
- HUD 높이를 바꾸면 맵 위치가 바뀌어 hud-layout·g2·fb25·t3-screen·map-fill 등 크기 검사 스펙이 깨진다. 일시정지 메뉴는 412×915에서 여백 약 13px(설정 줄 추가 여지 없음).
- 유닛 70% 목표는 지금(85~164%)보다 훨씬 작다 — 탭 머리 영역·받침대·별 배지·초상 카드 위치(`towerGeom` 여러 상수)가 같이 움직인다. b1·art·f10·fb66·feedback-20 등 크기 테스트 영향.
- 화면 대개편은 CLAUDE.md 7장 기준 '큰 묶음' → 전체 E2E(약 1.4시간) + 사용자 승인 필요.
- 로컬 package.json version 0.1.9 ↔ 배포 0.1.19: V2.0에서 2.0.0으로 올리면 CI `release-version.mjs`가 그대로 쓴다(태그보다 큼).
- 피드백 에이전트가 V2.0 작업 중에도 `fix/feedback-*`를 main 기준으로 만들면 충돌 — V2.0 동안 라벨 운영을 정해야 함.

---

## 11. 문서-코드 불일치 표

| # | 문서 (위치) | 문서 내용 | 코드 실제 | 고칠 제안 |
|---|-------------|-----------|-----------|-----------|
| 1 | CLAUDE.md 3장 폴더 구조 | `src/net/ 멀티 (M13)`, `src/sim/… campaign.ts`, `src/meta/ (account, shop, talents, towerGrowth, attendance, missions, achievements)` | `src/net/` 없음, `src/sim/campaign.ts` 없음(캠페인은 match.ts), meta = account·progress·progressStore·progressionData·settings·matchResult | 실제 파일 목록으로 바꾸고 '계획'은 따로 표시 |
| 2 | CLAUDE.md 4장 '스토리' | `src/data/story.json`에 프롤로그·챕터 대사 작성 | `story.json` 없음 | '미구현(계획)'으로 |
| 3 | CLAUDE.md 4장 '테마 2~10 맵' | 생성해 `src/data/maps/`에 저장 | maps는 circle·crossroads 2개뿐 | '테마 1만 있음' |
| 4 | CLAUDE.md 4장 '멀티' | 로컬 루프백 + WebRTC + QR | 구현 없음(sim만 2인 준비) | '미구현, sim 준비만' |
| 5 | CLAUDE.md 2장 7번 | `npm run check` = 타입 + 결정성 + gen_tables | `tsc` + `check-determinism` + **`precompute-curves --check`** + gen_tables (package.json) | 곡선 검사 추가 |
| 6 | CLAUDE.md 2장 1번 | 명령은 `sim.enqueue()` | `world.enqueue()` (`World.ts:257`, Game은 `this.match.world.enqueue`) | 이름 맞추기 |
| 7 | CLAUDE.md 6장 | 버전 = 가장 높은 태그 patch + 1 | package.json이 더 크면 그대로, 아니면 patch + 1 (`release-version.mjs:5-11`); 빌드에 Java 검사 단계도 있음 | 규칙 두 줄로 |
| 8 | ARCHITECTURE.md 1장·3장 전체 | Capacitor + `@capgo/capacitor-updater` 번들 라이브 업데이트, `release.yml`(태그 푸시), `latest.json` 매니페스트, 자동 롤백, 공개 업데이트 전용 저장소 `Random-TD-updates`·`UPDATES_REPO_TOKEN`, 설정 [업데이트 확인]·자동 확인 끄기 | 자바 WebView 앱 + **APK 통째 업데이트**(GitHub `Random-TD` releases/latest, 인증 없음), `android.yml`(main 푸시), SHA-256 확인, 로비에서 실행당 1회 자동 확인, 설정 버튼·끄기 없음 | 3장을 U-1 실제 흐름으로 다시 씀 |
| 9 | ARCHITECTURE.md 2장 폴더 | `config/ core/ systems/ scenes/`, data `grades.json recipes.json mobs.json stages.json upgrades.json gamble.json account.json shop.json talents.json …`, `public/assets/characters/<id>/ 파츠 SVG` | `sim/ view/ ui/ meta/ save/`, data 11개 JSON(1.5절), WebP 한 장씩 | 실제 구조로 |
| 10 | ARCHITECTURE.md 3.6 | `saveVersion` + `save/migrations/` 순서 변환, 업데이트 전 자동 백업 | 마이그레이션 폴더·백업 없음. 판 저장은 버전 다르면 **버림**, 계정은 필드별 관대한 읽기 | 실제 규칙(MatchSaves.updateMismatch, parseProgress) |
| 11 | UI.md 4.1 배치도·4.2 HUD 표 | 1줄 '2-32 ⏱ ❤ ⏸', 2줄 '💰 👷 ×1', 하단 메뉴 [⚔ 도전][⬆ 강화][📋 미션], 종족 시너지 HUD 왼쪽 세로줄 | 13장 G-1 배치(배속 왼쪽 · WAVE 가운데 · ⚡⏸ 오른쪽 / 돈·인원 / 몹 막대; 아래 [💠][🎲][🎰][⬆] + 둥근 [⚔][📋]), 시너지 HUD 없음 | 4.1·4.2를 13장으로 대체 표시 |
| 12 | UI.md 4.1 아래 띠 설명(78-79줄) | [⬆ 승급 가능 n]이 보이면 소환 버튼 줄임, `[⬆ 2]` | `hud-merge-ready` 피드백 #65에서 삭제 | 문단 삭제 |
| 13 | UI.md 4.3 '타워 터치' | 승급할 수 있으면 **패널 없이 바로 승급** | `tapMerge` 기본 **꺼짐**(v0.1.16) — 패널 [⬆ 승급]으로 | '설정을 켜면' 으로 |
| 14 | UI.md 4.4 패널 그림 | [💰 판매 +450원] 버튼 줄, [💠 조합] 버튼 | 판매는 머리 줄 `tp-sell` 하나, 패널에 조합 버튼 없음(신화 시트) | 그림 갱신 |
| 15 | UI.md 4.5 '⬆ 강화' | [등급 강화] 일반·영웅·전설, [도박] 탭 | 이름 '노말·레어/유니크·히어로/레전드·신·신화 강화'(#23), 도박은 [🎰 도박] 시트로 분리 | 갱신 |
| 16 | UI.md 4.6 일시정지 | '[타이틀로]', 설정은 '눌러서 바로 승급'만 | [로비로] + 자동 승급·필살기 자동·자동 판매 2·효과음·흔들림·등급 설명·피드백 | 3.3절 목록으로 |
| 17 | UI.md 4.7 개발자 HUD | 'HUD 2줄: 💰 돈 · 👷 일꾼 · [💰+] [⏭] [×1]' | 1줄 왼쪽 [×1][⏭][💰+], 일꾼은 아래 띠 | 갱신 |
| 18 | UI.md 7장 설정 표 | 배경음·진동·소환 방식·피해 숫자·대기 애니·화면 꺼짐·글자 크기·색약·자동 업데이트·저장 내보내기·튜토리얼 | 실제 설정은 3.4절 9개(배경음·진동 등 없음) | '계획'과 '지금' 나누기 |
| 19 | UI.md 8장 '승급 가능' | 하단 버튼에 숫자 배지 | 맵 오른쪽 위 [⏫ 모두 승급 n] | 갱신 |
| 20 | UI.md 12장 상점 | '전설 상자' | '레전드 상자'(#23, progression.json) | 이름 |
| 21 | GDD.md 135줄 | 소환 비용 100원 고정 (**상점 할인 최대 −25원**) | 상점 할인 없음, 카드 할인만(−20/−10, 최소 50) | 카드 할인으로 |
| 22 | GDD.md 675줄 | 아래 자원 줄 [💰 돈 · 🗼 인원 · … · ⬆ 승급 가능] | 돈·인원은 위 HUD, 승급 가능 버튼 없음 | 갱신 |
| 23 | PROGRESSION.md·GDD·ARCHITECTURE·UI.md 2장 | '행운석' 재화, 상점 영구 효과·특성·출석·덱 편성 등 | 행운석 없음(💎 보석), 그 화면들 없음 | 계획 표시 |
| 24 | UI.md 4.6·`gradeGuideModel` vs 코드 다른 곳 | 등급 순서 '레전드 < 신화 < 신' | lobbyModel GRADE_RANK·전투 그림 크기는 신 < 신화 | 순서 하나로 결정 후 문서·코드 통일 |
| 25 | PROGRESS.md v0.1.19 절 머리(1573줄) | '상태: 통합 완료, main 병합 전' | main 68052a7에 들어가 v0.1.19로 배포됨 | 상태 갱신 |
| 26 | PROGRESS.md v0.1.17 절 | 등급 배율 '노말 0.7 ~ 신화 1.5' → 노말 ≈0.98 | 실제 노말 scale 0.66~0.90 → 0.92~1.26 (등급 안 범위가 넓음) | 범위로 적기 |
| 27 | MULTIPLAYER.md 6장·ARCHITECTURE 2.1-4 | `net/` 폴더에만 네트워크 코드 | 네트워크 코드는 자바(Updater)와 피드백 URL 열기뿐, `net/` 없음 | 갱신 |
| 28 | (코드 주석) `Lobby.ts:5` | 위 띠에 ⚙ 설정 | 위 띠에 설정 없음(전투 탭 오른쪽 줄) | 주석 고침 |
| 29 | (코드 주석) `account.ts:4` | 계정 레벨로 '×3 배속(Lv12)' 해금 | ×3 없음, 배속 모두 Lv1, 계정 레벨 정답은 rtd.progress | 주석 고침 |
| 30 | CLAUDE.md 1장 '앱 포장' 표 | PWA(manifest + 서비스 워커) 유지 | `public/`에는 `assets/`뿐 — manifest·서비스 워커 파일 없음, index.html·main.ts에 등록 코드 없음 | 'PWA 없음(한 파일 빌드만)'으로 |

- 개수: **30건**(모두 코드로 확인). 가장 큰 것 3개: ① ARCHITECTURE.md 업데이트 설계 전체(#8~10) — 실제는 APK 통째 업데이트·저장 버림 방식, ② UI.md 4장 전투 화면(#11~17) — G-1·피드백 이후 배치와 다름, ③ CLAUDE.md 폴더·결정 표(#1~4) — net·story·테마 맵·멀티가 '구현됨'처럼 적혀 있음.
