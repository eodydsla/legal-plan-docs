# 환경분야 법정계획 — 검색·원문·관리자

`sdgs_dashboard` 의 행정계획(`/plans`) 기능을 환경분야 법정계획으로 옮긴 것이다.
**나중에 `ep_dashboard` 에 붙이는 것이 목표**라 같은 스택·같은 관례로 만들었다
(Next.js 15 App Router + Prisma/SQLite + 서버 액션 + shadcn 계열 UI).

## 행정계획 버전과 결정적으로 다른 점 — 계획과 차수를 나눴다

행정계획 쪽 `Plan` 은 한 행에 `edition`(최신차수) 한 칸만 있어서 과거 차수를 담지 못했다.
환경분야는 5차까지 이어진 계획이 여럿이라 계획과 차수를 두 모델로 나눴다.

```
EnvPlan            한 계획 = 한 행. code(EP-001)가 공통번호다.
  └ EnvPlanEdition 차수. code 는 EP-001-3 처럼 공통번호 + 순번.
```

- **같은 계획은 어디서든 한 건**이다 — 목록도 163건, 계획 수 카운트도 163건.
- 차수는 계획을 펼쳐야 보인다. 목록에는 현행 차수만 요약해 띄운다.
- 차수가 없는 계획도 `EnvPlanEdition` 한 행을 갖는다. "차수 없음"을 빈칸이 아니라
  `confidence='해당없음'` 인 명시적 값으로 두기 위해서다.
- CSV는 차수마다 한 행이되 `공통번호` 열이 같아 계획을 되묶을 수 있고,
  ZIP은 `환경법정계획/EP-001_국가환경종합계획/EP-001-5_….pdf` 로 계획별 폴더에 모인다.
- **신뢰도는 계획이 아니라 차수에 붙는다.** 같은 계획이라도 제1차는 참고, 제5차는 확인일 수 있다.

## 실행

```bash
npm install
npm run db:push          # schema.prisma → SQLite
npm run db:seed          # sheets/*.csv → DB (기존 데이터 전부 삭제 후 재주입)
PORT=8010 npm run dev
```

`.env` 는 `.env.example` 를 복사해 만든다 (`ADMIN_PASSWORD`, `SESSION_SECRET`).

| 경로 | 설명 |
|---|---|
| `/plans` | 공개 목록 — 검색·필터·차수 펼치기·CSV·ZIP |
| `/admin/plans` | 관리자 — 계획/차수 CRUD, 원문 업로드 |
| `/api/plans/export?code=EP-001,…` | 목록 CSV (차수별 행) |
| `/api/plans/download?code=EP-001,…` | 원문 ZIP |

## 데이터 갱신

```bash
npm run data      # → ../data/build-dataset.py : 원 수집분 + 검증결과 → sheets/*.csv
npm run db:seed
```

`npm run db:seed` 는 **DB를 비우고 다시 넣는다.** 관리자에서 손으로 고친 내용은 사라지므로,
고친 내용을 유지하려면 `../data/verified.py` 를 고쳐 CSV부터 다시 만드는 쪽이 맞다.

원문 PDF는 `public/docs/` 에 둔다. 시드는 **파일이 실제로 있는지 확인해** `hasDoc`/`docSize` 를
채우므로, 목록에만 있고 파일이 없으면 내려받기 버튼이 붙지 않는다.

## 주의

- **dev 서버를 켜둔 채 `npm run build` 를 실행하지 말 것.** 둘 다 `.next` 를 써서 dev 서버가 깨진다.
  그렇게 됐으면 `rm -rf .next` 후 재시작.
- Node 18에서는 Tailwind v4 네이티브 모듈이 조용히 빠져 `Cannot find native binding` 이 난다 →
  `npm run fix:node18` 한 번 실행. Node 20+ 를 권장한다.
- 자동화된 테스트는 없다. 확인한 것: 공개 목록 렌더, 로그인 → 관리자 진입,
  CSV 내보내기, 원문 ZIP(계획별 폴더 구조), 프로덕션 빌드.
  서버 액션(계획·차수 CRUD)은 브라우저에서 눌러 봐야 한다.

## ep_dashboard 로 옮길 때

이 앱에서 환경분야 법정계획 전용인 파일은 아래가 전부다. 나머지(`ui/`, `lib/utils`,
`lib/prisma`, `lib/zip`, `lib/auth`, `globals.css`)는 `sdgs_dashboard` 에서 그대로 가져온 것이라
`ep_dashboard` 에 이미 있는 것을 쓰면 된다.

```
prisma/schema.prisma        EnvPlan · EnvPlanEdition 모델 (기존 스키마에 이어 붙이기)
prisma/seed.ts              시드 (기존 seed.ts 에 두 블록만 옮기기)
sheets/plans.csv            데이터
sheets/editions.csv
src/lib/data.ts             getPlans / toRow
src/lib/admin-actions.ts    계획·차수 CRUD 서버 액션
src/components/plans-explorer.tsx
src/app/(public)/plans/page.tsx
src/app/admin/plans/*
src/app/api/plans/*
```

`ep_dashboard` 는 계층 명칭을 하드코딩하지 않는 것이 최우선 제약이므로, 옮길 때
화면 문구(`site_title`·`plan_label`·`edition_label` 등)는 여기처럼 `Config` 테이블에서 읽게 두어야 한다.
