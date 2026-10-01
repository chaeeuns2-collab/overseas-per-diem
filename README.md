# 교육공무원 국외여행 체재비

공무원 여비 규정 [별표 1]·[별표 4]와 하나은행 USD 최종 매매기준율로 국외출장 일비·식비·숙박비를 원화로 계산하는 사이트입니다.

- 사이트: https://chaeeuns2-collab.github.io/overseas-per-diem/
- 환율: `rates.json`을 GitHub Actions(`.github/workflows/update-rates.yml`)가 매일 09:00(KST)에 전날 최종 고시환율로 갱신합니다. Actions 탭에서 수동 실행도 됩니다.
- 내 PC에서 실시간(현재 고시) 환율로 쓰기: Node.js 설치 후 `실행.bat` 더블클릭 → http://localhost:8080
