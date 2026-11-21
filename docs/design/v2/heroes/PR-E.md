# V2 PR-E — 영웅 수집 카드

`design/v2-pr-e`, 대상 `design/v2-pr-d` (PR-D #77). PR-B #73 → PR-C #74 → PR-D #77 → PR-E 순서로 검토한다. 공통 main 기준은 `3abfda6`이다. main 병합·푸시·릴리스는 실행하지 않는다.

## 결과

- 4열, 카드 면 1:1.15, 간격 카드 폭의 약8%, 캐릭터 높이 약50%, Lv와 초록 진행바·보유/필요 수량, 카드 아래 전체 이름.
- PR-B의 일곱 등급 토큰을 기존 순서/이름에 대응한다. 레전드 그라데이션, 신/리미티드 빛, 리미티드 별 리본. 상세 창에 실제 등급 이름을 표시한다.
- 미보유는 검은 캐릭터 실루엣·회색 면, 잠긴 리미티드는 잠김 표기. 실제 카드/불꽃 조건을 만족할 때만 1초 주기 초록 화살표. MAX·모두 레벨업·해방은 기존 모델/명령을 쓴다.
- 상단 종합 레벨·**영웅별** 전투 공격력 보너스 범위와 성장 안내. 현재 게임은 공통 합산 버프가 없으므로 새 경제를 만들지 않는다. 저장 레벨이 상한을 넘더라도 전투에 실제 적용되는 기존 보너스 함수를 사용한다.
- 카드 수량은 표시만 K/M으로 줄이고 접근성 이름에는 정확한 정수를 제공한다. 320px에서도 최소12px·터치44px, 길이가 긴 이름은 줄바꿈. 본문14px·합계16px.
- 안전영역은 기존 로비 변수/env를 이어 쓴다. 짧은 화면에서 목록 스크롤, 성장 안내는 본문만 스크롤하고 닫기/확인 유지. reduced-motion이면 화살표/누름 이동을 끈다.

## 파일·자산·계약

| 파일 | 변경 |
| --- | --- |
| `src/ui/lobby/Lobby.ts` | 컬렉션 DOM·상단 안내·등급 상세 배지. 기존 선택자/진행 판정 보존 |
| `src/ui/lobby/heroesV2.css` | 영웅 컬렉션에만 적용하는 배치/외형/짧은 팝업 |
| `src/ui/lobby/heroCollectionModel.ts` | 기존 heroLevelSum/heroAtkBonuses를 읽는 표시용 요약 |
| `src/ui/design-system/components.ts`, `components.css` | 카드의 선택적 progressText·문자 초상 대체 슬롯. 기존 호출은 그대로 동작 |
| `tests/unit/hero-collection.test.ts` | 개별 보너스/합산 오해 방지·전투 상한·설정값 사용 |
| `e2e/heroes-v2.spec.ts` | 네 폭/일곱 등급/실루엣/비율/간격/텍스트/터치/실제 레벨업/짧은 안전영역/뒤로 가기 |

새 이미지/폰트/아이콘을 추가하지 않는다. 기존 캐릭터 WebP, PR-B 주아체·info/upgrade-arrow 아이콘, 번호 배지를 재사용한다. 원작의 캐릭터·로고·문구를 복제하지 않는다. 카드 등급 토큰은 [PR-B](../PR-B.md)를 그대로 따른다.

공유 `CardProps`는 `portrait: string | null`, 선택적 `progressText?: string`을 받는다. null이면 이름 첫 글자를 그린다. 보유하지 않은 카드라도 조각 진행률은 호출자가 전달한 실제 값으로 표시한다. 갤러리의 기존 미보유 표본은 progress=0이므로 유지된다.

sim/meta/save/data/경제/ID/의존성/Android/CI/Phaser 구조는 수정하지 않는다. 기존 레벨업 상세/비용과 선택자를 유지한다. 전투 칸 투명화 요청은 별도 `design/field-context`에서 처리한다.

## 검증·인계

최종 결과는 validation.json, 네 폭의 영웅/신·리미티드 캡처와 layout JSON에 기록한다. 전체 게임 Canvas 검사와 기본 Chromium UI 검사를 구분하며 file:// 관리자 차단·기존 main 실패를 숨기지 않는다. 실제 Android 검증은 별도다.
