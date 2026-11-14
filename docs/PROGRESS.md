# 개발 진행 기록

> 마일스톤을 끝낼 때마다 아래 형식으로 추가한다. 다음 작업자는 여기서 맥락을 얻는다.
>
> ```
> ## M{n} — 제목 (상태: 완료 / 일부 완료 / 보류)
> - 만든 것:
> - 주요 결정:
> - 테스트:
> - 남은 문제 / 다음 작업자에게:
> ```

## 시작 전 상태 (기획 v0.7)

- 기획 문서 13종, 데이터: `src/data/towers.json`(65종), `enemies.json`(몹 13·보스·4천왕·군주·편대), `campaign.json`(테마 10), `maps/crossroads.json`, `maps/circle.json`
- 검사 도구: `python3 tools/gen_tables.py --check`
- 코드 없음. M0부터 시작
- 환경: Node 22, npm 레지스트리 접근 가능, Playwright 1.63 + Chromium 미리 설치, Java·Gradle 있음, **안드로이드 SDK 다운로드(dl.google.com) 차단** → APK 빌드 보류

## M0 — 프로젝트 뼈대와 결정적 시뮬레이션 코어 (상태: 완료)

- 만든 것:
  - **프로젝트**: `package.json`(phaser 3.90.0 고정, typescript 5.9, vite 8, vitest 5, @playwright/test 1.63.0), 스크립트 `dev`·`build`·`preview`·`test`·`check`·`e2e`·`screens`·`sim`(자리만, `tools/sim.mjs`). `tsconfig.json` strict + `noUncheckedIndexedAccess`.
  - **sim 코어** (`src/sim/`, Phaser·DOM 없음):
    - `Rng.ts` mulberry32(원본과 같은 수열) + `int`(거절 표본, 편향 없음)·`range`·`chanceBp`·`pick`·`weightedIndex`·`shuffle`·`snapshot/restore`. `fork(name)`은 **부모의 처음 시드 + 이름**으로만 자식 시드를 정한다 → 사용량·fork 순서와 무관.
    - `Fixed.ts` `TILE=1000`, `BP_ONE=10000`, `bp()`/`pct()`/`tiles()`(데이터 소수 → 정수, 반올림), `mulBp`(몫·나머지 분해로 2^53 근처까지 정확한 내림), `addBp`, `idiv`, `mulDiv`, `dist2`, `withinRange`(경계 포함), `isqrt`(Math.sqrt 없이).
    - `World.ts` 20Hz 고정 틱(`TICK_HZ`/`TICK_MS`), `step()` = 명령 실행 → 시스템(등록 순) → tick+1, `EntityStore`(항상 ID 순), 사건 `emit/drainEvents`, 실행 명령 기록 `executed`(M3 리플레이 재료), `hashView()/hash()`. 난수 흐름: `world`, `p{n}.summon`, `p{n}.gamble`. `TickClock`: 누적 시간 방식, 배속(0=정지), `maxFrameMs` 따라잡기 한도, 보간용 `alpha`.
    - `Commands.ts` 명령 합집합(지금은 `noop` = 락스텝 빈 명령), 틱 예약 큐, (플레이어, seq) 정렬, seq 자동 번호, 지난 틱·대기 중 중복 거절, `validateCommand`(네트워크 수신 검사용).
    - `hash.ts` FNV-1a 32(UTF-8 바이트 기준, 표준 벡터 일치), `canonicalize`(키 정렬·Map/Set 정렬, **정수가 아닌 숫자는 경로와 함께 거부**), `hashValue`.
  - **데이터 로더** `src/data/load.ts` + `schema.ts`: towers/enemies/campaign/game.json + `maps/*.json`(자동 수집) 검사. 필수 필드·타입·enum·범위·id 중복·맵 격자(줄 길이·legend 글자·B 개수=buildableCount·웨이포인트 직각)·교차 참조(종족·원소·조합 재료·등장 구성 몹 id). 오류는 `DataError` — `towers.json: towers[3].aps: 필수 필드가 없다` 형식, 여러 파일 문제를 한 번에 모음. 새 데이터 `src/data/game.json`(배속 목록 ×1/×2/×3(Lv12), maxFrameMs 250, maxPlayers 2).
  - **결정성 검사** `tools/check-determinism.mjs`: CLAUDE.md 2장 목록(`Math.random`·`Date`·`performance`·`Math.pow/exp/sin/cos/log`·`**`) + 같은 이유의 삼각·쌍곡·`sqrt/cbrt/hypot`·`Math[...]`·DOM 전역·타이머·fetch·crypto 난수·`phaser`/`src/view|ui|…` import. 주석·문자열·정규식 리터럴은 무시하고 템플릿 `${}` 안은 검사. 폴더 인자로 다른 폴더 검사 가능(테스트용).
  - **화면**: `index.html`의 9:16 무대(`#stage`, container query 단위 `cqw`) 위에 Phaser 캔버스(`#game`, 1080×1920 `Scale.FIT`)와 DOM 오버레이(`#ui-root`)를 같은 영역으로 겹침. `src/ui/root.ts`(층: screen/hud/toast, 오류 화면), `ui/screens/TitleScreen.ts`, `ui/hud/Hud.ts`, `ui/hud/speed.ts`. Phaser `Boot` 장면이 절차 생성 타이틀 배경(테마 1 국경 평원: 성벽·풍차·녹스 하늘 균열)과 대기 동작 SD 타워 3명(`src/art/chibi.ts`, 종족 색은 towers.json)을 그림. `Game` 장면: World+TickClock, HUD(시간·틱·배속·⏸→타이틀), 보간 표식(1.5칸/초).
  - **테스트·CI**: `vitest.config.ts`, `playwright.config.ts`, `e2e/smoke.spec.ts`, `.github/workflows/ci.yml`(npm ci → test → check → build → 번들 크기 출력). README에 '실행 방법' 절.
