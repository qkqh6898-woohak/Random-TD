# V2 PR-C — 시작·화면 전환 로딩

검토용 갈래: `design/v2-pr-c`. 의존: [PR-B #73](https://github.com/qkqh6898-woohak/Random-TD/pull/73), `design/v2-pr-b`의 `3eb907a`. 최신 main 출발점은 `68052a7`이다. PR-B는 아직 미병합이므로 PR-C의 PR 대상은 우선 `design/v2-pr-b`로 둔다. main은 변경하거나 릴리스하지 않는다.

## 범위와 동작

- **첫 시작**: 노랑·크림의 단색 햇살 띠, 두 줄 원본 게임 이름, 기존 광부 대표 캐릭터, 화면 폭 70%의 노란 사선 진행바와 끝에서 움직이는 작은 광부, 2초마다 바뀌는 원본 준비 문구, 오른쪽 아래 버전.
- JavaScript 번들을 받는 동안에도 `index.html`의 작고 독립된 시작 표본이 먼저 보인다. 외부 그림·글꼴 요청 없이 이름과 준비 문구를 표시하고, 실제 부팅이 시작되면 풍부한 로딩 UI로 바뀐다.
- 진행바는 Phaser Loader의 실제 PROGRESS 사건을 받는다. 동적 파일 추가 등으로 뒤로 움직이지 않게 표시값을 제한한다. 타이틀/전투의 기존 ready 사건이 오면 즉시 끝내며 최소 표시 시간을 강제하지 않는다. 미리보기의 62%는 개발용 표본에만 있다.
- **화면 전환**: 따뜻한 갈색, 12% 투명도의 오리지널 주사위·별·곡괭이·동전 무늬, 작은 광부와 '로딩 중…'. 시작 후 **300ms 이전에는 숨김**, 그 전에 끝나면 타이머를 취소해 한 프레임도 표시하지 않는다. 중복 시작은 지연 시간을 다시 세지 않는다.
- 로딩 중에는 기존 `#app`을 inert로 두어 뒤의 버튼·키보드 조작을 막는다. 끝내거나 파기할 때 이전 inert 값을 복원한다. 게임 틱·배속·일시정지·저장에는 접근하지 않는다.
- 준비 문구 인터벌과 지연 타이머는 완료/파기 시 정리한다. 게임 destroy에서 사건 구독을 해제한다. 오류 화면을 표시할 때 로딩도 정리해 오류를 덮지 않는다.
- 기기의 reduced-motion이면 광부·작은 주자의 흔들림을 없앤다. 그림이 없으면 같은 앱의 로컬 왕관 SVG로 대체한다. 글꼴이 실패/지연돼도 시스템 글꼴로 표시하고 게임을 기다리게 하지 않는다.

## 구조·소유권

| 파일 | 역할 |
| --- | --- |
| `src/ui/loading/LoadingView.ts`, `loading.css` | DOM 표현. PR-B 토큰·진행바·주아체 재사용 |
| `LoadingController.ts` | 보여주기/숨기기·300ms·문구 순환·입력 보호·정리 |
| `model.ts` | 표시 진행률의 범위/단조 증가와 UI 시간 값 |
| `bindLoading.ts` | 로더·장면 사건을 UI에 연결하는 어댑터 |
| `preview.ts` | Vite DEV 전용 미리보기, 실제 메뉴/배포 빌드 진입점 없음 |
| `index.html` | JS가 도착하기 전의 자산 없는 시작 표본 |
| `src/main.ts` | 컨트롤러 생성·연결·오류 시 정리, 개발용 미리보기 경로 |
| `src/view/scenes/Boot.ts` | 실제 리소스 진행 사건 전달, 로더 listener 정리, shutdown 시 전환 사건 |
| `src/view/scenes/Game.ts` | 기존 shutdown 처리기에 **표시용 사건 1줄** 추가 |

GameContext·sim·save·meta·data·audio·net·update·Android/서명 설정은 수정하지 않는다. 기존 선택자와 E2E 기대값도 그대로다. Boot/Game이 이미 내던 `rtd:title-ready` / `rtd:game-ready`를 사용한다. 새 사건은 `rtd:loading-progress(number)`와 `rtd:scene-loading()`뿐이며 명령이나 저장 형식이 아니다. Boot의 이전 Canvas 로딩 글자는 대체 경로로 유지한다.

Phaser 장면 전환의 종료는 장면 create 끝의 ready 사건이다. 늦게 별도로 받는 배경이나 업데이트 확인을 기다리게 만들지 않는다. 이벤트 루프가 실행되는 비동기 전환에서 지연 화면을 표시하며, 동기 작업을 분할하거나 게임 시작 순서를 바꾸지는 않는다.

## 자산

새 그림은 `public/assets/ui/v2/loading/pattern.svg` 하나다. 원본 벡터로 직접 제작했고 144px 반복 무늬, 선/색의 투명도 12%다. 기존 아이콘 29종의 목록을 바꾸지 않도록 하위 폴더에 둔다. 햇살 띠는 CSS의 단색 hard-stop 패턴이며 비트맵이 아니다. 캐릭터는 기존 `miner.webp`, 누락 대체는 PR-B `heroes.svg`, 글꼴은 PR-B 로컬 Jua WOFF/OFL을 재사용한다. 새 캐릭터·로고 이미지·타워 ID를 만들지 않았다. 참고 이미지의 캐릭터·로고·문구는 복제하지 않았다. 출처/해시는 `assets.json`.

## 미리보기

```sh
npm ci
npm run dev -- --host 127.0.0.1
# /?loading-preview=startup
# /?loading-preview=transition
```

Vite 개발 서버에서만 열리며 화면에 '로딩 화면 미리보기'를 표시한다. 실제 게임 부팅에서 이 경로나 표본 진행률을 사용하지 않는다. PR-B의 `?ui-gallery=1`, 기존 `?gallery=1`과 별개다.

| 폭 | 첫 시작 | 전환 |
| --- | --- | --- |
| 320 | [시작](screens/startup-320.png) | [전환](screens/transition-320.png) |
| 360 | [시작](screens/startup-360.png) | [전환](screens/transition-360.png) |
| 393 | [시작](screens/startup-393.png) | [전환](screens/transition-393.png) |
| 412 | [시작](screens/startup-412.png) | [전환](screens/transition-412.png) |

## 검증

- `npm ci`, unit **103파일 1,548 통과·5 건너뜀**, check/build/build:single 통과. 단일 HTML은 약 17.98MB·자산 277개다.
- 기본 Chromium에서 새 로딩 검사 **13/13 통과**: 4개 폭의 시작/전환, 로컬 그림/글꼴, 텍스트 대비·화면 경계, 299/300ms 경계, 빠른 완료 무표시, 중복 시작, 2초 문구 교체, 진행 표시 역행 방지, 파기/입력 복원, reduced-motion·안전영역, 실제 JS 모듈 지연의 첫 표본, 실제 Phaser 리소스 지연·느린 로비 복귀·이어 하기, 누락 그림 대체.
- 전체 E2E **254개 중 243 통과·5 실패·6 건너뜀**(23.1분). 설치된 Chromium에 `--disable-webgl`만 더해 게임이 지원하는 Canvas 대체 렌더러로 실행했다. 기본 Chromium의 새 검사 13개와 전체 Canvas 안의 새 검사 13개가 모두 통과했다. 전체 게임 WebGL 스위트를 통과했다고 표시하지 않는다. 검사 중에는 소스를 수정하지 않았다.
- 실패 목록은 부모 PR-B와 **파일·행·제목이 같은 5건**이다. 4건은 `hud-layout.spec.ts:134`의 보스 배너 예약 높이(4개 폭), 1건은 `devtools.spec.ts:243` file:// 관리자 차단이다. PR-B 단계의 기준 main에서도 HUD 4건을 재현했다. 이번 PR에서 HUD나 기대값을 약하게 바꾸지 않았다. 비교 근거와 각각의 측정은 부모 `validation.json`에 있다.
- 건너뜀 6건은 SAVE_SCREENS 전용 기존 캡처 스펙이다. 전체 실행이 다시 찍은 기존 화면 22개는 되돌렸으며 새 PR-C 캡처만 남겼다.
- 배포 HTTP: `?loading-preview=transition`이 개발용 화면을 열지 않고 실제 부팅·로비·게임으로 간다. 첫 로딩 DOM 생성 후 준비 완료에서 제거됨, app.inert=false, 소환 후 900원, 로비 복귀·이어 하기, 외부 요청 0·오류 0을 확인했다.
- 단일 HTML HTTP: **문서 요청 1회·추가 자산 요청 0·오류 0**. 자산 277개에 패턴/WOFF가 내장돼 있다. 표시용 사건으로 전환 화면을 열어 패턴 data URI의 CSS 적용과 SVG 디코딩도 확인했다(경기 상태/시계 변경 없음). 준비 완료·새 판·이어 하기 뒤 로딩이 남지 않고 입력이 복원됐다.
- 빈 HTML도 file://에서 관리자 정책으로 차단됨을 재확인했다. HTTP 보완 확인을 서버 없는 검사 통과로 세지 않는다. 정책을 우회하지 않았다.
- 로고/밝은 바탕 문구는 진갈색 외곽선을 포함해 대비를 측정했고, 버전은 실제 진갈색 바탕과 비교했다. 8개 캡처의 기록된 최소 대비는 **9.92:1**이다. 새 문구의 한글 55자도 로컬 글꼴에 모두 있다. Android 안전영역은 top/bottom 30/24px 모의값을 사용했으며 실제 기기의 노치·터치 확인은 통합 단계에서 남아 있다.
- 원시 측정: `screens/*.json`. 상세 결과·해시·로그 경로: `validation.json`. 로그/원본/HTML 결과는 로컬 tmp/release이며 커밋하지 않는다. 미리 설치된 Chromium을 사용했고 브라우저 설치 명령은 실행하지 않았다.
- 변경 파일 전체는 `files.txt`. `git apply --check`로 부모 PR-B에 적용 가능한 패치를 확인한 뒤 커밋한다.

## Claude 인계

1. PR-B #73의 토큰/컴포넌트 검토 후 PR-C diff를 별도로 확인할 것. 부모가 아직 미병합이어서 PR-C의 대상은 `design/v2-pr-b`다.
2. 두 커밋을 검토용 통합 갈래에 순서대로 적용해도 된다. PR-B가 main에 들어간 뒤에는 PR-C 대상을 main으로 바꾸고 겹치는 진입점·진행 기록을 확인할 것.
3. main 병합은 현재 자동 APK 릴리스를 시작한다. 이번 갈래에서는 푸시/병합/서명 릴리스를 실행하지 않는다.
4. 다음 단계는 PR-D 로비다. 이번에는 로비·영웅·전투 전체 배치를 개편하지 않았다.
