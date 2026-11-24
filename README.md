# ODDS LENS LIVE

배트맨 프로토 승부식의 현재 회차 배당·배당 변경 이력·구매 건수를 10분마다 자동으로 받아와서, ODDS LENS 모델로 판정해 보여주는 페이지.

- 페이지: https://minhu8238.github.io/odds-lens/
- 자동 수집: `.github/workflows/scrape.yml` (10분마다, Actions 탭에서 수동 실행 가능)
- 데이터: `data/latest.json` (현재 회차), `data/hist/<회차>.json` (경기별 시간대 기록: 배당이 바뀌거나 60분마다 [분 단위 시각, 배당3, 구매건수3])

판정 기준: 축구 일반 후보만 실전 검증 통과(2024년 이후 ROI −6.3%, 아무거나 −15.5%). 피하기는 6개 시장 검증. 어떤 등급도 기대 ROI는 마이너스.