- 주요 결정:
  - **도박 난수 흐름은 플레이어별**(`p0.gamble`, `p1.gamble`): MULTIPLAYER.md 4.2 표는 '도박' 1개지만 같은 표의 원칙("한 사람의 조작이 다른 흐름에 영향 주지 않게")을 따름.
  - fork 시드 = `mix32(부모시드 ^ mix32(fnv1a(이름) × 황금비))` — 흐름을 나중에 만들어도 같은 수열.
  - `World.hash()`는 확정 상태(틱·시드·난수 상태·엔티티)만 넣고 **대기 중 미래 명령은 뺌**(락스텝에서 도착 시점이 달라도 해시가 같게).
  - 로직 틱 20Hz는 결정성 규칙이라 코드 상수, 배속 목록·프레임 한도는 `game.json`. 배속은 sim 상태가 아니라 화면(TickClock) 설정.
  - Phaser `fps.smoothStep: false`: 기본값(true)은 포커스가 없거나 시작 직후 delta를 16.7ms로 잘라 저fps에서 게임 시간이 느려짐(헤드리스에서 실제로 1초에 4틱). 실제 경과 시간을 넘기고 큰 값은 TickClock이 250ms로 자름. TickClock은 1000/30 같은 값의 부동소수 누적 오차로 틱을 놓치지 않게 1e-6틱 여유를 둠.
  - WebGL에서 Graphics는 매 프레임 다시 삼각형으로 쪼개지므로 **정적인 그림은 `generateTexture`로 한 번 구워** Image로 씀(타이틀 배경·게임 바탕).
  - 타이틀 [시작] 버튼은 움직이지 않고 빛 고리(가상 요소)만 맥동 — 터치 위치 고정, Playwright 안정성 검사 통과.
  - 스크린샷: `npm run e2e`는 `test-results/screens/`에만, `npm run screens`(SAVE_SCREENS=1)일 때 `docs/screens/M0.png` 갱신 → e2e를 돌릴 때마다 문서 PNG가 바뀌지 않게.
  - 데이터가 정답이라 스키마를 데이터에 맞춤: `minigolem.fromStage = 0`(깨질 때만 등장), `checkpointRewards.repeat`, 4천왕·군주 `finalBoss.legion` 없음(선택 필드).
