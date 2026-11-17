# ART-1 검증과 Claude 인계

기준: `art/chunky-handoff`, `ca86c46d437de7aaeae82c9ba561c1a252442f29`.

## 생성 및 파일 검수

- 타워 65 + 각성 53 + 적 32 + 인물 흉상 9 = 159장. Higgsfield `gpt_image_2_6`, 1:1, medium, 1k PNG.
- 첨부한 운빨존망겜 화면을 우선해 159개 프롬프트를 다시 작성했다. 최종 프롬프트는 `queue.json`, 원문/수정문 해시는 `prompt-audit.json`.
- 총 167회 생성, 최종 159장 선택, 8장 재생성. 최종 작업 ID는 `jobs.json`, 제외한 작업과 이유는 `rejections.json`, 참조 설정은 `generation-config.json`.
- PNG 원본은 로컬 `tmp/chunky_raw/<file>.png`. 원본·임시 스크립트·키는 커밋하지 않는다. 원본 SHA-256은 `asset-verification.json`에 기록했다.
- `python3 -I tools/chunky_build.py tmp/chunky_raw` → **변환 159개 · 없음 0개**. 기존 이름의 WebP 159개가 모두 바뀌었다. manifest·코드·테스트는 변경하지 않았다.
- [159장 확인 그림](contact-sheet-159.png): 각 캐릭터를 밝은 배경과 어두운 배경에 나란히 배치했다. 전체를 12장씩 확대 검수해 눈에 띄는 흰 테두리·잘림 0건. 흰색 부분은 캐릭터 내부 색을 유지한다.
- 자동 여백 검사의 12px 기준에 걸린 5장(person_cedric, person_commander, berserker_awaken, fortuna_awaken, ruin_awaken)은 원본과 변환본에서 윤곽선이 온전히 닫혀 있음을 별도로 확인했다. 실제 캔버스 절단은 없다.
- 긴 변 256px·알파 채널 확인. 빌드에 복사된 파일 159개가 public 원본과 바이트 단위로 일치한다.
- 실제 새 WebP의 기본/각성 53쌍도 비교했다. 투명 캔버스에서 중앙·발밑 정렬 후 불투명도 변화 또는 RGB 차이 합계 120 초과 픽셀 비율의 최솟값은 **41.83%**. 장비·의상 변화는 육안으로도 확인했다. 세부값은 `asset-verification.json`.
- [전투 화면 확인](game-stage1.png): 요청한 E2E가 찍은 412×915 화면에서 새 타워 그림이 실제 전투에 표시됨을 확인했다. 슬롯·받침대·캐릭터 배율은 기존 코드 값이다.

## 실행 검사

- `npm ci`: 통과.
- `npm test`: **69파일, 1,299 통과 · 3 건너뜀**.
- `npm run check`: 타입·결정성·곡선·데이터 표 검사 통과.
- `npm run build`: 통과.
- 요청한 E2E: **10 통과 · 4 실패 · 1 건너뜀 (7.2분)**.
  ```sh
  PW_CHROMIUM_PATH=/usr/bin/chromium E2E_PORT=5196 npx playwright test e2e/art.spec.ts e2e/characters.spec.ts e2e/smoke.spec.ts --trace off
  ```
  미리 설치된 Chromium 156.0.8078.79(Debian) 사용. 브라우저 설치 및 테스트 변경 없음. 건너뜀은 `SAVE_SCREENS=1`일 때만 실행하는 갤러리 스크린샷 테스트다.

| 실패 항목 | 관찰한 실패 지점 |
| --- | --- |
| `art.spec.ts:124` 전투 배경 | 11단계의 새 배경은 잡혔으나 이전 `bg-t01-b1` 텍스처가 10초 안에 제거되지 않음 (`:148`). |
| `art.spec.ts:169` 보스 컷인 | 10단계 이동 후 `boss-cutin` 표시를 10초 안에 관측하지 못함 (`:176`). |
| `smoke.spec.ts:70` 일반 조작 | 90초 전체 제한 초과. 일시정지 메뉴의 [계속] 이후 닫힘 확인 중 (`:118`). |
| `smoke.spec.ts:165` 배속 틱 수 | 기본 배속 틱 수 `10`, 기대값 `>12`에 미달 (`:180`). |

교체 전 기준 커밋 `ca86c46d437de7aaeae82c9ba561c1a252442f29`을 별도 작업 폴더에서 같은 Chromium·수정하지 않은 테스트로 비교했다. 위 **4개 모두 같은 검사 위치에서 재현**됐다. 일반 조작은 똑같이 `smoke.spec.ts:118`에서 90초를 넘었고, 틱 수 역시 `10`으로 같았다. 새 그림 교체로 생긴 실패는 이번 비교에서 확인되지 않았다. 브라우저 검사는 CPU 소프트웨어 그래픽으로 실행했으며, 소프트웨어 렌더링 성능과 기존 배경/컷인 타이밍 흐름의 후속 점검이 필요하다. 위 항목을 통과한 것으로 처리하거나 제한 시간·기대값을 낮추지 않았다.

기준 커밋 비교 명령(본 검사 종료 뒤 단독 실행):

```sh
PW_CHROMIUM_PATH=/usr/bin/chromium E2E_PORT=5197 npx playwright test e2e/art.spec.ts e2e/smoke.spec.ts --grep '전투 배경:|보스 컷인:|고정 틱이 돌고|개발자 모드' --trace off
```

원본 전체 실행 로그와 기준 커밋 로그는 로컬 `tmp/chunky_work/e2e.log`, `tmp/chunky_work/e2e-baseline.log`에 보관한다.

## Claude가 확인할 표시 경로

이 브랜치는 요청대로 에셋과 기록만 바꾼다. 전투 타워와 일반 몹은 외부 WebP를 사용하지만, **전투 보스 19종은 기존 절차 SD 그림을 사용**한다(`src/art/characters/phaserArt.ts`, `enemyCharacterTexture`). 갤러리의 타워·적·인물과 인물 초상 경로도 절차 그림을 사용한다(`src/ui/gallery/Gallery.ts`, `src/art/characters/portraits.ts`). 따라서 캐릭터 갤러리 E2E의 통과만으로 새 WebP가 모든 화면에 표시된다고 판단하면 안 된다.

Claude는 G-1/G-2/G-3 통합 때 외부 그림 표시 경로를 확인하고, 새 PNG 기반 그림과 기존 표정·파츠 애니메이션을 어떻게 연결할지 결정해야 한다. main 푸시는 자동 서명 릴리스를 발생시키므로 이 작업에서는 `art/chunky-handoff`에만 푸시한다.
