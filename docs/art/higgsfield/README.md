# 힉스필드 그림 (중간 저장)

- 게임용 그림: `public/assets/characters/` (타워 65·각성 53·적 `enemy_*` 32·인물 `person_*` 9, 투명 WebP, 캐릭터 경계로 잘라 긴 변 256px) + `manifest.json`(external.ts 형식),
  `public/assets/backgrounds/bg_tTT_bB.webp` (테마 10 × 하늘 5구간, 720×1280), `public/assets/cutins/cutin_<보스>.webp` (19, ≤640px), `public/assets/title/` (타이틀 2 + 월드맵 1)
- 원본(1024 PNG)은 힉스필드 계정에 남아 있음: `manifests/*.json`의 job_id로 다시 받을 수 있다. 프롬프트 원문: `gen_queue.json`, `extras_queue.json`, `HIGGSFIELD_PROMPTS.md`
- 원본 → 게임용 변환: `python3 -I tools/prep_hf_assets.py <원본 폴더(characterArt.json·img/ 포함)> public/assets`
- 타워 설명 65종(소개 + 전투, 데이터와 대조 검토 끝): `docs/art/tower_descs.json`
- 아직 게임 코드에 연결하지 않음 (다음 작업: 그림 우선 + 절차 그림 대체, 배경·보스 컷인·타이틀, 한 파일 시험판)
