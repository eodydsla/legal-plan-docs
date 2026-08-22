"use server";

import fs from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { prisma } from "./prisma";
import { isAdmin } from "./auth";

export type ActionResult = { ok: boolean; message: string };

const DOC_DIR = path.join(process.cwd(), "public", "docs");

const str = (fd: FormData, k: string) => (fd.get(k) as string | null)?.trim() ?? "";
const nil = (fd: FormData, k: string) => str(fd, k) || null;
const int = (fd: FormData, k: string) => {
  const v = str(fd, k);
  return v ? Number(v) : null;
};

async function log(entity: string, entityId: string, action: string, summary: string) {
  await prisma.auditLog.create({ data: { entity, entityId, action, summary } });
}

function done(paths = ["/plans", "/admin/plans"]) {
  for (const p of paths) revalidatePath(p);
}

/* ── 계획 ───────────────────────────────────────── */

/**
 * 계획 저장. id 가 없으면 새로 만든다.
 * 공통번호(code)는 계획의 정체성이므로 새로 만들 때만 정하고, 이후에는 바꾸지 않는다
 * — 이미 나간 CSV·ZIP·링크가 code 로 계획을 가리키고 있기 때문이다.
 */
export async function savePlan(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, message: "권한이 없습니다." };

  const id = str(fd, "id");
  const name = str(fd, "name");
  if (!name) return { ok: false, message: "계획명은 비울 수 없습니다." };

  const data = {
    name,
    category: str(fd, "category") || "기타",
    law: nil(fd, "law"),
    lawUrl: nil(fd, "lawUrl"),
    article: nil(fd, "article"),
    articleUrl: nil(fd, "articleUrl"),
    cycle: nil(fd, "cycle"),
    ministry: nil(fd, "ministry"),
    planner: nil(fd, "planner"),
    scope: nil(fd, "scope"),
    verified: str(fd, "verified") === "on" || str(fd, "verified") === "true",
    source: str(fd, "source") || "neins",
    note: nil(fd, "note"),
  };

  try {
    if (id) {
      await prisma.envPlan.update({ where: { id }, data });
      await log("EnvPlan", id, "update", name);
    } else {
      // 새 계획의 공통번호는 기존 최대값 +1 로 잇는다
      const last = await prisma.envPlan.findFirst({ orderBy: { seq: "desc" } });
      const seq = (last?.seq ?? 0) + 1;
      const created = await prisma.envPlan.create({
        data: { ...data, code: `EP-${String(seq).padStart(3, "0")}`, seq, order: 9000 + seq },
      });
      // 차수가 하나도 없으면 목록에서 안 보이므로 빈 차수 한 행을 같이 만든다
      await prisma.envPlanEdition.create({
        data: {
          code: `${created.code}-1`, planId: created.id, seq: 1,
          confidence: "미확인", isCurrent: true,
        },
      });
      await log("EnvPlan", created.id, "create", `${created.code} ${name}`);
    }
    done();
    return { ok: true, message: "저장했습니다." };
  } catch (e) {
    return { ok: false, message: `저장하지 못했습니다: ${(e as Error).message}` };
  }
}

export async function togglePlanPublished(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, message: "권한이 없습니다." };
  const id = str(fd, "id");
  const plan = await prisma.envPlan.findUnique({ where: { id } });
  if (!plan) return { ok: false, message: "계획을 찾을 수 없습니다." };
  await prisma.envPlan.update({ where: { id }, data: { published: !plan.published } });
  await log("EnvPlan", id, "publish", `${plan.code} → ${!plan.published ? "공개" : "비공개"}`);
  done();
  return { ok: true, message: plan.published ? "비공개로 바꿨습니다." : "공개로 바꿨습니다." };
}

/** 계획을 지우면 그 안의 차수도 같이 지워진다(onDelete: Cascade). */
export async function deletePlan(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, message: "권한이 없습니다." };
  const id = str(fd, "id");
  const plan = await prisma.envPlan.findUnique({ where: { id }, include: { editions: true } });
  if (!plan) return { ok: false, message: "계획을 찾을 수 없습니다." };
  await prisma.envPlan.delete({ where: { id } });
  await log("EnvPlan", id, "delete", `${plan.code} ${plan.name} (차수 ${plan.editions.length}개 포함)`);
  done();
  return { ok: true, message: `${plan.name} 및 차수 ${plan.editions.length}개를 지웠습니다.` };
}

/* ── 차수 ───────────────────────────────────────── */

