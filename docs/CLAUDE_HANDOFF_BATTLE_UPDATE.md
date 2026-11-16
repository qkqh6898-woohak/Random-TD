# Claude 전달: 전투 업데이트 (GitHub 검토용)

검증 기준: `qkqh6898-woohak/Random-TD`의 `main` **ee40acb59e7934df683b0a8e3ff4e9ff475fc725**. 작업 시작 당시 최신 main을 확인해 구현·검증했다. 후속 사용자 요청으로 `codex/battle-update-review` 브랜치와 초안 PR로 전달한다.

업로드 시점의 main은 **7d50ff757f9efa636d0254889e89373d527acdce**로 전진했으며, B-1 전투 화면 패치와 v0.1.9가 통합돼 있다. 이 갈래는 검증한 ee40acb 기준 변경을 보존한다. 새 main의 B-1 화면·역할 분담(Claude: sim·밸런스·저장·검토)을 유지하며 Claude가 선별 통합해야 한다. 아래 검증 수치는 새 main과 통합한 상태의 결과가 아니다.

사용자가 언급한 첨부 전투 화면 패치는 이 대화·파일 시스템에 없었다. main의 A-1 통합 커밋(326816f, a797bf7)을 확인해 저장·이어 하기·주사위·효과음·뒤로 가기가 이미 통합된 상태에서 작업했다. 업로드 시점에는 B-1 전투 화면 변경이 main에 들어왔으므로 병합 전에 그 변경과 diff를 비교해야 한다.

## 적용

아래 패치는 코드·데이터·문서·테스트·리플레이·검토용 PNG를 포함한다. `node_modules`, 빌드 결과, 임시 브라우저 설정은 포함하지 않는다.

```bash
git switch -c review/battle-update ee40acb59e7934df683b0a8e3ff4e9ff475fc725
git apply --check /path/to/Random-TD-battle-update.patch
git apply /path/to/Random-TD-battle-update.patch
npm ci
npm test
npm run check
npm run build
npm run e2e
```

후속 사용자 요청은 GitHub 업로드와 Claude 검토 전달이다. main에 바로 병합하거나 릴리스하지 않는다. 새 main에 통합할 때는 B-1의 캐릭터 크기·HUD·주사위 연출을 보존하고 아래 주요 파일의 충돌을 먼저 검토한다.

## 변경 동작

- 일반 계정 Lv1부터 ×1 → ×2 → ×4 → ×8 → ×16 → ×1. 새 판 기본 ×1, 이어 하기는 저장 배속. `game.json`에서 목록 지정. 고정 20Hz·기존 프레임 예산 유지.
- 자동 저장: 기존 실제 시간 2.5초 하한을 그대로 사용. 배속 전환·단계 변경·일시정지는 즉시 저장. WebAudio 간격과 입력/길게 누르기는 실제 시간 기준 유지. 브라우저 검사로 ×16 소환·고용·효과음·저장/복원 확인.
- 보스 제한 **60 → 90초**. 일반 단계 60초 유지, 보스 단계만 `max(stageTicks, bossTimeTicks)`로 늘려 다음 단계와 겹치지 않음. 일찍 처치해도 남은 시간은 휴식. 캠페인 출구 누출 패배는 기존대로 즉시 발생.
- 65종 타워의 기본 `atk/matk/tatk` **각 ×1.5** (0 유지). 등급 기준 DPS도 같은 배율로 올려 전투력 지수 유지. 특색 확률·보스 체력 배율·공격 속도·사거리 변경 없음. 소수 피해 나머지 누적 정책 유지.
- 크리티컬은 `#FFB34D` 큰 피해 숫자(일반의 1.8배)·느낌표 + 120~180ms 타격선/별. 프레임 초반 치명타도 보존하고 일반 피해보다 우선, 같은 종류는 큰 피해 우선. ×16 숫자 2개/프레임·활성 12개 등 기존 성능 한도 유지. 숫자 풀은 일반/큰 글자/크리티컬로 나눔. 연출 끄기 존중.
- 일꾼은 전투 타워가 아니라 HUD 고용·인원 UI의 SD 작업자(안전모·멜빵·공구 가방). 고용 버튼 끄덕임은 `prefers-reduced-motion` 존중.
- 보스 19종(대장·4천왕·군주)은 `sdBoss.ts`의 오프라인 절차 그림. 보스에 한해 기존 외부 WebP보다 새 그림이 우선. 실루엣·소품을 구분하고 `bossPose`로 종별 박자/체중감/탄성을 다르게 함. 갤러리도 같은 그림과 자세 사용. 도전 보스 전용 기존 그림은 이번 19종 교체 범위 밖.

## 수치와 첫 10단계

기본 덱 Lv1·타워 Lv1·치트 없음, 시드 7001~7020, 운영 두 가지 각 20판씩 변경 전/후 총 80판.

