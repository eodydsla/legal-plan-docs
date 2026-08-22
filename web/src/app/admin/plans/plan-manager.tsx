"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  savePlan, deletePlan, togglePlanPublished,
  saveEdition, deleteEdition, uploadEditionDoc, deleteEditionDoc,
  type ActionResult,
} from "@/lib/admin-actions";
import type { PlanRow } from "@/components/plans-explorer";
import {
  ChevronRightIcon, PencilIcon, PlusIcon, SearchIcon, Trash2Icon,
  EyeIcon, EyeOffIcon, UploadIcon, FileXIcon, XIcon,
} from "lucide-react";

const CATEGORIES = ["기본계획", "종합계획", "시행계획", "관리계획", "실시계획", "세부계획", "실천계획", "기타"];
const CONFIDENCES = ["확인", "참고", "미확인", "해당없음"];
const SOURCES = [
  ["neins", "국토환경정보센터"],
  ["added", "누락 발굴"],
  ["marine", "해양수산부 소관"],
];

/** 서버 액션을 부르고 결과를 토스트로 알린다 — 액션마다 반복되던 코드를 한 곳에 모았다 */
function useAction() {
  const [pending, start] = useTransition();
  const run = (fn: (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>, fd: FormData, after?: () => void) =>
    start(async () => {
      const r = await fn(null, fd);
      if (r.ok) {
        toast.success(r.message);
        after?.();
      } else {
        toast.error(r.message);
      }
    });
  return { pending, run };
}

function fd(obj: Record<string, string | boolean | undefined>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    f.set(k, typeof v === "boolean" ? (v ? "true" : "") : v);
  }
  return f;
}

