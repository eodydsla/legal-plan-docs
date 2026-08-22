/**
 * sheets/*.csv → SQLite. 기존 데이터를 전부 지우고 다시 넣는다.
 *
 * 실행: npm run db:seed
 * 목록을 통째로 갈아끼울 때는 `npm run data` (→ data/build-dataset.py) 로 CSV를 먼저 다시 만든다.
 *
 * 원문 PDF는 public/docs/ 에 두고, 이 스크립트가 **파일이 실제로 있는지 확인**해
 * hasDoc / docSize 를 채운다. 목록에만 있고 파일이 없으면 내려받기 버튼을 띄우지 않는다.
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { parseCsv } from "../src/lib/csv";

/** 국토환경정보센터 첨부 목록 — data/fetch-docs.py 가 받아 둔 파일과 짝을 맞춘다 */
type Att = { attFilePath: string; attFileName: string; ext?: string };

const prisma = new PrismaClient();
const DOC_DIR = path.join(process.cwd(), "public", "docs");

function read(name: string) {
  return parseCsv(fs.readFileSync(path.join(process.cwd(), "sheets", `${name}.csv`), "utf8"));
}
const num = (v: string) => (v?.trim() ? Number(v) : null);

/** 계획명에서 식별력 있는 낱말만 남긴다 — 원문을 차수에 붙일지 판단하는 데 쓴다 */
const GENERIC = /(기본계획|종합계획|종합대책|기본전략|기본방침|시행계획|관리계획|계획|대책|전략|시책|목표|국가|및|등에|관한)/g;
function keyTokens(name: string): string[] {
  return name
    .replace(GENERIC, " ")
    .split(/[\s·‧,()]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

/**
 * 파일명에서 읽은 차수를 계획의 차수에 붙일지 정한다.
 * 차수 숫자만 맞으면 엉뚱한 계획의 보고서가 붙는다 — 실제로 '제1차 기후변화 대응 기본계획'이
 * '제1차 국가 기후위기 적응대책' 자리에 붙었다. 계획명 낱말이 하나도 없으면 붙이지 않는다.
 */
function editionFor(
  title: string,
  planName: string,
  editions: Map<string, string> | undefined,
): string | null {
  const m = title.match(/제\s*(\d+)\s*차/);
  if (!m || !editions) return null;
  const tokens = keyTokens(planName);
  if (tokens.length && !tokens.some((t) => title.includes(t))) return null;
  return editions.get(`제${m[1]}차`) ?? null;
}
const bool = (v: string) => ["1", "true", "TRUE", "Y", "y"].includes((v ?? "").trim());
const nil = (v: string) => (v?.trim() ? v.trim() : null);

async function main() {
  await prisma.envPlanDoc.deleteMany();
  await prisma.envPlanEdition.deleteMany();
  await prisma.envPlan.deleteMany();
  await prisma.config.deleteMany();

  const planRows = read("plans");
  const idByCode = new Map<string, string>();
  const planNameByCode = new Map<string, string>();

  for (const r of planRows) {
    const p = await prisma.envPlan.create({
      data: {
        code: r.code,
        seq: Number(r.seq || 0),
        name: r.name,
        category: r.category || "기타",
        law: nil(r.law),
        lawUrl: nil(r.law_url),
        article: nil(r.article),
        articleUrl: nil(r.article_url),
        cycle: nil(r.cycle),
        ministry: nil(r.ministry),
        planner: nil(r.planner),
        scope: nil(r.scope),
        level: r.level || "국가",
        verified: bool(r.verified),
        source: r.source || "neins",
        note: nil(r.note),
        order: Number(r.order || 0),
      },
    });
    idByCode.set(r.code, p.id);
    planNameByCode.set(r.code, r.name);
  }

  const edRows = read("editions");
  /** 계획코드 → (차수표기 → 차수id). 원문을 차수에 붙일 때 쓴다. */
  const edByPlan = new Map<string, Map<string, string>>();

  for (const r of edRows) {
    const planId = idByCode.get(r.plan_code);
    if (!planId) {
      console.warn(`  ! ${r.code}: 계획 ${r.plan_code} 없음 — 건너뜀`);
      continue;
    }
    const ed = await prisma.envPlanEdition.create({
      data: {
        code: r.code,
        planId,
        seq: Number(r.seq || 1),
        label: nil(r.label),
        period: nil(r.period),
        yearFrom: num(r.year_from),
        yearTo: num(r.year_to),
        confidence: nil(r.confidence),
        isCurrent: bool(r.is_current),
        sourceUrl: nil(r.source_url),
        note: nil(r.note),
      },
    });
    if (r.label) {
      if (!edByPlan.has(r.plan_code)) edByPlan.set(r.plan_code, new Map());
      edByPlan.get(r.plan_code)!.set(r.label.trim(), ed.id);
    }
  }

  // ── 원문 ──────────────────────────────────────────
  // 첨부 목록의 neins idx 를 계획코드로 되돌린다
  // (build-dataset.py 가 list.json 순서대로 EP-001..EP-150 을 매겼다).
  const raw = path.join(process.cwd(), "..", "data", "raw");
  const listJson = JSON.parse(fs.readFileSync(path.join(raw, "legal-plan-list.json"), "utf8")) as {
    response: { data: { idx: number }[] };
  };
  const idxToCode = new Map<number, string>();
  listJson.response.data.forEach((d, i) => idxToCode.set(d.idx, `EP-${String(i + 1).padStart(3, "0")}`));

  const attJson = JSON.parse(fs.readFileSync(path.join(raw, "legal-plan-files.json"), "utf8")) as Record<
    string,
    Att[]
  >;

  let withDoc = 0;
  let missing = 0;
  const seenFile = new Set<string>();

  for (const [idxStr, atts] of Object.entries(attJson)) {
    const code = idxToCode.get(Number(idxStr));
    const planId = code ? idByCode.get(code) : undefined;
    if (!planId || !code) continue;

    for (const [i, a] of atts.entries()) {
      const file = `${a.attFilePath}.${a.ext || "pdf"}`;
      if (seenFile.has(file)) continue; // 같은 파일이 여러 계획에 붙은 경우 첫 계획에만 단다
      const abs = path.join(DOC_DIR, file);
      if (!fs.existsSync(abs) || fs.statSync(abs).size === 0) {
        missing++;
        continue;
      }
      seenFile.add(file);

      // 파일명에서 차수를 읽어 같은 차수가 있을 때만 연결한다 (없으면 계획 단위 자료)
      const editionId = editionFor(a.attFileName, planNameByCode.get(code) ?? "", edByPlan.get(code));

      await prisma.envPlanDoc.create({
        data: {
          planId,
          editionId,
          title: a.attFileName,
          file,
          ext: a.ext || "pdf",
          size: fs.statSync(abs).size,
          sourceUrl: `https://data.neins.go.kr/kei/legalPlan/file/${a.attFilePath}`,
          order: i,
        },
      });
      withDoc++;
    }
  }
  if (missing) {
    console.log(`  원문 파일 없음 ${missing}건 — 필요하면 python3 ../data/fetch-docs.py --all`);
  }

  // 국토환경정보센터에 없어 부처 자료실에서 따로 받아 온 원문
  // (data/fetch-ministry-docs.py 가 extra-docs.csv 를 만든다)
  const extraPath = path.join(process.cwd(), "..", "data", "extra-docs.csv");
  let extra = 0;
  if (fs.existsSync(extraPath)) {
    for (const r of parseCsv(fs.readFileSync(extraPath, "utf8"))) {
      const planId = idByCode.get(r.plan_code);
      const abs = path.join(DOC_DIR, r.file);
      if (!planId || !fs.existsSync(abs) || seenFile.has(r.file)) continue;
      seenFile.add(r.file);
      const editionId = editionFor(
        r.title,
        planNameByCode.get(r.plan_code) ?? "",
        edByPlan.get(r.plan_code),
      );
      await prisma.envPlanDoc.create({
        data: {
          planId,
          editionId,
          title: r.title,
          file: r.file,
          ext: r.ext || "pdf",
          size: fs.statSync(abs).size,
          sourceUrl: nil(r.source_url),
          order: 90,
        },
      });
      withDoc++;
      extra++;
    }
    console.log(`  부처 자료실 보완 ${extra}건`);
  }

  await prisma.config.createMany({
    data: [
      { key: "site_title", value: "환경분야 법정계획" },
      { key: "site_desc", value: "환경 관련 법정계획을 계획 단위로 모으고, 계획마다 제1차부터 현행 차수까지의 이력을 함께 봅니다." },
      { key: "org_name", value: "한국환경연구원" },
      { key: "plan_label", value: "계획" },
      { key: "edition_label", value: "차수" },
      { key: "source_note", value: "국토환경정보센터 자료제공서비스(data.neins.go.kr) 수집분에 소관부처 공표자료 검증을 더했습니다." },
    ],
  });

  const linked = await prisma.envPlanDoc.count({ where: { editionId: { not: null } } });
  console.log(
    `계획 ${planRows.length}건 · 차수 ${edRows.length}건 · 원문 ${withDoc}건 (차수 연결 ${linked}건)`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