- 테스트: Vitest **137개**(단위 9파일 + 통합 1파일) — Rng 재현성(시드 42 첫 5개 스냅샷·원본 구현 비교)·흐름 독립·분포, Fixed 경계(내림·음수·2^53 근처·isqrt 전수), 명령 정렬·거절, 해시 안정성·키 순서 무관·소수 거부, World 틱·시스템 순서·해시·정수 시드, TickClock ×1/×2/×3·30fps·한도, 데이터 로더 에러 경로 12종, 결정성 검사 탐지 31종 + CLI 실패 확인, 배속·HUD·URL 규칙, 헤드리스 2인 1200틱 해시 흐름 재현. E2E **3개**(412×915): 타이틀·캔버스/오버레이 정렬, 시작→틱 진행→배속→복귀, debug ×3·×2 속도 확인. 프로덕션 빌드(`vite preview`)에도 같은 E2E 통과 확인.
  - 번들: `dist/assets/index-*.js` 1,293 kB (gzip 349 kB, 대부분 Phaser), CSS 4.5 kB. 목표 5MB 이하.
  - 스크린샷: `docs/screens/M0.png` (타이틀 화면).
- 남은 문제 / 다음 작업자에게:
  - CI는 로컬에서 같은 단계(npm ci 제외)를 돌려 확인했고, push 금지라 GitHub에서 초록불은 아직 확인 못 함.
  - 데이터 수치는 아직 JSON 원본(소수) 그대로다. M1부터 시스템이 로드할 때 `Fixed.bp()/tiles()`로 정수 단위로 바꿔 sim 상태에 넣을 것(hash가 소수를 거부한다).
  - `src/data/load.ts`는 맵 수집에 `import.meta.glob`(Vite 기능)을 쓴다 → Vitest·브라우저에서는 되지만, M11 `npm run sim`을 순수 node로 돌리려면 vite-node/tsx를 쓰거나 맵 목록을 정적 import로 바꿔야 한다.
  - 캠페인 테마 2~10의 `mapId`(spiral 등) 맵 파일은 M6에서 만든다. 그때 `crossCheck`에 "테마 mapId → 맵 존재" 검사를 추가할 것.
  - `CommandQueue`는 **대기 중** (플레이어, seq) 중복만 거절한다. 이미 실행된 seq가 미래 틱으로 다시 오면 받아들이므로, M13 락스텝에서 플레이어별 마지막 seq 기준 거절을 추가할 것.
  - 결정성 검사의 정규식 리터럴 인식은 앞 글자로 판단하는 휴리스틱이다(후위 `x++ / 2`·`x-- / 2`는 검토 반영으로 나눗셈 처리. 그 밖의 드문 경우는 오인할 수 있음).
  - 헤드리스 Chromium(소프트웨어 WebGL)에서 게임 장면은 약 20fps라 E2E의 틱 속도 검사는 느슨하게 잡았다(×1 > 12틱/초, ×2 > ×1의 1.5배).
  - 타이틀 SD 캐릭터·배경은 임시 절차 그림이다. M11에서 파츠 SVG + animations.json으로 교체.
