# Random TD V2.0 — PR-B 공통 디자인 시스템

상태: 검토용. 기준 main `68052a7e429d139eaa1d1ca2560ddbcb83981da5`. 브랜치 `design/v2-pr-b`.

## 단계와 범위

1. **PR-B (이번 단계)**: 공통 토큰, 표현 컴포넌트, 오리지널 아이콘, 로컬 글꼴, 개발용 갤러리와 검증.
2. PR-C: 로딩 화면. PR-B 토큰/진행바/글꼴을 사용해 별도 검토.
3. PR-D/E: 로비와 영웅 카드. 데이터 연결은 Claude와 소유권을 맞춘 뒤 진행.
4. PR-F/G: 나머지 상세 화면과 전투. 경제·저장·명령 처리는 Claude 소유.

공개 main의 CLAUDE.md·PROGRESS와 공개 PR 제목/본문 검색에서 PR-A 결과나 V2 전용 소유권 문서는 확인하지 못했다. 따라서 기존 구조·역할 분담을 따르며 새 폴더에 격리했다. PR-A가 뒤에 도착하면 공개 API를 연결하고, 기존 소스를 중복 재구현하지 않는다. 이번 PR에서 sim·save·meta·data·Phaser·캐릭터 그림·로비·HUD·실제 팝업의 동작과 기존 E2E 선택자를 바꾸지 않는다.

`src/main.ts`는 Vite 개발 서버에서만 `?ui-gallery=1`을 처리하는 6줄을 추가한다. 기존 `?gallery=1` 캐릭터 갤러리와 별개다. 일반 메뉴에는 링크가 없으며 배포 빌드에서는 분기와 갤러리 import가 제거된다. 토큰/CSS는 `.rtd-v2` 안에만 적용한다. 기존 `:root`, `.btn`, `--gold`를 덮어쓰지 않는다.

## 검토 방법

```sh
npm ci
npm run dev -- --host 127.0.0.1
# http://127.0.0.1:5173/?ui-gallery=1
```

갤러리에 버튼 6종·기본/눌림/비활성, 등급 카드 7종+미보유, 알림 on/off, 강화 화살표·횟수, 재화 바 5종, 팝업 2종, 아이콘 29종, 색/글자/진행바를 모았다. 카드 선택 시 상세 팝업에 기존 등급 이름을 표시한다. 예시 버튼은 데모 상태 문구만 바꾸며 실제 재화·보상·게임 상태에 접근하지 않는다.

## 토큰

CSS 원본: `src/ui/design-system/tokens.css`. 모든 이름은 `--rtd-` 접두사다.

| 용도 | 변수 뒤 이름 | 값 |
| --- | --- | --- |
| 배경 / 패널 / 외곽선 | bg / panel / outline | #6B5046 / #3A2A22 / #3B2314 |
| 주요 버튼 / 아래 그림자 | primary / primary-shadow | #F7D23E / #E0A800 |
| 보조 버튼 / 아래 그림자 | secondary / secondary-shadow | #3E4A7A / #283051 |
| 진행 / 알림 / 경험치 | progress / notification / experience | #3DDC5A / #F04848 / #3BA9F0 |
| 나무 / 종이 / 닫기 | wood / paper / close | #7A4E36 / #F3EBD3 / #3E4F7A |
| 숲 / 노란 나무 / 흙길 | forest / yellow-tree / path | #3F6B22 / #E8B33A / #E9C77A |
| 잔디 / 흙벽 | grass / earth | #7BA83A / #8A5A32 |
| 글자 / 강조 숫자 / 치명타 | white / number / critical | #FFFFFF / #FF9A3C / #4FD8F0 |
| 접근 가능한 배지 바탕 / 비용 경고 | badge / danger-ink | #236634 / #A12525 |
| 비활성 바탕 / 보조 글자 | disabled / muted-ink | #D2CCC2 / #5C493E |

진행 초록과 알림 빨강은 요청 색을 그대로 쓴다. 그 위에 작은 흰 숫자를 바로 놓으면 4.5:1이 안 되므로, 숫자 배지는 더 진한 초록 바탕 + 밝은 초록 하이라이트를 쓴다. 비활성 비용도 원색 빨강 대신 종이 바탕에 대비되는 진한 빨강을 쓴다. 장식용 색과 글자용 색을 구분하며 원본 토큰 값을 몰래 바꾸지 않는다.

