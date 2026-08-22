import { getPlans, toRow } from "@/lib/data";
import { toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

/**
 * 목록 CSV 내려받기 — 차수마다 한 행이고, 공통번호로 같은 계획임을 표시한다.
 *
 * GET /api/plans/export                 전체
 * GET /api/plans/export?code=EP-001,... 해당 계획만
 */
export async function GET(req: Request) {
  const codeParam = new URL(req.url).searchParams.get("code");
  const codes = codeParam ? new Set(codeParam.split(",").map((s) => s.trim()).filter(Boolean)) : null;

  const rows = (await getPlans()).map(toRow).filter((p) => !codes || codes.has(p.code));

  const headers = [
    "공통번호", "연번", "계획명", "계획부문", "근거법률", "근거조문",
    "차수번호", "차수", "계획기간", "갱신주기", "소관부처", "신뢰도", "현행", "원문", "출처", "비고",
  ];
  const body = rows.flatMap((p) =>
    p.editions.map((e) => [
      p.code, p.seq, p.name, p.category, p.law ? `「${p.law}」` : "", p.article ?? "",
      e.code, e.label ?? "", e.period ?? "", p.cycle ?? "", p.ministry ?? "",
      e.confidence ?? "", e.isCurrent ? "현행" : "", e.hasDoc ? "O" : "",
      p.source, p.note ?? "",
    ]),
  );

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `환경분야_법정계획_${rows.length}건_${stamp}.csv`;

  return new Response(toCsv(headers, body), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="env-plans.csv"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
