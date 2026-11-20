# 운빨 디펜스 — 기술 구조와 앱 안 업데이트

> 버전: v0.2 (V2.0 PR-A에서 코드에 맞춰 다시 씀, 2026-11-19) · 처음 작성 2026-11-14
> 목표: **오프라인으로 플레이**하고, 인터넷은 **업데이트 확인·받기와 피드백 보내기(브라우저)** 때만 쓴다.
> 이 문서는 **지금 코드가 하는 일**을 적는다. 처음 계획(Capacitor 번들 라이브 업데이트·`latest.json`·자동 롤백)은 5장 '구현하지 않은 예전 계획'에 요약만 남겼다.

---

## 1. 기술 스택

| 영역 | 선택 | 이유 |
|------|------|------|
| 게임 엔진 | Phaser 3 (`phaser@3.90.0` 고정) | 2D 모바일 게임에 적합. 브라우저에서 바로 테스트 가능 |
| 언어 | TypeScript (strict) | 타워·미션 수가 많아 타입 검사가 버그를 줄여줌 |
| 빌드 | Vite (+ 한 파일 빌드 `npm run build:single`) | 빠른 개발 서버와 작은 결과물 |
| UI | DOM 오버레이 (`src/ui/`, 프레임워크 없음) | 한글이 선명하고 만들기 쉬움 |
| 앱 포장 | **자바 WebView 앱** (`android/` — `GameActivity` + 자바 다리 `RandomTDNative`). Capacitor·PWA는 쓰지 않는다 | 의존성 없이 APK 하나 |
| 게임 로직 | 결정적 고정 틱(20Hz) 시뮬레이션, 정수 연산, 명령 패턴 (`src/sim/`) | 리플레이·밸런스 봇·(나중) 멀티 동기화의 기반 |
| 앱 안 업데이트 | **APK 통째 업데이트** (자바 `UpdateLogic`·`Updater` + PackageInstaller) | 웹 번들만 바꾸는 방식보다 단순하고 서명으로 안전 |
| 배포 | GitHub Actions `android.yml` (`main` 푸시) → 서명 → GitHub Releases (`android-v<버전>`) | 사람 손 없이 매 푸시 릴리스 |
| 테스트 | Vitest (로직·리플레이·봇), Playwright (화면, 로컬에서만) | 확률·경제·화면 흐름 자동 검증 |

---

## 2. 폴더 구조 (지금 코드)

```
Random-TD/
├─ src/
│  ├─ main.ts        진입점: 데이터 검사(loadGameData) → 저장소(rtd.*) → Phaser
│  ├─ sim/           결정적 규칙 (World·Commands·rules·state·match·replay·hash, entities/, systems/, abilities/, bosses/) — Phaser·DOM·window 없음
│  ├─ view/          Phaser 장면(scenes/Boot·Game)·그리기(render/)·입력(input/)·viewport
│  ├─ ui/            DOM 오버레이 (hud, lobby, sheets, panels, screens, guide, gallery, theme)
│  ├─ meta/          판 밖 성장 (progress·progressStore·progressionData, account, settings, matchResult)
│  ├─ save/          저장 (storage = KeyValueStorage + localStorage, MatchSaves, BattleRecords, ScreenShake)
│  ├─ update/        앱 안 업데이트 화면 쪽 (UpdateService = 자바 다리와 대화, updateModel)
│  ├─ feedback/      게임 안 피드백 → 미리 채운 GitHub 이슈 URL
│  ├─ art/  audio/   그림(WebP 연결 + 절차 그림 대체)·WebAudio 합성
│  └─ data/          JSON (towers·enemies·campaign·game·cards·decks·missions·progression·characterLooks·curves·maps/) + load.ts·grades.ts
├─ public/assets/    WebP 그림 (characters·backgrounds·cutins·title·ui)
├─ android/          자바 WebView 앱, UpdateLogic·Updater·InstallReceiver, build-apk.sh·setup-sdk.sh·check-java.sh, test/
├─ tools/            검사·생성 (check-determinism, precompute-curves, gen_tables.py, release-version, build-single, sim(자리만))
├─ tests/  e2e/      Vitest · Playwright
└─ docs/             기획·구조 문서
```