글꼴: `--rtd-title-font` = 앱에 포함한 **배민 주아체(RTD Jua)**, 본문은 시스템 한글 글꼴. 주아체는 SIL OFL 1.1이며 `public/assets/fonts/Jua-OFL.txt` 동봉. 외부 폰트 요청 없음. `loadDesignFont()`는 `assetUrl`로 **줄인 WOFF2(KS X 1001 한글 2,350자 + 기호, 188KB)**를 읽어 일반/단일 HTML 내장 자산 모두 지원한다(결정 A: ≤300KB). 다시 만들기: `python3 -I tools/font_subset.py <원본>`. 범위 밖 글자는 시스템 한글 글꼴로 그려진다. 출처·해시는 `font.json`.

크기: 작은 글자 12px / 본문 14px / 재화 숫자 18px / 주요 버튼 24px. 아이콘·카드 선 2px, 강조 제목 글자 선 1.5px. 모서리 12px, 기본 간격 8px, 최소 터치 영역 44px. `--rtd-safe-{top,right,bottom,left}`는 각각 `env(safe-area-inset-*,0px)`를 사용한다.

## 등급 대응

**순서만 대응한다. 기존 등급 ID와 이름은 그대로다.** 예를 들어 사양표의 세 번째 보라색은 현재 코드의 `unique / 유니크`에 대응한다. 기존 전투 등급 팔레트와 로비 카드에는 이번 색을 아직 적용하지 않는다.

| 순서 | 기존 ID / 이름 | 배경 | 테두리 | 작은 칸 |
| --- | --- | --- | --- | --- |
| 1 | normal / 노말 | #B7AC8E | #F3EBD3 | #D9D0B8 |
| 2 | rare / 레어 | #3E4F8C | #5B8BE0 | #4FC3F7 |
| 3 | unique / 유니크 | #6A3A9C | #9B6AD8 | #E58CF0 |
| 4 | hero / 히어로 | #E3A92B | #FFE07A | #FFD54A |
| 5 | legend / 레전드 | #E2772A→#F5A04A | #FF9A3C | #FFB46B |
| 6 | god / 신 | #B8323A | #FF6B6B | #FF8A8A |
| 7 | hidden / 신화 | #2B2A5E | #FFD54A | #8C86FF |

카드는 약 1:1.15, 캐릭터는 판 높이 50%, Lv/진행바/아래 이름. 마지막 세 단계는 정적이고 은은한 안쪽 빛, 마지막 단계는 왼쪽 위 별 리본. 미보유는 검은 실루엣과 회색 판. 등급 이름은 기존 `GRADE_NAMES`를 읽어 접근성 이름과 상세 화면에 함께 쓴다. 카드 보유/레벨/진행/알림은 모두 props다.

## 공개 컴포넌트 API

`src/ui/design-system/index.ts`를 import하고 상위 컨테이너에 `.rtd-v2`를 붙인다. UI는 DOM이며 Phaser 생성/명령 전송/저장 호출을 하지 않는다.

| API | 역할 / 호출자가 넘기는 상태 |
| --- | --- |
| createButton | variant: primary/secondary/pill/icon/mode/close, label, icon, cost, disabled, notification, selected, timer, onClick |
| createIcon | 오리지널 SVG ID. 장식 그림이며 버튼의 label이 접근성 이름을 담당 |
| createNotificationDot | visible boolean만 받음. 판단 로직 없음. 버튼/카드는 알림 props를 접근성 이름에도 포함한다. 오른쪽 위에 약 1/3 겹침, 대상 폭 22%, 최소 10px |
| createUpgradeArrow / createNumberBadge | 1초 위아래 튀는 초록 화살표 / 전달받은 횟수 |
| createGradeCard | grade/name/level/progress/progressLabel/portrait/owned/notification/onClick |
| createProgress | 0~100 표시용 값과 접근성 label, progress/experience |
| createCurrencyBar | gold/diamond/energy/battle-coin/luck, label, value, 선택적 onAdd |
| createPopupFrame | 나무판·torn/pinned 종이·제목·닫기·primary 슬롯의 표현 프레임 |
| createPopup | 네이티브 dialog: open/close/destroy, Esc·바깥 클릭·포커스 복귀, props 콜백 |
| formatCompactNumber | 표시 전용 10,800→10.8K, 1,200,000→1.2M. 999,950부터 반올림 승격해 1000K 방지. NaN/Infinity는 — |
| loadDesignFont | 호출자가 선택적으로 로컬 주아체를 로드하는 Promise |

