import "server-only";
import { prisma } from "./prisma";

/** 화면 문구는 코드에 박지 않고 Config 에서 읽는다 */
export async function getConfig(): Promise<Record<string, string>> {
  const rows = await prisma.config.findMany();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/** 공개 화면·CSV·관리자가 공유하는 계획 + 차수 묶음 */
export type PlanWithEditions = Awaited<ReturnType<typeof getPlans>>[number];

export async function getPlans({ includeUnpublished = false } = {}) {
  return prisma.envPlan.findMany({
    where: includeUnpublished ? {} : { published: true },
    orderBy: [{ order: "asc" }, { seq: "asc" }],
    include: { editions: { orderBy: { seq: "asc" } } },
  });
}

/**
 * 화면에서 다루기 쉬운 평평한 형태로 바꾼다.
 * 차수는 계획 안에 배열로 남겨 둔다 — 한 계획이 한 엔트리라는 원칙을 여기서 지킨다.
 */
export function toRow(p: PlanWithEditions) {
  const current = p.editions.find((e) => e.isCurrent) ?? p.editions[p.editions.length - 1] ?? null;
  return {
    id: p.id,
    code: p.code,
    seq: p.seq,
    name: p.name,
    category: p.category,
    law: p.law,
    lawUrl: p.lawUrl,
    article: p.article,
    articleUrl: p.articleUrl,
    cycle: p.cycle,
    ministry: p.ministry,
    planner: p.planner,
    scope: p.scope,
    verified: p.verified,
    source: p.source,
    note: p.note,
    published: p.published,
    currentLabel: current?.label ?? null,
    currentPeriod: current?.period ?? null,
    editionCount: p.editions.length,
    docCount: p.editions.filter((e) => e.hasDoc).length,
    editions: p.editions.map((e) => ({
      id: e.id,
      code: e.code,
      seq: e.seq,
      label: e.label,
      period: e.period,
      yearFrom: e.yearFrom,
      yearTo: e.yearTo,
      confidence: e.confidence,
      isCurrent: e.isCurrent,
      hasDoc: e.hasDoc,
      docFile: e.docFile,
      docSize: e.docSize,
      sourceUrl: e.sourceUrl,
      note: e.note,
    })),
  };
}

export type PlanRow = ReturnType<typeof toRow>;
