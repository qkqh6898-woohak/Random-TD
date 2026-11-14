# 개발 진행 기록

> 마일스톤을 끝낼 때마다 아래 형식으로 추가한다. 다음 작업자는 여기서 맥락을 얻는다.
>
> ```
> ## M{n} — 제목 (상태: 완료 / 일부 완료 / 보류)
> - 만든 것:
> - 주요 결정:
> - 테스트:
> - 남은 문제 / 다음 작업자에게:
> ```

## 시작 전 상태 (기획 v0.7)

- 기획 문서 13종, 데이터: `src/data/towers.json`(65종), `enemies.json`(몹 13·보스·4천왕·군주·편대), `campaign.json`(테마 10), `maps/crossroads.json`, `maps/circle.json`
- 검사 도구: `python3 tools/gen_tables.py --check`
- 코드 없음. M0부터 시작
- 환경: Node 22, npm 레지스트리 접근 가능, Playwright 1.63 + Chromium 미리 설치, Java·Gradle 있음, **안드로이드 SDK 다운로드(dl.google.com) 차단** → APK 빌드 보류
