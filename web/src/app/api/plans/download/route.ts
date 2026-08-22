import path from "node:path";
import { getPlans, toRow } from "@/lib/data";
import { createZipStream } from "@/lib/zip";

export const dynamic = "force-dynamic";
/** 큰 PDF를 흘려보내야 하므로 Node 런타임이어야 한다 (Edge 불가) */
export const runtime = "nodejs";

const DOC_DIR = path.join(process.cwd(), "public", "docs");

/**
 * 원문 일괄 내려받기.
 *
 * GET /api/plans/download                 원문이 있는 전체
 * GET /api/plans/download?code=EP-001,... 해당 계획의 원문만
 *
 * ZIP 안에서는 `계획명/차수번호_파일명` 으로 넣어 같은 계획의 차수가 한 폴더에 모이게 한다.
 */
export async function GET(req: Request) {
  const codeParam = new URL(req.url).searchParams.get("code");
  const codes = codeParam ? new Set(codeParam.split(",").map((s) => s.trim()).filter(Boolean)) : null;

  const plans = (await getPlans()).map(toRow).filter((p) => !codes || codes.has(p.code));

  /** 파일명에 쓸 수 없는 글자를 걷어낸다 */
  const safe = (s: string) => s.replace(/[/\\:*?"<>|]/g, "_").slice(0, 120);

  const entries = plans.flatMap((p) => {
    const folder = safe(`${p.code}_${p.name}`);
    // 차수에 붙은 것은 차수번호를, 계획 자료는 '계획자료' 를 앞에 붙여 순서를 잡는다
    const items = [
      ...p.editions.flatMap((e) => e.docs.map((d) => ({ prefix: e.code, doc: d }))),
      ...p.docs.map((d) => ({ prefix: `${p.code}_계획자료`, doc: d })),
    ];
    return items.flatMap(({ prefix, doc }) => {
      const base = path.basename(doc.file);
      const abs = path.resolve(DOC_DIR, base);
      // 경로 이탈 방지 — file 은 DB에서 오지만 파일 접근이므로 한 번 더 막는다
      if (!abs.startsWith(DOC_DIR + path.sep)) return [];
      // ZIP 안에서는 사람이 읽는 원 파일명을 쓴다 (저장은 파일ID로 되어 있다)
      return [{ name: `환경법정계획/${folder}/${prefix}_${safe(doc.title)}`, path: abs }];
    });
  });

  if (!entries.length) {
    return new Response("내려받을 수 있는 원문이 없습니다.", { status: 404 });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `환경분야_법정계획_원문_${entries.length}건_${stamp}.zip`;

  return new Response(createZipStream(entries), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="env-plans.zip"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
