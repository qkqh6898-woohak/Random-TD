# 운빨 디펜스 (Random-TD)

암흑의 군주가 이끄는 외계 녹스 군단에 맞서는 아트라 7종족 연합군의 랜덤 소환 + 3개 합성 타워 디펜스 모바일 게임. 개인용, 오프라인 플레이, 인터넷은 업데이트에만 사용.

## 실행 방법

필요한 것: **Node.js 22.12 이상**, npm, Python 3 (데이터 검사용). E2E 테스트는 Playwright용 Chromium이 필요하다.

```bash
npm ci              # 의존성 설치 (처음 한 번)
npm start           # 게임 실행 (= npm run dev) → 브라우저에서 http://localhost:5173 열기
```

- 휴대폰으로 보기: 같은 Wi-Fi에서 `npm run dev -- --host` 후 휴대폰 브라우저로 `http://<PC IP>:5173`
- 지금 할 수 있는 것 (M5): 타이틀 [시작] → 무한 모드 '순환의 정원'. 시작 자금 1,000원으로 **빈 칸을 눌러 소환**(100원, 기본 덱 노말 5종 중 무작위)하면 타워가 사거리 안 몹을 자동으로 공격하고(광역·관통·연쇄·다중 등 공격 형태, 관통·치명타 피해 공식), 처치하면 돈을 받아 더 소환한다. **타워를 누르면 정보 패널**(스탯·보유 n/3)이 열리고, 같은 타워 3개가 모이면 **[⬆ 승급]·[⬆⬆ 모두 승급]**으로 덱의 다음 등급 타워를 만든다. **타워를 0.3초 길게 눌러 끌면** 이동·교환. **기본 덱 25종의 특색이 모두 동작**한다(진흙·빙결·화상·시간 정지·오라·돈·병사·운석·즉사·행운의 여신). M4부터: 아래 띠 **[👷 300원]으로 일꾼 고용**(최대 10명, 5초마다 1명당 +5원), **몹 13종 특성**(유령 회피·분열 슬라임/보석 골렘 깨짐·치유사 회복·방패병 보호막·그림자 늑대 가속·고블린 떼·51단계부터 정예), **10단계마다 보스**(박쥐 여왕→킹 슬라임→고대 골렘→망령 군주(투명)→혼돈의 용 순환, 보스 막대에 체력·남은 60초 — 못 잡으면 패배), 보스를 잡으면 **카드 3장 중 1장**(12장, 희귀 15%), 45단계부터 5의 배수 단계에 **조합 편대**(10초 전 예고 배너), **투명 몹은 감지 타워(정찰병·저격수·그림자 암살자 …) 없이는 맞지 않는다**(드러나면 보라 외곽선). 맵 위 몹이 150마리를 넘으면 패배. M5부터: 화면 맨 아래 **하단 메뉴 [⚔ 도전] [⬆ 강화] [📋 미션]** → 바텀 시트(55%, 손잡이를 끌면 85%, 게임은 계속 흐르고 맵을 누르면 닫힘). **도전 10단계**(30초 안에 세미 보스를 잡으면 돈, 처음 잡으면 다음 단계 열림, 단계마다 5분 쿨타임, 실패해도 벌칙 없음), **판 내 강화**(등급 강화 3종·능력치 강화 6종·초월, 버튼을 길게 누르면 연속, 맨 위 ⚡ 공속 배율), **도박 4테이블**(10·100원, 1000원은 계정 Lv7·10000원은 Lv20 — 개발자 모드면 모두, 슬롯 1초, 잭팟 게이지 10칸), **판 안 미션 41개**(일반 30 + 히든 11 '???', [받기]·[모두 받기], 히든은 한 번 찾으면 영구 기록), 메뉴 배지('1 가능'·'Lv 5'·'2 받기'), [⬆ 승급 가능 n]을 누르면 그 타워들이 금색 고리로 강조된다. `?dev=1`(개발자 모드)의 [💰+]·[⏭]·×16 배속으로 빠르게 확인할 수 있다
- URL 옵션: `?seed=123` (같은 판 재현), `?dev=1` 또는 `?debug=1` (**개발자 모드**: HUD **[⏭] 다음 단계로 즉시 이동**(누를 때마다 바로 다음 단계, 길게 누르면 초당 4번, 보스 단계면 보스를 보상 없이 지움), **배속 ×1·×2·×3·×4·×8·×16**, HUD [💰+] 돈 추가, 잠긴 도박 테이블, 타이틀의 [캠페인 1] = 사거리 미로, 개발자 콘솔 `window.__rtd`에서 `debugTower`(특정 타워 놓기)·`debugCard`(카드 효과 바로 적용) 명령). 판단은 `src/devMode.ts` 한 곳, 자세한 규칙은 [UI.md 4.7](docs/UI.md)
- **한 파일 테스트판**: `npm run build:single` → `release/운빨디펜스-test.html` 하나 (CSS·JS·그림이 모두 안에 — 서버 없이 더블클릭/파일로 열면 된다. 휴대폰에 보내 열어도 됨). 테스트 빌드라 주소 옵션 없이도 개발자 모드다

