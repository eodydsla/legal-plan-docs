import { getConfig, getPlans, toRow } from "@/lib/data";
import { SiteHeader } from "@/components/site-header";
import { PlansExplorer } from "@/components/plans-explorer";

export const dynamic = "force-dynamic";

/**
 * 환경분야 법정계획 목록.
 * 한 계획이 한 행이고, 펼치면 그 계획의 차수(제1차~현행)가 안에 들어 있다.
 */
export default async function PlansPage() {
  const [plans, config] = await Promise.all([getPlans(), getConfig()]);
  const rows = plans.map(toRow);

  const editions = rows.reduce((n, p) => n + p.editionCount, 0);
  const verified = rows.filter((p) => p.verified).length;
  const multi = rows.filter((p) => p.editionCount > 1).length;

  return (
    <>
      <SiteHeader title={config.site_title ?? "환경분야 법정계획"} />
      <main className="page flex flex-col gap-6 py-8">
        <div>
          <h1 className="text-2xl font-bold">{config.site_title}</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{config.site_desc}</p>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            계획 <strong className="num text-foreground">{rows.length}</strong>건 ·
            차수 <strong className="num text-foreground">{editions}</strong>개 ·
            차수가 둘 이상인 계획 <strong className="num text-foreground">{multi}</strong>건 ·
            차수 이력 검증 <strong className="num text-foreground">{verified}</strong>건
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            같은 계획은 공통번호(<code className="rounded bg-muted px-1">EP-001</code>)로 묶여 한 건으로 셉니다.
            차수는 <code className="rounded bg-muted px-1">EP-001-3</code> 처럼 공통번호 뒤에 순번이 붙습니다.
            {config.source_note && ` ${config.source_note}`}
          </p>
        </div>

        <PlansExplorer plans={rows} />
      </main>
    </>
  );
}