| 항목 | 전 | 후 |
|---|---:|---:|
| 보스 시간 | 60초 | 90초 |
| 광부 물리 | 7 | 10.5 |
| 고블린 물리 | 4 | 6 |
| 궁수 물리 | 10 | 15 |
| 견습 마법사 마법 | 6.5 | 9.75 |
| 전사 물리 | 18 | 27 |
| 첫 보스 처치 A: 소환·승급 중심 | 10/20 | 18/20 |
| 첫 보스 처치 B: 강화·미션 병행 | 15/20 | 19/20 |

1~9단계에서 두 운영 모두 패배 없음. 표본 밖의 성공률 보장은 아님. 첫 보스 체력 배율 0.1 유지. 정확한 65종 전후 수치·모든 시드의 결과·1~10단계 동시 몹 최고치는 [전체 보고서](balance/battle-update.md). 비교 원본은 `battle-update-baseline.json` (main에서 추출).

```bash
BATTLE_BALANCE=1 npx vitest run tests/integration/battle-update.test.ts
```

이 명령은 위 비교 보고서를 재생성한다. 기존 `npm run bot:first-boss`는 F10 당시의 보스 체력 배율 실험이며 이번 공격력/시간 전후 비교와 다르다.

## 검증

- `npm test`: **1250 통과 / 3 선택 실행 건너뜀**, 66파일.
- `npm run check`: 타입·결정성·곡선·데이터 검사 통과.
- `npm run build`: 통과.
- `npm run replays`: 7개 리플레이를 새 밸런스/단계 길이에 맞춰 재생성, 재생·중간 저장/복원 동등성 모두 통과.
- 첫 10단계 80판 비교: 통과.
- 새 E2E 3개: 통과. Chromium Canvas, 412×915, deviceScaleFactor 1.
- 전체 E2E 130개 실행: 125 통과 / 4 실패 / 1 선택 실행 건너뜀 (19.1분). 실패 중 새 규칙에 맞춰 일반 배속 기대값·보스 시간 초과 검사 시점·일꾼 이모지 기대값 3건을 수정한 뒤 **3/3 재실행 통과** (30.1초). 최종 개별 시나리오 기준 **128 통과 / 1 환경 차단 / 1 건너뜀**.
- 남은 환경 차단 1건: 기존 `devtools.spec.ts`의 `file://` 단일 파일 실행이 `net::ERR_BLOCKED_BY_ADMINISTRATOR`로 차단됨. 브라우저 정책을 변경하지 않았으며 이 검사를 통과했다고 보지 않는다.
- 일반판 단일 HTML (`SINGLE_DEV=0`): 빌드 통과, 19.82MiB. 초기 HTML만 제공하고 모든 추가 에셋 요청을 차단한 HTTP 문맥에서 ×1 기본·전체 배속 순환·소환·일꾼 고용·개발자 UI 없음·오류 없음 확인.
- 배속 실제 5초 측정: ×1 **100틱**, ×4 **402틱**, ×16 **1611틱**, 버린 틱 0 (Canvas).
- 마지막 데이터 지문 갱신 뒤 리플레이 17검사 및 저장 복원·단계·새 FX 37검사 재확인 통과.

이 컨테이너의 Chromium 소프트웨어 WebGL은 입력·스크린샷 자동화를 심하게 지연시켜 전체 검사는 Canvas fallback으로 실행했다. 테스트용 임시 설정은 원래 Playwright 설정을 그대로 상속하고 `launchOptions`만 아래처럼 바꾼다(제품 코드 변경 없음).

```ts
launchOptions: {
  executablePath: '/usr/bin/chromium',
  args: ['--disable-webgl', '--disable-gpu'],
}
```

실제 Android/WebGL 기기의 프레임 속도·효과음 청취는 별도 실기 검증이 필요하다. 저성능 기기는 기존 프레임 예산 때문에 ×16의 실제 진행 속도가 낮아질 수 있다. 이번 로컬 작업은 APK 서명/릴리스 작업을 하지 않았다.

## 검토할 파일

- `src/data/game.json`, `towers.json`, `sim/systems/Stage.ts`, `data/load.ts`: 배속·수치·보스 단계 규칙.
- `view/scenes/Game.ts`, `render/DamageText.ts`, `Fx.ts`, `fxModel.ts`: 치명타 우선 표시·별도 텍스트 풀·타격 효과.
- `art/worker.ts`, `ui/hud/Hud.ts`, `ui/styles.css`: 일꾼 UI.
- `art/characters/sdBoss.ts`, `enemies.ts`, `phaserArt.ts`, `view/render/mobPose.ts`, `MobSprite.ts`, `ui/gallery/Gallery.ts`: 보스 그림과 움직임.
- 테스트 기대 피해량과 리플레이 해시는 의도한 밸런스 변경으로 갱신. 규칙 자체 검사를 약화하지 않음.

데이터 지문이 바뀌므로 기존 정책에 따라 **진행 중이던 판의 자동 저장은 무효화**된다. 계정·설정·전투 기록은 유지된다. 버전/Android versionCode는 이번 패치에서 올리지 않았으므로 실제 배포 시 별도 결정해야 한다.

화면: `docs/screens/battle-update-workers.png`, `battle-update-critical.png`, `battle-update-bosses.png`(19종 검토용 모음).