### 2.1 설계 원칙

1. **데이터 주도**: 수치와 콘텐츠는 전부 `src/data/*.json`에 둔다. 밸런스 조정이나 타워·미션 추가는 코드 수정 없이 데이터만 바꾸면 되도록 한다.
2. **규칙과 화면 분리**: `src/sim/`은 Phaser·DOM을 모른다. 덕분에 확률이나 경제 계산을 테스트로 검증할 수 있다.
3. **시드 난수**: sim의 모든 랜덤은 `src/sim/Rng`(플레이어·용도별 흐름)를 거친다. 판 밖 보상은 계정 시드 + 굴림 번호. 같은 시드면 같은 결과가 나와서 버그를 재현할 수 있다.
4. **네트워크 격리**: 인터넷을 쓰는 코드는 자바 `Updater`(업데이트)뿐이고, 웹은 `src/update/`로 다리와만 이야기한다. 피드백은 브라우저로 주소를 연다. 멀티(`net/`)는 아직 없다. 광고, 분석, 로그인은 넣지 않는다.
5. **결정성**: `src/sim/`은 시드 난수·틱 번호·정수 연산만 쓴다 (`tools/check-determinism.mjs`가 검사). 렌더는 sim 상태를 읽기만 한다.
6. **데이터 검사**: `npm run check`(타입·결정성·곡선·`tools/gen_tables.py --check`)가 CI에서 돈다. 타워 수·특색 수·조합식·전투력 범위·등장 구성 합계를 검사한다.

---

## 3. 앱 안 업데이트 (U-1, 지금 코드)

### 3.1 흐름

```
앱 실행 → 로비(타이틀)가 보임 (Boot 장면 → UpdateService.setTitleVisible(true))
  └─ 이번 실행에서 처음이면 한 번 확인: window.RandomTDNative.checkUpdate()
       자바 UpdateLogic: GET https://api.github.com/repos/qkqh6898-woohak/Random-TD/releases/latest (인증 없음 = 공개 저장소)
         · 태그 android-v<x.y.z> 의 버전 > 설치된 versionName 이면 새 버전
         · 자산 Random-TD_Offline_v<x.y.z>.apk (최대 64MB) + SHA-256 (자산 digest 또는 SHA256SUMS)
         · 허용 호스트만: api.github.com · github.com · objects/release-assets.githubusercontent.com
       결과는 window.__rtdUpdate(사건) → updateModel.reduceUpdate → 로비 창(UpdateDialog, testid update-*)
  └─ [지금 업데이트] → startUpdate(): Updater가 받기 → SHA-256 확인 → PackageInstaller (출처 권한이 없으면 설정 열기)
```

- 창은 로비에서만 뜬다 (전투 중에는 안 뜸). 실패·오프라인·브라우저(다리 없음)는 조용히 넘어간다 — 게임에 영향 없음.
- 설정의 [업데이트 확인] 버튼·자동 확인 끄기는 **없다** (실행당 1회 자동 확인뿐).

### 3.2 버전 규칙 (`tools/release-version.mjs`, CI가 정함)

- package.json 버전이 가장 높은 `android-v*` 태그보다 크면 그대로 (사람이 2.0.0처럼 올린 경우), 아니면 가장 높은 태그의 patch + 1.
- versionCode = major × 1,000,000 + minor × 1,000 + patch (minor·patch < 1000), AndroidManifest versionCode보다 커야 한다 → 늘 단조 증가.
- 저장소의 package.json은 0.1.9 그대로이고 CI 작업 폴더에서만 덮어쓴다.

### 3.3 저장 데이터 보호 (지금 규칙)