```ts
import { createButton, loadDesignFont } from './ui/design-system';
await loadDesignFont();
container.classList.add('rtd-v2');
container.append(createButton({
  label: '소환', variant: 'primary', cost: '100',
  disabled: model.disabled, notification: model.hasNotice,
  onClick: callbacks.onSummon,
}));
```

버튼은 눌림 0.95배/밝기 0.96/100ms, 뗌 160ms 복원. 팝업은 검정 56% 배경과 150ms 0.9→1 확대/페이드. reduced-motion이면 화살표·팝업·버튼 이동/전환을 끈다. dialog는 브라우저의 포커스 제한을 사용하고 닫힐 때 원래 버튼으로 복귀한다. 높이가 부족하면 안전영역 안에서 스크롤한다.

**불꽃은 SVG 자산과 개발용 아이콘 목록에만 있다.** Currency 타입에 flame이 없고 실제 화면·재화 모델·버튼에는 연결하지 않았다. 연결은 별도 사용자 승인 대상이다.

## 자산과 파일

- 새 오리지널 SVG 29종: `public/assets/ui/v2/*.svg`, 목록/해시 `icons.json`.
- 탭 다섯 번째는 기존 로비처럼 캠페인, 네 번째는 도감. 추가 로비/인게임/재화/강화/모드 아이콘 포함. 배속 그림의 ×2는 SVG 경로이며 외부 글꼴에 의존하지 않는다.
- 48×48 viewBox, 기본 2px 진갈색 선, 사물 중심 약 80%, 한 단계 단색 음영과 하이라이트. SVG는 DPR 2/3에서도 벡터로 표시하므로 중복 PNG는 만들지 않았다.
- 기존 miner 등 WebP는 갤러리의 캐릭터 샘플로 재사용하고 수정하지 않았다. 새 캐릭터/원작 이미지·로고·문구 복제 없음.
- 폰트: `public/assets/fonts/Jua-Regular.subset.woff2`(188KB, `tools/font_subset.py`), 라이선스. 기존 시스템 글꼴은 그대로.
- 구현: `src/ui/design-system/{tokens.css,components.css,icons.ts,components.ts,format.ts,font.ts,index.ts,gallery.ts,gallery.css}`.
- 기존 파일 변경: `src/main.ts` 개발용 진입점, `docs/PROGRESS.md` 끝에 진행 기록만.
- 새 검증: `tests/unit/design-system.test.ts`, `e2e/design-system.spec.ts`. 기존 E2E 파일/선택자/기대값 변경 없음.

## 검증 기록

