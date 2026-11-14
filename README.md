# 운빨 디펜스 (Random-TD)

암흑의 군주가 이끄는 외계 녹스 군단에 맞서는 아트라 7종족 연합군의 랜덤 소환 + 3개 합성 타워 디펜스 모바일 게임. 개인용, 오프라인 플레이, 인터넷은 업데이트에만 사용.

## 실행 방법

필요한 것: **Node.js 22.12 이상**, npm, Python 3 (데이터 검사용). E2E 테스트는 Playwright용 Chromium이 필요하다.

```bash
npm ci              # 의존성 설치 (처음 한 번)
npm run dev         # 개발 서버 → 브라우저에서 http://localhost:5173 열기
```

- 휴대폰으로 보기: 같은 Wi-Fi에서 `npm run dev -- --host` 후 휴대폰 브라우저로 `http://<PC IP>:5173`
- 지금 할 수 있는 것 (M1): 타이틀 [시작] → 무한 모드 '순환의 정원'. 60초 준비 뒤 단계마다 몹 20칸이 2.5초 간격으로 나와 고리를 돌고, 맵 위 몹이 150마리를 넘으면 패배. 소환·공격은 M2부터
- URL 옵션: `?seed=123` (같은 판 재현), `?debug=1` (개발용: ×3 배속, 타이틀의 [캠페인 1] = 사거리 미로, HUD ⏭ 단계 건너뛰기)

| 명령 | 하는 일 |
|------|--------|
| `npm run dev` | 개발 서버 (바로 플레이) |
| `npm test` | Vitest 단위·통합 테스트 |
| `npm run check` | 타입 검사 + 결정성 검사(`tools/check-determinism.mjs`) + 곡선 표 최신 여부(`tools/precompute-curves.mjs --check`) + 데이터 검사(`tools/gen_tables.py --check`) |
| `npm run curves` | `enemies.json` growth로 몹 성장 곡선 표 `src/data/curves.json` 다시 만들기 (수치를 바꾼 뒤) |
| `npm run build` | 프로덕션 빌드 → `dist/` |
| `npm run preview` | 빌드 결과 미리보기 (http://localhost:4173) |
| `npm run e2e` | Playwright 스모크 테스트 (휴대폰 뷰포트 412×915), 스크린샷은 `test-results/screens/` |
| `npm run screens` | E2E + 문서용 스크린샷 갱신 (`docs/screens/M{n}.png`) |
| `npm run sim` | 헤드리스 밸런스 시뮬레이터 (M11에서 구현, 지금은 자리만) |

완료 조건 (커밋 전): `npm test && npm run check && npm run build && npm run e2e`

- Playwright 브라우저: 미리 설치된 Chromium을 쓴다. 다른 경로의 Chromium을 쓰려면 `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run e2e`. 포트는 `E2E_PORT`(기본 5173).
- 개발 규칙은 [CLAUDE.md](CLAUDE.md), 진행 기록은 [docs/PROGRESS.md](docs/PROGRESS.md).

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
| `src/data/game.json` | 판 공통 설정: 배속 목록(×1/×2/×3 Lv12), 프레임 따라잡기 한도, 한 판 흐름(시작 자금·준비/단계 시간·등장 간격·보스 주기·무한 맵), HUD 경고 기준 |
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
- [ ] M2 소환 + 자동 공격 + 돈 + 대기 동작
- [ ] M3 승급 + 덱 + 물리·마법·관통 피해 + 상태 이상 + 기본 25종 특색 + 리플레이
- [ ] M4 일꾼 + 몹 13종 + 조합 편대 + 보스 5종 + 카드 + 투명·감지
- [ ] M5 도전 · 강화(등급·능력치·초월) · 도박 · 미션
- [ ] M6 캠페인(월드맵·발판·배경·테마 맵 10개), 무한 난이도, 신 · 히든 타워, 이어하기
- [ ] M7 덱 편성 + 추가 타워 25종 + 해금 + 종족 시너지·앙숙
- [ ] M8 계정 레벨 · 해금 · 특성 · 상점
- [ ] M9 타워 조각 · 레벨 · 각성 · 도감 보너스
- [ ] M10 출석 · 일일/주간 미션 · 업적 · 도박 숙련도
- [ ] M11 2D 캐릭터 아트 · 애니메이션 · 사운드 · 튜토리얼 · 밸런스 시뮬레이터
- [ ] M12 Android 빌드 + 자동 업데이트 + 아이폰 웹앱
- [ ] M13 멀티 (협동·대결)