- **진행 중 판** (`rtd.match`·`.dev`, `MatchSaves`): 형식(`MATCH_SAVE_FORMAT`)·앱 버전(빌드 때 package.json)·데이터 지문(dataHash) 중 하나라도 다르면 **버린다** (`updateMismatch`) → 로비 알림 '업데이트로 진행 중이던 판은 이어 할 수 없어요'. 이어 하기 대신 새 판.
- **계정** (`rtd.progress`, 형식 v2 — V2.0 PR-A 🔥 불꽃): `parseProgress`가 필드별로 관대하게 읽는다(틀린 필드만 기본값, 없는 필드는 이전 규칙 — 예: v1이면 불꽃 legacyFlame 한 번). 모르는 최상위 필드·데이터에 없는 타워 기록은 그대로 들고 다닌다. 읽을 수 없거나 이 앱보다 새 형식이면 덮어쓰기 전에 `rtd.progress.bak.<시각>`에 백업한다.
- **설정·기록·효과음·흔들림** (`rtd.settings` v2, `rtd.records` v2 …): 필드별 기본값으로 읽는다. 마이그레이션 폴더(`save/migrations/`)·업데이트 전 자동 전체 백업은 없다.

### 3.4 배포 자동화 (`.github/workflows/android.yml`)

```
main 푸시 (docs/**, **/*.md, .github/**만 바뀐 푸시는 제외)
  build: 버전 정하기 → npm ci·test·check·build → android/check-java.sh → setup-sdk + build-apk → Random-TD_Offline_v<버전>-unsigned.apk
  sign (main만, Environment android-release): apksigner v2+v3 → 서명 인증서 SHA-256 04:22:43:4C:…:D0:2A 확인 → SHA256SUMS
  publish: gh release create android-v<버전> (APK + SHA256SUMS, 노트 = 이전 태그 이후 커밋 제목)
```

- **깨면 안 되는 것**: 앱 ID `com.woohak.randomtd`, 서명 인증서, 태그 `android-v<x.y.z>`, 자산 이름 `Random-TD_Offline_v<x.y.z>.apk`, `SHA256SUMS`, 자바 다리 메서드 이름·`__rtdUpdate` 사건 모양 — 이미 설치된 앱의 UpdateLogic이 이 이름을 찾는다.
- CI(`ci.yml`)는 모든 브랜치에서 test·check·build. E2E는 CI에 없다(로컬).

### 3.5 업데이트 파일 보관 위치

- 소스 저장소 `Random-TD`가 **공개**라 그 저장소의 Releases를 인증 없이 그대로 쓴다 (별도 업데이트 저장소·토큰 없음).

## 4. 네트워크 정책

| 항목 | 정책 |
|------|------|
| 게임 플레이 | 네트워크 사용 안 함 |
| 업데이트 확인 | 로비가 보일 때 실행당 1회 (자바가 GitHub releases/latest 하나 요청) |
| 업데이트 다운로드 | [지금 업데이트]를 눌렀을 때만 |
| 피드백 | [💬 피드백 보내기] → 미리 채운 GitHub 이슈 주소를 **브라우저로** 연다 (앱이 직접 보내지 않음, 토큰 없음) |
| 멀티 모드 | **아직 없음** (`src/net/` 없음, [MULTIPLAYER.md](MULTIPLAYER.md)는 계획) |
| 광고, 분석, 계정, 랭킹 | 없음 |
| 보내는 정보 | 없음 (요청에 개인정보·기기정보를 담지 않음) |

---

## 5. 구현하지 않은 예전 계획 (참고)

- Capacitor + `@capgo/capacitor-updater` 웹 번들 라이브 업데이트, `latest.json` 매니페스트(minNativeVersion·bundleUrl), 새 번들 자동 롤백(`notifyAppReady`), 태그 푸시 `release.yml`, 공개 업데이트 전용 저장소 `Random-TD-updates`·`UPDATES_REPO_TOKEN`, `saveVersion` + `save/migrations/` 순서 변환·업데이트 전 자동 백업, 설정 [업데이트 확인]·자동 확인 끄기, 계획 폴더 구조(`config/ core/ systems/ scenes/`, `grades.json`·`recipes.json`·`talents.json` …, 파츠 SVG).
- 지금은 위 1~4장 방식을 쓴다 (APK 통째 업데이트가 단순하고, 서명 확인으로 안전하며, 자바 다리만으로 충분했다).
