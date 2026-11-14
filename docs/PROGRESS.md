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
  - **결정성 검사** `tools/check-determinism.mjs`: CLAUDE.md 2장 목록(`Math.random`·`Date`·`performance`·`Math.pow/exp/sin/cos/log`·`**`) + 같은 이유의 삼각·쌍곡·`sqrt/cbrt/hypot`·`Math[...]`·DOM 전역·타이머·fetch·crypto 난수·`phaser`/`src/view|ui|…` import. 주석·문자열은 무시하고 템플릿 `${}` 안은 검사. 폴더 인자로 다른 폴더 검사 가능(테스트용).
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
- 테스트: Vitest **135개**(단위 9파일 + 통합 1파일) — Rng 재현성(시드 42 첫 5개 스냅샷·원본 구현 비교)·흐름 독립·분포, Fixed 경계(내림·음수·2^53 근처·isqrt 전수), 명령 정렬·거절, 해시 안정성·키 순서 무관·소수 거부, World 틱·시스템 순서·해시, TickClock ×1/×2/×3·30fps·한도, 데이터 로더 에러 경로 12종, 결정성 검사 탐지 30종 + CLI 실패 확인, 배속·HUD·URL 규칙, 헤드리스 2인 1200틱 해시 흐름 재현. E2E **3개**(412×915): 타이틀·캔버스/오버레이 정렬, 시작→틱 진행→배속→복귀, debug ×3·×2 속도 확인. 프로덕션 빌드(`vite preview`)에도 같은 E2E 통과 확인.
  - 번들: `dist/assets/index-*.js` 1,293 kB (gzip 349 kB, 대부분 Phaser), CSS 4.5 kB. 목표 5MB 이하.
  - 스크린샷: `docs/screens/M0.png` (타이틀 화면).
- 남은 문제 / 다음 작업자에게:
  - CI는 로컬에서 같은 단계(npm ci 제외)를 돌려 확인했고, push 금지라 GitHub에서 초록불은 아직 확인 못 함.
  - 데이터 수치는 아직 JSON 원본(소수) 그대로다. M1부터 시스템이 로드할 때 `Fixed.bp()/tiles()`로 정수 단위로 바꿔 sim 상태에 넣을 것(hash가 소수를 거부한다).
  - `src/data/load.ts`는 맵 수집에 `import.meta.glob`(Vite 기능)을 쓴다 → Vitest·브라우저에서는 되지만, M11 `npm run sim`을 순수 node로 돌리려면 vite-node/tsx를 쓰거나 맵 목록을 정적 import로 바꿔야 한다.
  - 캠페인 테마 2~10의 `mapId`(spiral 등) 맵 파일은 M6에서 만든다. 그때 `crossCheck`에 "테마 mapId → 맵 존재" 검사를 추가할 것.
  - `CommandQueue`는 **대기 중** (플레이어, seq) 중복만 거절한다. 이미 실행된 seq가 미래 틱으로 다시 오면 받아들이므로, M13 락스텝에서 플레이어별 마지막 seq 기준 거절을 추가할 것.
  - 결정성 검사 토크나이저는 정규식 리터럴을 따로 인식하지 않는다(`/'/` 같은 정규식이 있으면 뒤쪽을 문자열로 오인할 수 있음). sim에서 정규식은 되도록 쓰지 말 것.
  - 헤드리스 Chromium(소프트웨어 WebGL)에서 게임 장면은 약 20fps라 E2E의 틱 속도 검사는 느슨하게 잡았다(×1 > 12틱/초, ×2 > ×1의 1.5배).
  - 타이틀 SD 캐릭터·배경은 임시 절차 그림이다. M11에서 파츠 SVG + animations.json으로 교체.