export function PlanManager({ plans }: { plans: PlanRow[] }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [editPlan, setEditPlan] = useState<PlanRow | "new" | null>(null);
  const [editEdition, setEditEdition] = useState<
    { planId: string; planName: string; edition: PlanRow["editions"][number] | null } | null
  >(null);
  const { pending, run } = useAction();

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return plans;
    return plans.filter((p) =>
      [p.code, p.name, p.law, p.ministry, p.category].join(" ").toLowerCase().includes(kw),
    );
  }, [plans, q]);

  const toggle = (code: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-60 flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="계획명·근거법률·부처 검색" className="pl-9" />
        </div>
        <Button size="sm" onClick={() => setEditPlan("new")}>
          <PlusIcon /> 계획 추가
        </Button>
        <span className="text-sm text-muted-foreground">{filtered.length}건</span>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <ul className="divide-y">
          {filtered.map((p) => {
            const isOpen = open.has(p.code);
            return (
              <li key={p.code} className={cn(!p.published && "bg-muted/40", isOpen && "bg-muted/20")}>
                <div className="flex flex-wrap items-start gap-2 px-3 py-2">
                  <button
                    onClick={() => toggle(p.code)}
                    className="flex items-center gap-1 pt-0.5 font-mono text-xs text-muted-foreground hover:text-foreground"
                    aria-expanded={isOpen}
                  >
                    <ChevronRightIcon className={cn("size-3.5 transition-transform", isOpen && "rotate-90")} />
                    {p.code}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2">
                      <span className="font-medium">{p.name}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{p.category}</span>
                      {!p.published && <span className="text-xs text-muted-foreground">비공개</span>}
                      {!p.verified && <span className="text-xs text-muted-foreground/70">미검증</span>}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {p.law && `「${p.law}」 ${p.article ?? ""} · `}
                      {p.ministry} · 차수 {p.editionCount}개
                      {p.docCount > 0 && ` · 원문 ${p.docCount}건`}
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setEditPlan(p)} aria-label="계획 수정">
                      <PencilIcon />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => run(togglePlanPublished, fd({ id: p.id }))}
                      aria-label={p.published ? "비공개로" : "공개로"}
                    >
                      {p.published ? <EyeIcon /> : <EyeOffIcon />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => {
                        if (!confirm(`${p.name} 과(와) 그 안의 차수 ${p.editionCount}개를 지웁니다. 계속할까요?`)) return;
                        run(deletePlan, fd({ id: p.id }));
                      }}
                      aria-label="계획 삭제"
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t bg-background/60 px-3 py-2 sm:pl-10">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">차수 {p.editionCount}개</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditEdition({ planId: p.id, planName: p.name, edition: null })}
                      >
                        <PlusIcon /> 차수 추가
                      </Button>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-muted-foreground">
                          <th className="py-1 pr-3 font-medium">차수번호</th>
                          <th className="py-1 pr-3 font-medium">차수</th>
                          <th className="py-1 pr-3 font-medium">계획기간</th>
                          <th className="py-1 pr-3 font-medium">신뢰도</th>
                          <th className="py-1 pr-3 font-medium">원문</th>
                          <th className="py-1 font-medium" />
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {p.editions.map((e) => (
                          <tr key={e.code}>
                            <td className="py-1.5 pr-3 font-mono text-xs text-muted-foreground">{e.code}</td>
                            <td className="py-1.5 pr-3">
                              {e.label || <span className="text-muted-foreground">차수없음</span>}
                              {e.isCurrent && <span className="ml-1.5 rounded bg-primary/10 px-1 text-[11px] text-primary">현행</span>}
                            </td>
                            <td className="num py-1.5 pr-3">{e.period || "—"}</td>
                            <td className="py-1.5 pr-3 text-xs">{e.confidence ?? "—"}</td>
                            <td className="py-1.5 pr-3">
                              <EditionDoc edition={e} pending={pending} run={run} />
                            </td>
                            <td className="py-1.5 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditEdition({ planId: p.id, planName: p.name, edition: e })}
                                aria-label="차수 수정"
                              >
                                <PencilIcon />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={pending}
                                onClick={() => {
                                  if (!confirm(`${e.code} 차수를 지웁니다. 계속할까요?`)) return;
                                  run(deleteEdition, fd({ id: e.id }));
                                }}
                                aria-label="차수 삭제"
                              >
                                <Trash2Icon />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {editPlan && (
        <PlanDialog
          plan={editPlan === "new" ? null : editPlan}
          pending={pending}
          onSave={(f) => run(savePlan, f, () => setEditPlan(null))}
          onClose={() => setEditPlan(null)}
        />
      )}
      {editEdition && (
        <EditionDialog
          {...editEdition}
          pending={pending}
          onSave={(f) => run(saveEdition, f, () => setEditEdition(null))}
          onClose={() => setEditEdition(null)}
        />
      )}
    </div>
  );
}

function EditionDoc({
  edition, pending, run,
}: {
  edition: PlanRow["editions"][number];
  pending: boolean;
  run: ReturnType<typeof useAction>["run"];
}) {
  if (edition.hasDoc && edition.docFile) {
    return (
      <span className="flex items-center gap-1">
        <a href={`/docs/${encodeURIComponent(edition.docFile)}`} className="text-xs text-primary hover:underline">
          {edition.docFile.slice(0, 24)}…
        </a>
        <button
          disabled={pending}
          onClick={() => {
            if (!confirm("원문 파일을 지웁니다. 계속할까요?")) return;
            run(deleteEditionDoc, fd({ id: edition.id }));
          }}
          className="rounded p-0.5 text-muted-foreground hover:bg-muted"
          aria-label="원문 삭제"
        >
          <FileXIcon className="size-3.5" />
        </button>
      </span>
    );
  }
  return (
    <label className="inline-flex cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
      <UploadIcon className="size-3.5" />
      올리기
      <input
        type="file"
        className="hidden"
        disabled={pending}
        onChange={(ev) => {
          const file = ev.target.files?.[0];
          if (!file) return;
          const f = new FormData();
          f.set("id", edition.id);
          f.set("file", file);
          run(uploadEditionDoc, f);
          ev.target.value = "";
        }}
      />
    </label>
  );
}

/* ── 다이얼로그 ─────────────────────────────────── */

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-lg rounded-lg border bg-card p-4 shadow-lg">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-muted" aria-label="닫기">
            <XIcon className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function PlanDialog({
  plan, pending, onSave, onClose,
}: {
  plan: PlanRow | null;
  pending: boolean;
  onSave: (fd: FormData) => void;
  onClose: () => void;
}) {
  return (
    <Shell title={plan ? `계획 수정 — ${plan.code}` : "계획 추가"} onClose={onClose}>
      <form
        action={(f) => {
          if (plan) f.set("id", plan.id);
          onSave(f);
        }}
        className="grid gap-3 sm:grid-cols-2"
      >
        <div className="sm:col-span-2">
          <Field label="계획명">
            <Input name="name" defaultValue={plan?.name ?? ""} required autoFocus />
          </Field>
        </div>
        <Field label="계획부문">
          <select name="category" defaultValue={plan?.category ?? "기본계획"} className="h-9 rounded-md border bg-background px-2">
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="갱신주기">
          <Input name="cycle" defaultValue={plan?.cycle ?? ""} placeholder="5년 · 10년 · 미규정" />
        </Field>
        <Field label="근거법률">
          <Input name="law" defaultValue={plan?.law ?? ""} />
        </Field>
        <Field label="근거조문">
          <Input name="article" defaultValue={plan?.article ?? ""} placeholder="제14조" />
        </Field>
        <Field label="법령 링크">
          <Input name="lawUrl" defaultValue={plan?.lawUrl ?? ""} />
        </Field>
        <Field label="조문 링크">
          <Input name="articleUrl" defaultValue={plan?.articleUrl ?? ""} />
        </Field>
        <Field label="소관부처">
          <Input name="ministry" defaultValue={plan?.ministry ?? ""} />
        </Field>
        <Field label="계획수립자(원문)">
          <Input name="planner" defaultValue={plan?.planner ?? ""} />
        </Field>
        <Field label="공간범위">
          <Input name="scope" defaultValue={plan?.scope ?? ""} placeholder="전국 · 시도 · 시군구" />
        </Field>
        <Field label="출처">
          <select name="source" defaultValue={plan?.source ?? "neins"} className="h-9 rounded-md border bg-background px-2">
            {SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="비고">
            <Input name="note" defaultValue={plan?.note ?? ""} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="verified" defaultChecked={plan?.verified ?? false} />
          <span>차수 이력을 검증했다</span>
        </label>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="ghost" onClick={onClose}>취소</Button>
          <Button type="submit" disabled={pending}>저장</Button>
        </div>
      </form>
    </Shell>
  );
}

function EditionDialog({
  planId, planName, edition, pending, onSave, onClose,
}: {
  planId: string;
  planName: string;
  edition: PlanRow["editions"][number] | null;
  pending: boolean;
  onSave: (fd: FormData) => void;
  onClose: () => void;
}) {
  return (
    <Shell title={edition ? `차수 수정 — ${edition.code}` : `차수 추가 — ${planName}`} onClose={onClose}>
      <form
        action={(f) => {
          f.set("planId", planId);
          if (edition) f.set("id", edition.id);
          onSave(f);
        }}
        className="grid gap-3 sm:grid-cols-2"
      >
        <Field label="차수">
          <Input name="label" defaultValue={edition?.label ?? ""} placeholder="제5차 · 차수없음 · 제1~3차" autoFocus />
        </Field>
        <Field label="계획기간">
          <Input name="period" defaultValue={edition?.period ?? ""} placeholder="2026~2030" />
        </Field>
        <Field label="시작연도">
          <Input name="yearFrom" type="number" defaultValue={edition?.yearFrom ?? ""} />
        </Field>
        <Field label="종료연도">
          <Input name="yearTo" type="number" defaultValue={edition?.yearTo ?? ""} />
        </Field>
        <Field label="신뢰도">
          <select name="confidence" defaultValue={edition?.confidence ?? "미확인"} className="h-9 rounded-md border bg-background px-2">
            {CONFIDENCES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="출처 링크">
          <Input name="sourceUrl" defaultValue={edition?.sourceUrl ?? ""} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="비고">
            <Input name="note" defaultValue={edition?.note ?? ""} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="isCurrent" defaultChecked={edition?.isCurrent ?? false} />
          <span>현행 차수 (계획당 하나만 — 지정하면 나머지는 내려갑니다)</span>
        </label>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="ghost" onClick={onClose}>취소</Button>
          <Button type="submit" disabled={pending}>저장</Button>
        </div>
      </form>
    </Shell>
  );
}