| 명령 | 하는 일 |
|------|--------|
| `npm start` / `npm run dev` | 개발 서버 (바로 플레이) |
| `npm test` | Vitest 단위·통합 테스트 |
| `npm run check` | 타입 검사 + 결정성 검사(`tools/check-determinism.mjs`) + 곡선 표 최신 여부(`tools/precompute-curves.mjs --check`) + 데이터 검사(`tools/gen_tables.py --check`) |
| `npm run curves` | `enemies.json` growth로 몹 성장 곡선 표 `src/data/curves.json` 다시 만들기 (수치를 바꾼 뒤) |
| `npm run build` | 프로덕션 빌드 → `dist/` |
| `npm run build:single` | 한 파일 테스트판(개발자 빌드, `VITE_TEST_BUILD=1`) → `dist-single/` 빌드 후 `release/운빨디펜스-test.html` 하나로 묶기 (CSS·JS 안에, `assets/**` 그림·JSON은 `window.__RTD_ASSETS__`로) — 크기를 출력 |
| `npm run preview` | 빌드 결과 미리보기 (http://localhost:4173) |
| `npm run e2e` | Playwright 스모크 테스트 (휴대폰 뷰포트 412×915), 스크린샷은 `test-results/screens/` |
| `npm run screens` | E2E + 문서용 스크린샷 갱신 (`docs/screens/M{n}.png`) |
| `npm run replays` | 리플레이 `tests/replays/*.json` 다시 만들기 (규칙·수치를 일부러 바꿨을 때만, M3-12) |
| `npm run sim` | 헤드리스 밸런스 시뮬레이터 (M11에서 구현, 지금은 자리만) |

완료 조건 (커밋 전): `npm test && npm run check && npm run build && npm run e2e`

- Playwright 브라우저: 미리 설치된 Chromium을 쓴다. 다른 경로의 Chromium을 쓰려면 `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run e2e`. 포트는 `E2E_PORT`(기본 5173).
- 개발 규칙은 [CLAUDE.md](CLAUDE.md), 진행 기록은 [docs/PROGRESS.md](docs/PROGRESS.md).

## 안드로이드 APK (v0.1.8~)

앱 ID `com.woohak.randomtd`, 서명 키는 v0.1.7과 같다 → 기존 v0.1.7 앱 위에 **업데이트**로 설치된다 (안드로이드 10 이상, 오프라인).
**버전은 자동이다 (U-1)**: `main`에 푸시할 때마다 워크플로가 `tools/release-version.mjs`로 다음 버전을 골라 새 APK를 낸다 —
`package.json` `version`이 이미 나온 `android-v*` 태그보다 크면 그대로, 아니면 가장 높은 태그의 다음 patch(0.1.9 → 0.1.10 → 0.1.11 …).
`versionCode` = major × 1,000,000 + minor × 1,000 + patch (0.1.10 → 1010). 고른 버전은 CI 작업 폴더의 `package.json`·`package-lock.json`·`AndroidManifest.xml`에만 쓰고 커밋하지 않는다(앱 안 버전 표시 `v…`도 그 값).
그래서 평소에는 버전을 손대지 않는다. **minor/major를 올릴 때만**(예: 0.2.0) `package.json` `version`과 `AndroidManifest`의 `versionName`을 같이 올린다(둘이 같아야 `npm test`·빌드 스크립트가 통과). patch가 999에 닿으면 워크플로가 멈추니 그때도 minor를 올린다.
문서만 바꾼 푸시(`docs/**`, `*.md`)는 새 APK를 만들지 않는다.

**앱 안 업데이트 (U-1)**: 안드로이드 앱은 켤 때(타이틀) GitHub의 최신 Release를 확인해 새 버전이면 '새 버전 vX가 나왔어요' 창을 띄운다 → [지금 업데이트]를 누르면 앱 안에서 APK를 받아
SHA-256을 확인하고 안드로이드 설치 확인 창을 연다(같은 앱 ID·같은 서명 → 업데이트, 저장한 판·기록 그대로). [나중에]는 다음에 켤 때까지 묻지 않는다. 처음 한 번은 '출처를 알 수 없는 앱 설치'를 허용해야 한다.
네트워크는 자바(`android/src/…/Updater.java`)만 쓰고 WebView는 여전히 APK 안 파일만 연다. 브라우저·PWA에서는 아무것도 하지 않는다. v0.1.9 이하에는 이 기능이 없어 v0.1.10은 한 번 직접 설치해야 한다.

### GitHub에서 빌드·서명·게시

`.github/workflows/android.yml` (**Android APK**)이 `main`·`feat/android`에 푸시할 때와 수동 실행(workflow_dispatch) 때 돈다. 작업은 셋 (A-1b: 서명을 외부 코드에서 떼어 냄):

1. **build** — 릴리스 버전 정하기(전체 기록·태그를 받아 `tools/release-version.mjs --write`) → 릴리스 노트 → `npm ci` → `npm test` → `npm run check` → `npm run build` (E2E는 안 돌림) → `android/check-java.sh` → `android/setup-sdk.sh`(공개 SDK·컴파일러를 SHA-256 확인 후 받음) → `android/build-apk.sh` → **서명 전 APK** (artifact `android-unsigned-v<버전>`). `dist/` 파일이 APK `assets/`에 모두 들어갔는지 확인한다. **서명 비밀값을 전혀 참조하지 않는다** (npm 패키지 코드가 비밀값과 같은 작업에서 돌지 않게).
2. **sign** — **`main`에서만** (서명 배포는 main만, `feat/android`는 서명 전 APK만). 서명 전 APK artifact만 내려받아 `apksigner`로 서명(PKCS12, v2+v3)하고, 서명 인증서 SHA-256이 v0.1.7 키(`0422434c…7cd02a`)와 다르면 실패한다. npm은 돌리지 않는다. 키 저장소는 `$RUNNER_TEMP`에만 풀고 끝나면(`always()`) 지운다. 비밀값이 없으면 알림만 남기고 초록으로 끝난다.
3. **publish** — `main`에서 서명됐으면 Release `android-v<버전>`을 만들고 APK + `SHA256SUMS`를 올린다. 릴리스 노트 = 설치 안내 한 줄 + 이전 `android-v` 태그 이후 커밋 제목(최대 30줄, build가 만듦). 같은 태그가 이미 있으면 건너뛴다.

액션은 커밋 SHA로 고정했다 (주석 = 태그).

비밀값: 저장소 Settings → Environments → **`android-release`** 만들기 → Deployment branches and tags를 **`main`만** 허용 → 그 Environment의 **Environment secrets**에 아래 넷 (저장소 수준 Repository secrets에 넣지 않는다 — 다른 브랜치·작업이 읽지 못하게). 키 저장소는 **PKCS12**(`randomtd.p12`)이고, PKCS12는 `ANDROID_KEY_PASSWORD`가 보통 `ANDROID_KEYSTORE_PASSWORD`와 같다.

| 이름 | 값 |
|------|----|
| `ANDROID_KEYSTORE_BASE64` | v0.1.7을 서명한 키 저장소 파일(**PKCS12**, `randomtd.p12`)을 base64로 (`base64 -w0 randomtd.p12`) |
| `ANDROID_KEYSTORE_PASSWORD` | 키 저장소 비밀번호 |
| `ANDROID_KEY_ALIAS` | 키 별칭 (v0.1.7 키는 `randomtd` — 비워 두면 `randomtd`를 쓴다) |
| `ANDROID_KEY_PASSWORD` | 키 비밀번호 (PKCS12는 보통 `ANDROID_KEYSTORE_PASSWORD`와 같다) |

### 직접 빌드 (Linux, JDK 21 + Node.js 22)

```bash
npm ci && npm run build
bash android/setup-sdk.sh /tmp/randomtd-sdk
bash android/build-apk.sh /tmp/randomtd-sdk android-build/Random-TD-unsigned.apk   # 서명 전
```

APK·키 저장소는 저장소에 넣지 않는다 (`.gitignore`: `android-build/`·`android-release/`·`downloads/`·`*.apk`·`*.keystore`·`*.jks`·`*.p12`).

## 문서

| 문서 | 내용 |
|------|------|
| [docs/STORY.md](docs/STORY.md) | 세계관: 아트라 7종족 연합군 vs 외계 녹스 군단, 조언자, 챕터 줄거리, 대사 |
| [docs/CAMPAIGN.md](docs/CAMPAIGN.md) | 캠페인 테마 10개 × 50단계, 발판·발판 보상, 월드맵, 배경 변화 |
| [docs/GDD.md](docs/GDD.md) | 게임 기획서 본문: 개요, 모드, 경제, 소환·승급·덱, 전투 규칙, 도전·강화·도박·미션, 저장, 개발 단계 |
| [docs/TOWERS.md](docs/TOWERS.md) | 타워 65종 도감 (스탯·특색·각성·대기 동작·히든 조합식·추천 덱) |
| [docs/MAPS.md](docs/MAPS.md) | 맵 상세: 사거리 미로(스테이지), 순환의 정원(무한), 명당 분석 |
| [docs/ENEMIES.md](docs/ENEMIES.md) | 몹 8종, 보스 5종, 도전 보스 10종 |
| [docs/PROGRESSION.md](docs/PROGRESSION.md) | 장기 성장: 계정·특성·상점·타워 해금/레벨/각성·도감·도박 숙련도·업적·출석·일일 미션 |
| [docs/UI.md](docs/UI.md) | 화면·조작·튜토리얼·설정·예외 처리 |
| [docs/ART.md](docs/ART.md) | 2D 아트·애니메이션·사운드 |
| [docs/BALANCE.md](docs/BALANCE.md) | 공식·체력 곡선·예상 전력 모델·경제 점검 |
| [docs/MULTIPLAYER.md](docs/MULTIPLAYER.md) | 멀티 모드: 안드로이드 + 아이폰(웹앱) 2인 협동·대결, 동기화 설계 |
| [docs/DEV_PLAN.md](docs/DEV_PLAN.md) | 개발 계획서: 마일스톤 M0~M13 작업·파일·완료 조건·테스트, 세션 순서 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 기술 스택, 폴더 구조, 자동 업데이트 설계 |

## 데이터와 도구

| 파일 | 내용 |
|------|------|
| `src/data/towers.json` | 타워 65종 스탯 (종족, 원소, 물리·마법 공격력, 공속, 사거리, 공격 범위, 관통, 치명타, 감지, 특색) + 종족 시너지·앙숙·원소 정의 |
| `src/data/enemies.json` | 몹 13종(보석 골렘·고블린 떼 포함)·보스 5종·도전 보스 10종·조합 편대 6종, 등장 구성 |
| `src/data/campaign.json` | 캠페인 테마 10개: 맵, 배경, 특수 규칙, 최종 보스, 난이도, 발판 보상·지원금 |
| `src/data/maps/*.json` | 사거리 미로(96칸), 순환의 정원(71칸) |
| `src/data/decks.json` | 덱 규칙(등급별 5종)과 기본 덱(처음 해금된 25종) |
| `src/data/game.json` | 판 공통 설정: 배속 목록(×1/×2/×3 Lv12)·개발자 배속(devSpeeds ×1·×2·×4·×8·×16), 판매(sell: 50%·등급 가치), 개발자 확률 조정 목록(devChances), 프레임 따라잡기 한도(배속 곱하기 전 실제 시간), 한 판 흐름(시작 자금·준비/단계 시간·등장 간격·보스 주기·무한 맵), 소환, 전투 규칙(투사체·공속 한도·관통 최대·연쇄·이동 정지), 승급 개수, HUD 경고 기준, 상태 이상(둔화 최대·보스 규칙·면역·빙결 약화·지속 피해 간격), 오라 범위, 타워 레벨 |
| `src/data/curves.json` | 단계 0~500 기준 체력·방어 성장 계수 표 (자동 생성, 직접 고치지 않음) |
| `src/data/load.ts` | 데이터 로더 + 스키마 검사 (오류에 파일·필드 경로) |
| `tools/gen_tables.py` | 데이터 규칙 검사 + 문서 표 자동 생성 (`python3 tools/gen_tables.py`) |
| `tools/check-determinism.mjs` | `src/sim/` 금지 API 검사 (`Math.random`·`Date`·`Math.pow`·`**` …) |
| `tools/precompute-curves.mjs` | 몹 체력 곡선(거듭제곱)을 미리 계산해 정수 표로 저장 (sim은 거듭제곱 금지) |

## 현재 상태

- [x] 기획 확정 (v0.7: 암흑의 군주·4천왕·대장 체계, 착한 고블린·골렘 / v0.6: 세계관, 종족 시너지, 원소, 특수 몹·편대, 캠페인)
- [x] 데이터: 타워 65종 · 적 · 캠페인 · 맵 2개 JSON + 검사 도구
- [x] M0 프로젝트 뼈대 (결정적 시뮬레이션 코어, 테스트, CI)
- [x] M1 순환의 정원 + 몹 이동 + 단계 타이머 + 패배 판정 + HUD 1차
- [x] M2 소환 + 자동 공격 + 돈 + 대기 동작
- [x] M3 승급 + 덱 + 물리·마법·관통 피해 + 상태 이상 + 기본 25종 특색 + 리플레이
  - [x] M3a 승급·모두 승급 · 덱 모델 · 피해 공식 전체 · 공격 형태 · 이동/교환 · 타워 정보 패널
  - [x] M3b 상태 이상·원소 · 오라 · 특색 25종 · 리플레이
- [x] M4 일꾼 + 몹 13종 + 조합 편대 + 보스 5종 + 카드 + 투명·감지
- [x] M5 도전 · 강화(등급·능력치·초월) · 도박 · 미션
- [x] T-1 개발자 모드(`?dev=1`) · ⏭ 즉시 다음 단계 · ×16 배속 · 한 파일 테스트 빌드
- [x] T-2 시험판 피드백 (play 갈래)
  - 승급할 수 있는 타워를 누르면 바로 승급 (일시정지 메뉴 '눌러서 바로 승급'으로 끔)
  - 빈 곳·[🎲 소환 100원]을 꾹 누르면 자동 연속 소환 (경로가 가장 많이 보이는 빈 칸부터)
  - 도박: 10원·100원(…) 테이블 동시에, 꾹 누르면 계속
  - 타워 패널: [↔ 이동] · [💰 판매 +n원] (가치의 50%, 히어로 이상은 두 번 눌러 확인)
  - 개발자: [🛠 변환](같은 등급 다른 타워) · 🛠 개발자 도구 (연출 끄기 · 확률 0.1%p 조정 · 히든 조합 12종 · 히든 미션 보기) · 배속 ×1·×2·×4·×8·×16
- [ ] M6 캠페인(월드맵·발판·배경·테마 맵 10개), 무한 난이도, 신 · 히든 타워, 이어하기
- [ ] M7 덱 편성 + 추가 타워 25종 + 해금 + 종족 시너지·앙숙
- [ ] M8 계정 레벨 · 해금 · 특성 · 상점
- [ ] M9 타워 조각 · 레벨 · 각성 · 도감 보너스
- [ ] M10 출석 · 일일/주간 미션 · 업적 · 도박 숙련도
- [ ] M11 2D 캐릭터 아트 · 애니메이션 · 사운드 · 튜토리얼 · 밸런스 시뮬레이터
- [ ] M12 Android 빌드 + 자동 업데이트 + 아이폰 웹앱
- [ ] M13 멀티 (협동·대결)