- 검토 반영 (독립 검토 15건 모두 실제 문제로 확인하고 수정. 같은 문제를 다른 관점에서 짚은 중복 4쌍 포함):
  - **step 도중 enqueue**(major): `CommandQueue`가 take한 틱을 닫는다(`openFrom`). step 안(시스템·처리기)에서 tick을 생략하면 다음 틱으로 잡히고, 이미 꺼낸 현재 틱을 지정하면 `ok:false`(이미 실행 중인 틱). 받아 놓고 실행하지 않는 명령·남는 `pendingKeys`가 없어짐. 회귀 테스트: World 3개, Commands 2개.
  - **명령 객체**: 큐에는 허용 필드만 골라 새로 만든 `Object.freeze` 객체를 넣고 그대로 돌려준다(`Command`는 `Readonly`). 모르는 필드는 `validatePayload`가 거절(`PAYLOAD_FIELDS` 표). 새 명령을 추가할 때 `PAYLOAD_FIELDS`에 필드를 적어야 한다.
  - **최대 인원 한 곳으로**: `Commands.ts`의 `MAX_PLAYERS=4`와 World의 박아 둔 `2`를 지움. `WorldOptions.maxPlayers`(= `game.json` maxPlayers, Game 장면이 넘김), `new CommandQueue(players)`, `validateCommand(cmd, players)`. maxPlayers를 생략하면(헤드리스 테스트) players만 검사.
  - **hash**: Map 키·Set 값은 '모두 안전한 정수' 또는 '모두 문자열'만(객체·섞인 타입·소수는 `HashError`). 정수 키는 따옴표 없이 `M{1:…}`, 문자열 키는 `M{"1":…}`로 구분 → canonical 문자열 형식이 바뀌었다(아직 저장된 리플레이 없음).
  - **결정성 검사**: `Math`는 허용 목록(floor·ceil·round·trunc·imul·min·max·abs·sign·clz32·fround)을 `Math.이름` 꼴로 부를 때만 통과 → 별칭·구조 분해·`Math?.`·`Math.PI`도 위반. `eval`/`Function`·`Reflect`·동적 `import(`·`localeCompare`/`toLocale*`/`Intl` 규칙 추가, 후위 `++`/`--` 뒤 `/`는 나눗셈. 탐지 테스트 17개 추가.
  - **데이터 검사**: 종족 색 `#RRGGBB`, 맵 `spawn = 첫 웨이포인트`, `exit = 마지막 점`(loop면 첫 점으로 복귀), `pathLength = 맨해튼 길이 합`, `turns = 방향 전환 수`(loop는 닫히는 전환 포함, `measurePath`), 길이 0 구간 금지. M6 생성 맵도 이 검사를 통과해야 한다.
  - **전역 오류 화면**: `src/ui/fatal.ts` — window `error`·`unhandledrejection`을 받아 한 번만 오류 화면(게임 루프 `sleep`). 장면 create·update 안의 예외도 콘솔에만 남지 않는다(E2E로 확인).
  - **⏸ = 일시정지 메뉴**(UI.md 4.6): 바로 타이틀로 가지 않고 `PauseMenu`([계속]/[타이틀로])를 연다. 열린 동안 TickClock 배속 0(E2E로 틱 정지 확인), 앱이 백그라운드로 가도(Phaser `hidden`) 자동으로 열림. 배속 칩과 간격을 넓힘.
  - **터치 크기**: `.btn-chip` 최소 `max(11cqw, 44px)` (412px 무대에서 약 45px). E2E가 HUD 칩 44px 이상을 확인.
  - **화면 읽기**: `#ui-root`의 `aria-live` 제거, toast 층만 `role=status aria-live=polite`. HUD 틱·시간은 `aria-live=off`, 시간은 `role=timer`.
  - Game 장면 표식 속도는 `enemies.json` slime.speed에서 읽음(코드 상수 제거). 헤드리스 통합 테스트는 seq를 직접 적고 실행 순서(틱→플레이어→seq)를 단언.
  - 테스트: Vitest 137 → **184개**, E2E 3 → **5개**.

## M1 — 맵과 몹: 순환의 정원에서 몹이 돌고 단계가 진행되며 패배 판정 (상태: 완료)

