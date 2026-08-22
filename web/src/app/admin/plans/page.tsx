import Link from "next/link";
import { getPlans, toRow } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { DownloadIcon, ArchiveIcon } from "lucide-react";
import { PlanManager } from "./plan-manager";

export const dynamic = "force-dynamic";

export default async function AdminPlansPage() {
  const rows = (await getPlans({ includeUnpublished: true })).map(toRow);

  const editions = rows.reduce((n, p) => n + p.editionCount, 0);
  const docs = rows.reduce((n, p) => n + p.docCount, 0);
  const hidden = rows.filter((p) => !p.published).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">환경분야 법정계획 관리</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            계획 {rows.length}건 · 차수 {editions}개 · 원문 {docs}건
            {hidden > 0 && ` · 비공개 ${hidden}건`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            같은 계획은 공통번호로 묶여 한 건입니다. 계획을 펼쳐 그 안에서 차수를 더하거나 고치세요.
            원문 PDF는 <code className="rounded bg-muted px-1">public/docs/</code> 에 저장되며 차수 단위로 붙습니다.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            목록을 통째로 갈아끼울 때는 <code className="rounded bg-muted px-1">npm run data</code> →{" "}
            <code className="rounded bg-muted px-1">npm run db:seed</code> 를 쓰세요 (기존 편집분은 지워집니다).
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/api/plans/export" />}>
            <DownloadIcon /> 목록 CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={docs === 0}
            nativeButton={false}
            render={<Link href="/api/plans/download" />}
          >
            <ArchiveIcon /> 원문 {docs}건 ZIP
          </Button>
        </div>
      </div>

      <PlanManager plans={rows} />
    </div>
  );
}
