# 이수역 남측 횡단보도 실시간 신호

서초구 방배동 495-1 앞 횡단보도(T-Data itstId `23251`, 방배경찰서(연등))의
보행 신호를 폰 웹페이지에서 실시간으로 보여주는 프로젝트.

- 데이터: 서울시 T-Data C-ITS Open API
- 구조: GitHub Pages(정적 PWA, `index.html`) → Cloudflare Worker(`worker/`, 키 보관·CORS·캐시) → T-Data API
- 배경: `HANDOFF.md` 참고 (그동안의 조사 과정, 확정 사실, 설계 근거 전부 기록되어 있음)

**2026-09-15 확인:** T-Data 실시간 API가 정상 동작 중이며(`stop-And-Remain` / `protected-Movement-Allowed` 등
현재 데이터 확인됨), 보행 필드 `wtPdsg`·`stPdsg`가 모두 채워져 있어 **A안(보행 필드 직접 사용)**으로 진행함.
`wtPdsg`가 동작대로를 건너는 집 앞 횡단보도로 잠정 확정(시퀀스 분석 근거는 HANDOFF.md 4번 항목).
**현장에서 실제 신호와 한 번 대조해서 확인 필요** — 다르면 `index.html`의 `PRIMARY_FIELD`를
`"stPdsg"`로 바꾸면 된다.

## 배포 순서

### 1) Cloudflare Worker 배포 (키 보관 + CORS + 캐시)

```bash
cd worker
npm install -g wrangler   # 이미 있으면 생략
wrangler login            # Cloudflare 계정 로그인 (브라우저 열림)
wrangler secret put TDATA_API_KEY
# 프롬프트가 뜨면 HANDOFF.md에 있는 T-Data API 키를 붙여넣기
wrangler deploy
```

배포되면 `https://isu-crosswalk-signal.<계정>.workers.dev` 같은 주소가 나온다.
그 주소를 적어둘 것 — 3번에서 `index.html`에 넣어야 한다.

`index.js` 상단의 `ALLOWED_ORIGIN`은 지금 `https://<GITHUB-ID>.github.io`로
placeholder만 되어 있다. 2번에서 GitHub Pages 주소가 확정되면 이 값을 실제 주소로
바꾸고 `wrangler deploy`를 한 번 더 실행해야 CORS가 통과한다.

### 2) GitHub 리포 생성 + Pages 활성화

1. GitHub에 새 리포 생성 (예: `isu-crosswalk-signal`)
2. 이 폴더의 다음 파일들만 커밋 (⚠️ `HANDOFF.md`는 API 키가 들어있으니 **절대 커밋 금지**):
   - `index.html`
   - `manifest.webmanifest`
   - `icons/`
   - `worker/` (키가 하드코딩되어 있지 않으므로 커밋해도 안전)
   - `README.md`
3. 리포 Settings → Pages → Source를 `main` 브랜치 루트(또는 원하는 폴더)로 설정
4. 몇 분 후 `https://<GITHUB-ID>.github.io/<리포이름>/` 로 접속 가능

### 3) 두 주소를 서로 연결

- `worker/index.js`의 `ALLOWED_ORIGIN`을 실제 GitHub Pages 주소로 바꾸고 `wrangler deploy` 재실행
- `index.html`의 `WORKER_BASE`를 실제 Worker 주소로 바꾸고 다시 커밋/푸시
  (Pages는 푸시하면 자동 재배포됨)

### 4) 폰에 추가

Pages 주소를 폰 브라우저(사파리/크롬)로 열고 "홈 화면에 추가"를 하면
`manifest.webmanifest` 덕분에 앱처럼 전체화면으로 뜬다.

## 화면 구성

- 배경 전체가 신호색(빨강/초록/초록 점멸)
- 가운데 큰 숫자: 다음 전환까지 남은 초
- "실시간" / "예측" 배지: 데이터가 최근 것이면 실시간, 데이터가 끊겨서
  알려진 위상 길이(초록 44초 = 점등 12초 + 점멸 32초, 빨강 176초)로
  추정 중이면 예측 표시. 10분 넘게 예측 중이면 강조 경고, 30분 넘으면
  카운트다운을 숨기고 큰 경고문 표시(반드시 눈으로 확인하라는 문구)
- 작은 글씨로 데이터 시각·데이터 나이·(참고용) 반대편 횡단보도(`stPdsg`)와
  차량 신호 상태도 같이 표시 — 방향 매핑이 맞는지 스스로 검증할 수 있게

## 알아둘 점 (HANDOFF.md에서 옮김)

- T-Data 실시간 피드는 과거에 며칠씩 멈춘 이력이 있고, 정상일 때도 응답 지연이
  보통 40~90초 정도 있다. 그래서 화면은 항상 "데이터 나이"를 보여주고,
  오래되면 예측 모드로 전환하도록 만들어져 있다.
- 위상 길이 상수(초록 44초/빨강 176초, 총 주기 220초)는 2026-09-14 16시대
  관측값이다. 시간대별로 다를 수 있으니, `profile_23251.py`로 하루 프로파일을
  더 받으면(`data/profile_23251.csv`) 시간대별 상수로 정교화할 수 있다(선택 사항).
- 하루 호출 쿼터는 1,000건(개발자 활용신청 기준). Worker가 2초 캐시를 걸어두긴
  했지만, 화면을 계속 켜두면(5초 폴링) 쿼터 소진 속도를 가끔 확인할 것.
  필요하면 T-Data 마이페이지에서 "운영계정신청"으로 하루 100,000건까지 올릴 수 있다.

## 남은 할 일

- [ ] 현장에서 실제 신호와 `wtPdsg` 대조 (다르면 `stPdsg`로 교체)
- [ ] Cloudflare Worker 배포 + `ALLOWED_ORIGIN` 실제 값으로 교체
- [ ] GitHub 리포 생성 + Pages 활성화 + `WORKER_BASE` 실제 값으로 교체
- [ ] 폰 홈 화면에 추가해서 며칠 사용해보고 카운트다운 체감 오차 확인
