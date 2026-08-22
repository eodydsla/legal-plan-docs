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

const prisma = new PrismaClient();
const DOC_DIR = path.join(process.cwd(), "public", "docs");

function read(name: string) {
  return parseCsv(fs.readFileSync(path.join(process.cwd(), "sheets", `${name}.csv`), "utf8"));
}
const num = (v: string) => (v?.trim() ? Number(v) : null);
const bool = (v: string) => ["1", "true", "TRUE", "Y", "y"].includes((v ?? "").trim());
const nil = (v: string) => (v?.trim() ? v.trim() : null);

async function main() {
  await prisma.envPlanEdition.deleteMany();
  await prisma.envPlan.deleteMany();
  await prisma.config.deleteMany();

  const planRows = read("plans");
  const idByCode = new Map<string, string>();

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
        verified: bool(r.verified),
        source: r.source || "neins",
        note: nil(r.note),
        order: Number(r.order || 0),
      },
    });
    idByCode.set(r.code, p.id);
  }

  const edRows = read("editions");
  let withDoc = 0;
  for (const r of edRows) {
    const planId = idByCode.get(r.plan_code);
    if (!planId) {
      console.warn(`  ! ${r.code}: 계획 ${r.plan_code} 없음 — 건너뜀`);
      continue;
    }
    // 원문은 CSV의 파일명이 아니라 실제 파일 존재로 판정한다
    let hasDoc = false;
    let docSize: number | null = null;
    const base = r.doc_file?.trim() ? path.basename(r.doc_file.trim()) : "";
    if (base) {
      const abs = path.join(DOC_DIR, base);
      if (fs.existsSync(abs)) {
        hasDoc = true;
        docSize = fs.statSync(abs).size;
        withDoc++;
      }
    }
    await prisma.envPlanEdition.create({
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
        hasDoc,
        docFile: hasDoc ? base : null,
        docSize,
        sourceUrl: nil(r.source_url),
        note: nil(r.note),
      },
    });
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

  console.log(`계획 ${planRows.length}건 · 차수 ${edRows.length}건 (원문 확보 ${withDoc}건)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