- 만든 것:
  - **곡선 표 (M1-1)**: `enemies.json`에 구조화한 성장 수치 `growth`(체력 시작값·구간별 증가율, 방어 성장 0.02/단계 + 101단계부터 +1, 보상 10 + ⌊s/10⌋)를 넣고, `tools/precompute-curves.mjs`가 거듭제곱으로 계산해 `src/data/curves.json`(단계 0~500: `hp`, `armorMulBp`, `armorFlat`)을 만든다. `npm run curves`로 다시 만들고, `npm run check`가 `--check`로 표가 최신인지 확인한다.
  - **데이터 추가**: `enemies.json` `spawnOrder`(치유사 8~12번째, 투명 몹 15~20번째), 투명 몹 `invisible: true`(투명 도둑·그림자 늑대). `game.json` v2: `match`(시작 자금 1000, 준비 60초, 단계 60초, 단계당 20칸, 등장 간격 2.5초, 보스 주기 10, 무한 맵 `circle`), `hud`(남은 10초·몹 120·목숨 5 경고). 로더 스키마·교차 검사 추가: 곡선 표 최신 여부, 구성 칸 합계 = 단계당 칸 수, 등장 순서 칸 범위, 무한 맵 존재·모드, **경로가 지나는 칸 = P 칸**(M6 생성 맵도 통과해야 함).
  - **sim** (`src/sim/`, Phaser·DOM 없음):
    - `map.ts`: 칸 (x, y) 중심 = (x·1000+500, y·1000+500), 웨이포인트 → 직각 구간, `positionAt(진행도)`(loop는 나머지), `directionAt`, 배치 칸 목록 (y, x 순), `tileAt/isBuildable/pathTiles`.
    - `rules.ts`: JSON 소수 → 정수 규칙(배율 bp, 속도 단위/초, 초 → 틱), `stageHp`·`stageArmor`·`killReward`·`spawnStats`(체력 배율 × 테마 배율, 방어·마저 성장 + 테마 추가, 보상 배율), 테마 보정. 한 단계 등장이 단계 안에 끝나지 않는 설정은 거절.
    - `entities/Mob.ts`(몹 엔티티: 체력·방어·마저·속도·목숨 피해·보상·진행도·이동 나머지·떼 순번·투명·군단), `state.ts`(MatchState·MatchContext), `match.ts`(`createMatch`: 무한 = 순환의 정원·한도 150 / 캠페인 테마 t = 테마 맵·목숨 20·마지막 50단계).
    - 시스템 (틱마다 이 순서): `Stage` → `Spawn` → `Movement` → `Defeat`.
      - `Stage`: 0단계 60초 준비, 60초마다 다음 단계, `stageStart {stage, boss}` 사건, 10의 배수 = 보스 단계 표시.
      - `Spawn`: 구성표 20칸을 **세계 난수**로 섞고 치유사 가운데·투명 뒤쪽 배치, 2.5초(50틱) 간격, 첫 칸은 단계 시작 틱에. 고블린 떼 1칸 = 같은 틱 3마리. 보스 단계에는 일반 몹 없음.
      - `Movement`: 정수 진행도 + 나머지 누적(속도/20이 정수가 아니어도 1초에 정확히 속도만큼). loop 맵은 진행도가 계속 늘어남(1.5칸/초 = 28칸 **374틱**). 스테이지 맵은 진행도 ≥ 길이면 출구 도달 → 몹 제거, 목숨 −lifeDamage, `leak` 사건.
      - `Defeat`: 무한 = 몹 수 > 한도(150 생존, 151 패배), 캠페인 = 목숨 ≤ 0. 패배하면 `phase = 'defeat'`, 이후 모든 시스템 정지.
    - `World`: 해시되는 판 상태 슬롯 `state`, 명령 처리기 등록 `setCommandHandler`. 명령 `debugSkipStage`(개발용 단계 건너뛰기, debug 판에서만 듣고 `debugUsed` 표시).
  - **화면**: `view/layout.ts`(맵을 HUD 330px와 아래 메뉴 자리 330px 사이에 꽉 차게, 화면 밖 등장·퇴장 칸 포함. 순환의 정원 1칸 109px, 사거리 미로 80px = 화면 폭/13.5), `render/MapRenderer.ts`(테마 1 풀밭: 잔디 단상 + 흙길 + 진행 방향 화살표, 녹스 균열 소용돌이, 캠페인 출구 왕국 성문 — 한 번 구워 텍스처), `render/MobSprite.ts`(몹 13종 임시 도형 텍스처 `art/mobs.ts` — 보라 눈 + 이마 군단 색 문양, 걷기 통통·눌림 / 박쥐 날갯짓 / 유령 둥실, 진행도 보간, 고블린 떼는 진행 방향 옆으로 벌림, 투명 몹 일렁이는 반투명, 깊이 = y).
  - **DOM UI**: HUD 1차(`ui/hud/Hud.ts` + 순수 계산 `hudModel.ts`): 1줄 단계(보스 👑 빨간 배지)·⏱ 남은 시간·👾 몹 수/150 또는 ❤ 목숨·[⏭ debug]·⏸, 2줄 💰 돈·배속, 보스 배너. 경고 색(10초 노랑, 몹 120·목숨 5 빨강 깜빡). 단계 시작 알림(`UiRoot.toast`, 한 프레임에 여러 단계면 마지막 하나만). 임시 패배 화면(`GameOverScreen`: [다시 하기] [타이틀로]). 타이틀 [시작] → 무한 모드, `?debug=1`이면 [캠페인 1 (디버그)] → 사거리 미로.
