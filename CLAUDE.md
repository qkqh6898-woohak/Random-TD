# Random-TD (운빨 디펜스) — 개발 규칙

이 저장소에서 일하는 모든 에이전트가 지키는 규칙. **작업을 시작하기 전에 이 파일과 `docs/PROGRESS.md`를 읽는다.**

## 0. 위치와 셸

- 저장소 절대 경로: `/home/user/random-td`. 셸은 명령마다 작업 폴더가 초기화될 수 있으니 **모든 명령을 `cd /home/user/random-td && ...`로 시작**한다.
- 기획 문서: `docs/` (GDD, TOWERS, ENEMIES, MAPS, CAMPAIGN, STORY, PROGRESSION, UI, ART, BALANCE, MULTIPLAYER, DEV_PLAN, ARCHITECTURE). 수치·규칙의 정답은 **`src/data/*.json` + 문서**다. 코드에 수치를 박지 말고 JSON에서 읽는다.
- 진행 기록: `docs/PROGRESS.md` — 마일스톤을 끝낼 때마다 "무엇을 만들었고, 어떤 결정을 했고, 남은 문제는 무엇인지"를 추가한다. 다음 에이전트는 여기서 맥락을 얻는다.
- **git**: 로컬 커밋만 한다. `git push` 금지 (마지막에 사람이 직접 올린다). 커밋 메시지 형식: `M3-4 피해 공식 전체` (한국어). 커밋 메시지 끝에 아래 두 줄:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01TtVcSoY665DmsK6h3dcafN
  ```

## 1. 기술 스택 (확정)

| 영역 | 선택 |
|------|------|
| 언어 | TypeScript (strict) |
| 빌드 | Vite |
| 전투 화면 | Phaser 3 (`phaser@3.90.0` 고정. Phaser 4 쓰지 말 것) |
| UI (HUD·바텀 시트·메뉴·팝업) | **DOM 오버레이** (HTML/CSS + 가벼운 TS 컴포넌트, `src/ui/`). 한글 글자가 선명하고 만들기 쉬움. 프레임워크 없이 |
| 테스트 | Vitest (단위·통합), `@playwright/test@1.63.0` (E2E, 미리 설치된 Chromium 사용 — 설치 명령 `playwright install` 금지. 버전이 안 맞으면 `executablePath: '/opt/pw-browsers/chromium'`) |
| 그래픽 에셋 | **런타임 절차 생성** (Canvas/SVG 코드로 그림). 외부 이미지 다운로드 없음 → 완전 오프라인 |
| 사운드 | **WebAudio 절차 합성** (파일 없음) |
| 저장 | `Storage` 인터페이스 뒤에 localStorage 구현 (나중에 Capacitor Preferences로 교체 가능) |
| 앱 포장 | Capacitor 설정 + PWA (manifest + 서비스 워커). APK 빌드는 안드로이드 SDK 다운로드 주소가 막혀 있어 보류 |

- 화면: 세로 9:16, 기준 해상도 1080×1920 (Phaser `Scale.FIT`, 가운데 정렬). 휴대폰 테스트 뷰포트 412×915.
- 글꼴: 시스템 한글 글꼴 (`-apple-system, "Noto Sans KR", "Malgun Gothic", sans-serif`). 웹 글꼴 다운로드 없음.

## 2. 황금 규칙 (어기면 리뷰에서 반려)

1. **sim과 view 분리**: `src/sim/`은 Phaser·DOM·window를 import하지 않는다. view/ui는 sim 상태를 **읽기만** 하고, 바꾸고 싶으면 `Command`를 만들어 `sim.enqueue()`한다.
2. **결정성** (`docs/MULTIPLAYER.md` 4.2): `src/sim/`에서 `Math.random`, `Date`, `performance.now`, `Math.pow`, `Math.exp`, `Math.sin`, `Math.cos`, `Math.log`, `**` 연산자 금지. 난수는 `Rng`(시드), 시간은 틱 번호. 체력 곡선 등은 `src/data/curves.json`(미리 계산한 표). `tools/check-determinism.mjs`가 검사한다.
3. **정수 연산**: 위치 1칸 = 1000단위. 퍼센트는 bp(1/10000) 정수. 체력·피해·돈은 정수, 곱한 뒤 `Math.floor`. 거리 비교는 제곱 거리. 반복은 항상 ID 순.
4. **고정 틱**: 로직 20틱/초(50ms). 렌더는 보간. 배속은 한 프레임에 여러 틱 실행으로.
5. **데이터 주도**: 타워·몹·보스·맵·캠페인·미션·카드·상점 수치는 JSON. 새 데이터를 만들면 `python3 tools/gen_tables.py --check`가 통과해야 한다.
6. **테스트 먼저**: 규칙 함수에는 Vitest 테스트. 버그를 고치면 그 버그를 잡는 테스트를 추가.
7. **완료 조건 (커밋 전에 전부 통과)**:
   ```
   cd /home/user/random-td && npm test && npm run check && npm run build && npm run e2e
   ```
   `npm run check` = 타입 검사 + 결정성 검사 + `python3 tools/gen_tables.py --check`.
8. 마일스톤을 끝내면 Playwright로 휴대폰 뷰포트 스크린샷을 `docs/screens/M{n}.png`로 저장 (deviceScaleFactor 1).

## 3. 폴더 구조

`docs/DEV_PLAN.md` 1장을 따른다. 요약:

```
src/main.ts            진입점
src/sim/               결정적 게임 로직 (World, Rng, Commands, Fixed, hash, entities/, systems/, abilities/, replay.ts, campaign.ts)
src/view/              Phaser 장면과 그리기 (scenes/, render/)
src/ui/                DOM 오버레이 UI (hud, sheets, panels, toasts, screens)
src/meta/              판 밖 성장 (account, shop, talents, towerGrowth, attendance, missions, achievements)
src/save/              저장·마이그레이션·백업
src/update/            자동 업데이트
src/net/               멀티 (M13)
src/art/               절차 생성 그래픽 (캐릭터 파츠, 몹, 배경)
src/audio/             절차 합성 사운드
src/data/              JSON 데이터 (towers, enemies, campaign, maps/ …)
tools/                 검사·생성 스크립트
tests/                 Vitest (unit/, integration/, replays/)
e2e/                   Playwright
```

## 4. 구현 결정 (기획에서 비어 있던 부분, v0.8 추천안으로 확정)

| 항목 | 결정 |
|------|------|
| UI 언어 | 한국어 고정 |
| 그래픽 | 절차 생성 2D SD 캐릭터: 종족 색·등급 받침대·별·소품 실루엣을 코드로 그림. 파츠(머리·몸·팔·무기·소품) 단위로 트윈 애니메이션 → 대기 동작 상시 반복 |
| 사운드 | WebAudio로 효과음(소환·승급·공격·처치·잭팟 등)과 짧은 루프 배경음 합성 |
| 업데이트 서버 | 공개 업데이트 저장소가 아직 없음 → `UpdateService`는 매니페스트 URL을 설정값으로 받고, 비어 있으면 '업데이트 확인 꺼짐'. 실패해도 게임에 영향 없음 |
| 테마 2~10 맵 | 사거리 미로와 같은 문법(3×3 블록 + 직각 경로)으로 생성해 `src/data/maps/`에 저장. 자동 검사 통과 필수 |
| 스토리 | `src/data/story.json`에 프롤로그·챕터 10개 시작/클리어·4천왕/군주 대사 작성 (`docs/STORY.md` 톤) |
| 멀티 | 로컬 루프백 + WebRTC 데이터 채널 + QR/복사 문자열로 연결 정보 교환. 온라인 방 코드 중계 서버는 인터페이스만 (서버 없음) |
| 밸런스 | 헤드리스 봇 시뮬레이터(`npm run sim`)로 확인. 숫자 조정은 JSON에서 |
| 개발용 치트 | URL `?debug=1`이면 돈 추가·단계 건너뛰기·즉시 승급 버튼 (테스트·확인용, 저장에 표시) |

## 5. Playwright 메모

- 미리 설치된 Chromium 사용. 테스트 실행 시 `--trace off`.
- 개발 서버 포트는 겹치지 않게 (구현 5173, 리뷰 5181~5189).
- 휴대폰 뷰포트 412×915, 스크린샷 deviceScaleFactor 1.