- `npm ci` 통과. 최종 `npm test`: **102파일 1,539 통과·5 건너뜀**. 추가 건너뜀 2개는 설치되지 않은 Python 버전 검사다.
- 최종 `npm run check`, `npm run build`, `npm run build:single` 통과. 단일 HTML 17.96MB, 자산 276개. 원본/임시 파일과 HTML 빌드 결과는 커밋하지 않는다.
- 최종 기본 Chromium 갤러리 **7/7 통과**: 320·360·393·412px, 텍스트 잘림/가로 넘침 없음, 모든 보이는 버튼·카드 44px 이상, 작은 글자 12px 이상, DPR 2/3 SVG, 실제 한글 폰트 로드, 알림 on/off·화면 읽기 이름, 눌림/비활성, modal 포커스·Esc·닫기 복귀, reduced-motion.
- 각 폭에서 실제 CSS의 **20가지 글자/바탕 조합 모두 4.5:1 이상**. 측정 최소 **5.31:1**(비활성 라벨). 흰 외곽선 글자는 흰 채움과 진갈색 외곽선의 대비도 확인했다. 원시 측정값은 `screens/audit-*.json`. 폰트의 갤러리 한글 247자 글리프가 모두 있다.
- 안전영역은 네 방향 `env()` 선언과 위/아래 inset 모의값 30/24px을 검사했다. 실제 Android 기기의 노치·터치는 이번 환경에서 확인하지 않았다.
- 전체 `npm run e2e`: **241개 중 230 통과·5 실패·6 건너뜀**, 22.9분. 건너뜀 6건은 SAVE_SCREENS 전용 기존 캡처 스펙이다. 설치된 `/usr/bin/chromium`에 `--disable-webgl`만 더한 로컬 래퍼로 지원되는 Phaser Canvas 대체 렌더러를 사용했다. 기존 스펙·선택자·기대값·제한 시간은 바꾸지 않았다. 기본 WebGL 전체 게임 검사를 통과했다고 표시하지 않는다.
- **실패 4건은 기준 main에서 재현**: `e2e/hud-layout.spec.ts:134`, 412×915·360×640·320×568·915×412. 보스/도전 배너의 끝이 예약된 지도 시작 위치를 넘는 검사다. 같은 환경·렌더러에서 기준 main을 별도 작업 폴더로 실행해 4건 모두 같은 assertion에서 실패했다. 측정 픽셀 값은 두 실행이 달라 각각 기록했다. 이번 단계에서 기존 HUD나 기대값을 수정하지 않았다.
- **실패 1건은 환경 정책**: `e2e/devtools.spec.ts:243`의 file:// 열기가 `net::ERR_BLOCKED_BY_ADMINISTRATOR`. 빈 HTML도 차단됨을 확인했다. 우회하거나 검사를 약하게 만들지 않았다.
- 보완 HTTP 확인: 일반 배포에서 `?ui-gallery=1`은 갤러리를 열지 않고 정상 게임으로 간다. 새 폰트·아이콘 요청 0, 오류 0. release 폴더만 제공한 단일 HTML도 **HTTP 요청 1회·추가 자산 요청 0·오류 0**, SVG 29개와 내장 폰트 디코딩, 소환 후 900원을 확인했다. 이 확인을 서버 없는 file:// 검사 통과로 세지 않는다.
- 최종 게임 배포 JS/CSS **4파일 모두 기준 main과 바이트 단위 동일**: `production-bundle-comparison.json`. 새 자산만 동봉되며 기존 화면에서 자동 로드하지 않는다.
- 전체 실행 뒤 알림 접근성 이름과 갤러리 표본의 팝업 여백을 보완하고 새 갤러리 7개, unit·check·build·single을 다시 돌렸다. 게임 전체 E2E를 두 번째로 재실행했다고 주장하지 않는다.
- 기존 E2E가 다시 찍은 22개 기존 화면 캡처는 되돌렸다. 새 PR-B 캡처만 보관했다. 세부 결과·로그 경로·해시: `validation.json`. 로그와 원본 TTF는 로컬 `tmp/v2/`이며 커밋 제외.

## 스크린샷과 다음 검토

| 폭 | 전체 컴포넌트 | 첫 화면 |
| --- | --- | --- |
| 320 | [전체](screens/gallery-320.png) | [첫 화면](screens/gallery-320-top.png) |
| 360 | [전체](screens/gallery-360.png) | [첫 화면](screens/gallery-360-top.png) |
| 393 | [전체](screens/gallery-393.png) | [첫 화면](screens/gallery-393-top.png) |
| 412 | [전체](screens/gallery-412.png) | [첫 화면](screens/gallery-412-top.png) |

[아이콘 2×](screens/icons-2x.png) · [아이콘 3×](screens/icons-3x.png) · [눌림](screens/button-pressed.png) · [핀 팝업](screens/popup-pinned.png). 변경 파일 전체는 `files.txt`.

Claude는 먼저 PR-B 갤러리와 공개 API를 검토하고 PR-A 결과/소유권 문서가 도착하면 연결점을 확인할 것. PR-C~G의 실제 화면은 다음 PR에서 한 영역씩 옮긴다. 기존 HUD 실패는 별도로 검토한다. 이번 갈래는 검토용이며 main 푸시·병합·릴리스를 하지 않는다. **현재 저장소에서는 main 병합이 자동 APK 릴리스를 시작한다.**