- 주요 결정:
  - **체력 표 = 문서 공식의 실수값을 마지막에 반올림** (구간 기준값은 반올림하지 않고 이어 감): BALANCE.md 3장 '일반 몹 체력' 열 19개와 정확히 같다(5단계 210.6 → 211). '단계 총 체력' 열은 실수 × 20이라 정수 × 20과 최대 10 차이.
  - **방어·마저 = 기본값 × (1 + 0.02s) 를 곱한 뒤 내림** + max(0, s−100) (CLAUDE.md 정수 규칙). ENEMIES.md 3.1 표는 표시용 반올림이라 .5인 칸만 1 다르다(박쥐 15단계 마저 19.5 → sim 19, 표 20). 정수 칸(골렘 78/96/120/180/290/400 등)은 모두 같다.
  - 표 끝(500단계)을 넘으면 500단계 값을 쓴다. 성장 수치의 원본은 `enemies.json` growth (문자열 `formulas`는 설명용으로 남김).
  - 몹은 **나온 틱에 첫 걸음**을 뗀다 → 사거리 미로 78칸을 슬라임은 1040걸음, 나온 틱 + 1039에 출구 도달. 무한 모드 타워 없이: 8단계 11번째 칸(틱 10100)에 151마리 → 패배. 캠페인 1 타워 없이: 틱 3189에 목숨 0.
  - 등장 순서: ① 투명 몹을 뒤쪽 범위 안 무작위 자리 ② 치유사를 가운데 범위 안 무작위 자리 ③ 나머지를 섞어 빈자리에. 범위보다 많으면 가까운 칸으로 넓힌다(투명 = 앞쪽으로, 치유사 = 앞뒤 번갈아) → 그림자 습격 편대(투명 12칸)는 9~20번째. 세계 난수 흐름(`world`)만 쓴다.
  - 고블린 떼 3마리는 같은 진행도(sim). 겹쳐 보이지 않게 화면만 떼 안 순번으로 옆으로 벌린다.
  - 보스 단계: 표시만(👑·배너·알림). 일반 몹은 나오지 않음(GDD 2.2). 보스 등장·60초 제한 패배는 M4.
  - 캠페인은 50단계 다음으로 넘어가지 않는다(테마 클리어는 M4·M6). 테마 2~10 맵 파일이 없으면 `createMatch`가 "맵 파일이 아직 없다: spiral" 에러.
  - 판 상태(MatchState)는 `World.state`에 넣어 해시 → 단계·목숨·돈·등장 대기열까지 디싱크 검사 대상. 규칙(MatchRules)·맵은 데이터에서 만든 고정 값이라 해시에서 뺌.
  - 개발용 치트는 **명령**으로(리플레이·멀티에 그대로 기록). 판을 `debug: true`로 만든 경우에만 듣는다 → 일반 판·멀티에서 보내도 무시.
  - HUD의 M0 틱·게임 시간 표시는 없앴다. 틱은 HUD 루트 `data-tick` 속성(화면에 안 보임)으로 E2E가 읽는다. 값 계산은 `hudModel.ts` 순수 함수(Vitest로 "HUD 값 = sim 값" 확인), DOM은 바뀐 글자만 씀.
  - 화면 쪽 순수 계산(`layout.ts`, `hudModel.ts`)은 Phaser를 import하지 않아 node에서 테스트한다 (`pathCells`도 여기로).
  - E2E 빨리 감기: Game 장면 `debugFastForward(n)`(`window.__rtd`, 개발 서버·`?debug=1`에서만) — 배속을 크게 올린 것과 같아 결정성에 영향 없음. 헤드리스 Chromium은 약 20fps라 실제 시간으로 기다리지 않는다.
  - `docs/screens/M0.png`는 M0 기록으로 남기고, 스모크 테스트는 더 이상 문서 스크린샷을 쓰지 않는다. `docs/screens/M1.png` = 무한 모드 3단계(슬라임 52마리가 고리를 도는 화면).