export async function saveEdition(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, message: "권한이 없습니다." };

  const id = str(fd, "id");
  const planId = str(fd, "planId");
  const isCurrent = str(fd, "isCurrent") === "on" || str(fd, "isCurrent") === "true";

  const data = {
    label: nil(fd, "label"),
    period: nil(fd, "period"),
    yearFrom: int(fd, "yearFrom"),
    yearTo: int(fd, "yearTo"),
    confidence: nil(fd, "confidence"),
    sourceUrl: nil(fd, "sourceUrl"),
    note: nil(fd, "note"),
    isCurrent,
  };

  try {
    const targetPlanId = id
      ? (await prisma.envPlanEdition.findUnique({ where: { id } }))?.planId
      : planId;
    if (!targetPlanId) return { ok: false, message: "계획을 찾을 수 없습니다." };

    // 현행은 계획당 하나만 — 새로 지정하면 나머지를 내린다
    if (isCurrent) {
      await prisma.envPlanEdition.updateMany({
        where: { planId: targetPlanId },
        data: { isCurrent: false },
      });
    }

    if (id) {
      await prisma.envPlanEdition.update({ where: { id }, data });
      await log("EnvPlanEdition", id, "update", data.label ?? "");
    } else {
      const plan = await prisma.envPlan.findUnique({
        where: { id: targetPlanId },
        include: { editions: { orderBy: { seq: "desc" }, take: 1 } },
      });
      if (!plan) return { ok: false, message: "계획을 찾을 수 없습니다." };
      const seq = (plan.editions[0]?.seq ?? 0) + 1;
      const created = await prisma.envPlanEdition.create({
        data: { ...data, planId: targetPlanId, seq, code: `${plan.code}-${seq}` },
      });
      await log("EnvPlanEdition", created.id, "create", `${created.code} ${data.label ?? ""}`);
    }
    done();
    return { ok: true, message: "저장했습니다." };
  } catch (e) {
    return { ok: false, message: `저장하지 못했습니다: ${(e as Error).message}` };
  }
}

export async function deleteEdition(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, message: "권한이 없습니다." };
  const id = str(fd, "id");
  const ed = await prisma.envPlanEdition.findUnique({ where: { id } });
  if (!ed) return { ok: false, message: "차수를 찾을 수 없습니다." };
  const left = await prisma.envPlanEdition.count({ where: { planId: ed.planId } });
  if (left <= 1) {
    return { ok: false, message: "마지막 차수는 지울 수 없습니다. 계획 자체를 지우세요." };
  }
  await prisma.envPlanEdition.delete({ where: { id } });
  await log("EnvPlanEdition", id, "delete", ed.code);
  done();
  return { ok: true, message: `${ed.code} 를 지웠습니다.` };
}

/* ── 원문 파일 ──────────────────────────────────── */

/** 파일명에 쓸 수 없는 글자를 걷어낸다 — 경로 이탈을 막는 첫 번째 방어선이다 */
function safeName(name: string) {
  return path.basename(name).replace(/[\\/:*?"<>|]/g, "_").slice(0, 180);
}

export async function uploadEditionDoc(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, message: "권한이 없습니다." };

  const id = str(fd, "id"); // 차수 id
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "파일을 고르세요." };
  }
  const ed = await prisma.envPlanEdition.findUnique({ where: { id }, include: { plan: true } });
  if (!ed) return { ok: false, message: "차수를 찾을 수 없습니다." };

  const ext = (path.extname(file.name) || ".pdf").replace(".", "");
  // 저장 이름은 충돌하지 않게 차수코드 기준으로 만들고, 사람이 읽는 이름은 title 에 둔다
  const base = safeName(`${ed.code}_${Date.now()}.${ext}`);
  const abs = path.join(DOC_DIR, base);
  if (!abs.startsWith(DOC_DIR + path.sep)) return { ok: false, message: "잘못된 경로입니다." };

  fs.mkdirSync(DOC_DIR, { recursive: true });
  fs.writeFileSync(abs, Buffer.from(await file.arrayBuffer()));

  await prisma.envPlanDoc.create({
    data: {
      planId: ed.planId,
      editionId: ed.id,
      title: file.name,
      file: base,
      ext,
      size: fs.statSync(abs).size,
    },
  });
  await log("EnvPlanDoc", ed.id, "upload", `${ed.code} ${file.name}`);
  done();
  return { ok: true, message: `${file.name} 을(를) 올렸습니다.` };
}

/** 원문 한 건 삭제. fd 의 id 는 EnvPlanDoc.id 다. */
export async function deleteEditionDoc(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, message: "권한이 없습니다." };
  const id = str(fd, "id");
  const doc = await prisma.envPlanDoc.findUnique({ where: { id } });
  if (!doc) return { ok: false, message: "원문을 찾을 수 없습니다." };

  const abs = path.join(DOC_DIR, path.basename(doc.file));
  if (abs.startsWith(DOC_DIR + path.sep) && fs.existsSync(abs)) fs.unlinkSync(abs);

  await prisma.envPlanDoc.delete({ where: { id } });
  await log("EnvPlanDoc", id, "delete", doc.title);
  done();
  return { ok: true, message: `${doc.title} 을(를) 지웠습니다.` };
}
