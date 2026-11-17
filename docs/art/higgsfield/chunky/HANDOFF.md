# ART-1 캐릭터 그림 교체 — 3행 '통통한 캐주얼' 그림체 (다른 LLM용 작업 안내)

사용자가 고른 그림체: **3행 통통한 캐주얼** (2등신, 둥글고 짧은 팔다리, 점 눈, 굵은 진갈색 윤곽선, 납작한 색 + 그림자 한 단계, 차분한 흙빛 색 + 포인트 색, 반짝이·잔장식 없음).
기준 그림 6장: `docs/art/higgsfield/chunky/reference/{miner,merchant,icemage,summoner,dragoncaller,fate}.webp` (노말→신, 이미 이 규격으로 변환된 결과).

## 범위
- 159장 = 타워 65 + 각성 53 + 적(몹·대장·4천왕·군주) 32 + 인물 흉상 9
- 프롬프트·출력 파일 이름: `docs/art/higgsfield/chunky/queue.json` (`file` · `name` · `kind` · `prompt`) — `tools/make_chunky_queue.py`가 옛 `gen_queue.json`에서 만든 것
- **코드는 바꾸지 않는다.** 바꾸는 것은 `public/assets/characters/*.webp`(이름 그대로 덮어쓰기)와 기록 문서뿐. `manifest.json`은 이름이 같아 그대로 둔다.

## 순서
1. 저장소 `qkqh6898-woohak/Random-TD`, 브랜치 **`art/chunky-handoff`** 에서 작업 (main에서 갈라짐). `npm ci`.
2. 힉스필드 그림 생성 — 모델 **`gpt_image_2_6`**, 비율 **1:1**, 프롬프트 = `queue.json`의 `prompt` 그대로 (159개, 12개씩 묶어 생성).
   - 그림체를 맞추려고 기준 그림 1~2장(`reference/`)을 참조 이미지로 붙여도 된다 (캐릭터 모양은 프롬프트를 따르게).
   - 각 결과를 확인: 캐릭터 1명, 전신(인물은 흉상), 잘림 없음, 흰 배경, 글자·테두리 없음, 그림체가 기준과 같음. 아니면 다시 생성.
   - 원본 PNG를 `tmp/chunky_raw/<file>.png` 로 저장 (`tmp/`는 커밋하지 않는다). 작업 ID는 `docs/art/higgsfield/chunky/jobs.json`에 `{ "<file>": "<job_id>" }`로 기록.
3. 변환: `python3 -I tools/chunky_build.py tmp/chunky_raw` → 흰 배경 제거(가장자리에서 이어진 흰색만) · 캐릭터 경계로 자르기 · 긴 변 256px · WebP → `public/assets/characters/<file>.webp` 159개 덮어쓰기. 출력에 `변환 159개 · 없음 0개`가 나와야 한다.
4. 눈으로 확인: 159개를 어두운 배경·밝은 배경에 모은 한 장(contact sheet)을 만들어 흰 테두리 찌꺼기·잘림이 없는지 본다.
5. 검사: `npm test && npm run check && npm run build`, E2E 일부 `E2E_PORT=5196 npx playwright test e2e/art.spec.ts e2e/characters.spec.ts e2e/smoke.spec.ts --trace off`
   (미리 설치된 Chromium 사용, `playwright install` 금지). 그림 바뀜 때문에 실패하는 테스트가 있으면 약하게 고치지 말고 이유를 적어 보고.
6. `docs/PROGRESS.md` 끝에 "ART-1 캐릭터 그림 3행 통통한 캐주얼로 교체" 절 추가 (장수, 다시 생성한 것, 확인 결과, 남은 문제).
7. 커밋 메시지 `ART-1 캐릭터 그림 3행 통통한 캐주얼로 교체 (159장)` — 끝에 아래 두 줄:
   ```
   Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
   Claude-Session: https://claude.ai/code/session_01TtVcSoY665DmsK6h3dcafN
   ```
8. **`art/chunky-handoff` 브랜치에만 푸시.** main에 직접 푸시하지 않는다 (main 푸시 = 자동 서명 릴리스). 전투·로비 작업(G-1·G-2·G-3)과 Claude가 합쳐서 v0.1.11로 낸다.

## 주의
- 비밀값·키 파일 커밋 금지 (`*.p12`, `*.jks`, `android/.signing/`, `tmp/`).
- 등급 표현은 그림 속 장식이 아니라 게임의 받침대·빛 고리·별 배지(G-2)가 맡는다 — 그림은 단순하게.