- 테스트: Vitest **302개** (M0 184 → +118: curves 18, map 12, Movement 11, Spawn 19, Stage 11, Defeat 9, rules 8, hud·layout 12, load +8, 헤드리스 판 통합 10). E2E **11개** (M0 5개 갱신 + M1 6개: 시작 상태, HUD 값 = sim 값·화면 몹 수 = sim 몹 수, M1 스크린샷, 151마리 패배 → 다시 하기 → 타이틀, 캠페인 1 목숨 감소·패배, ⏭로 10단계 보스 표시). 프로덕션 빌드(`vite preview`)에서도 시작·HUD·캠페인 버튼을 확인했다.
  - 번들: `dist/assets/index-*.js` 1,343 kB (gzip 368 kB). curves.json 약 12 kB 포함.
- 남은 문제 / 다음 작업자에게:
  - **군주 체력 안전 정수 한도**: HP(500) ≈ 9.6×10¹³ 이라 보스 ×60까지는 안전하지만, 무한 500단계 암흑의 군주(×150)는 2^53을 넘는다. M4에서 보스 체력에 상한을 두거나 배율 적용 방식을 정할 것 (`mulBp`가 안전 정수 검사로 에러를 낸다).
  - 테마 `specialOffset`(특수 몹 등장 앞당김)은 아직 적용하지 않았다 (테마 1은 0). M6에서 구성표 단계 이동 + 최소 단계(투명·고블린 15, 보석 골렘 20, 편대 25)로.
  - 정예 몹(51단계 1.5%)은 M6-2, 편대 단계는 M4, 분열(분열 슬라임·보석 골렘)·치유·회피 능력은 M4, 상점 몹 한도 +30은 M8, 보스 출구 도달 즉시 패배·60초 제한은 M4.
  - ENEMIES.md 4장 표(10단계 = 킹 슬라임)와 4.1 무한 보스 순환(10단계 = 박쥐 여왕), 캠페인 테마 1 배치표(10 = 박쥐 여왕)가 서로 다르다. M4에서 보스를 붙일 때 어느 쪽을 따를지 정할 것 (지금 HUD 배너는 캠페인 배치표 이름만 보여준다).
  - 맵 배치 상수 `HUD_TOP_PX`·`BOTTOM_UI_PX`(330px씩)는 M2에서 아래 버튼·하단 메뉴를 붙일 때 실제 DOM 높이에 맞춰 조정. 보스 배너는 맵 윗줄에 살짝 걸치지만 `pointer-events: none`이라 칸 터치를 막지 않는다.
  - 탭 → 칸 변환은 `layout.ts` `pxToTile`이 준비되어 있다 (M2-7 소환 입력용).
  - 몹 그림은 임시 도형(M11에서 교체). 몹 체력 바·피해 숫자는 M2.
  - DEV_PLAN은 HUD를 `src/view/ui/Hud.ts`로 적었지만 M0 결정대로 DOM UI는 `src/ui/hud/`에 있다.
  - CI(GitHub Actions)는 push 금지라 원격 초록불은 여전히 확인하지 못했다 (로컬에서 같은 단계 통과).
