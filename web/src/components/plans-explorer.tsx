"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ChevronRightIcon, DownloadIcon, ExternalLinkIcon, SearchIcon, XIcon,
  ArchiveIcon, CheckIcon, FileTextIcon,
} from "lucide-react";

export interface EditionRow {
  id: string;
  code: string;
  seq: number;
  label: string | null;
  period: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  confidence: string | null;
  isCurrent: boolean;
  hasDoc: boolean;
  docFile: string | null;
  docSize: number | null;
  sourceUrl: string | null;
  note: string | null;
}

export interface PlanRow {
  id: string;
  code: string;
  seq: number;
  name: string;
  category: string;
  law: string | null;
  lawUrl: string | null;
  article: string | null;
  articleUrl: string | null;
  cycle: string | null;
  ministry: string | null;
  scope: string | null;
  level: string;
  planner: string | null;
  published: boolean;
  verified: boolean;
  source: string;
  note: string | null;
  currentLabel: string | null;
  currentPeriod: string | null;
  editionCount: number;
  docCount: number;
  editions: EditionRow[];
}

/** 신뢰도 배지 — 근거를 못 찾은 항목이 확인된 항목과 같아 보이지 않게 한다 */
const CONF: Record<string, { color: string; bg: string; desc: string }> = {
  확인: { color: "#1F6E31", bg: "rgba(43,138,62,0.10)", desc: "소관부처 공표자료로 확인" },
  참고: { color: "#C2490A", bg: "rgba(232,89,12,0.10)", desc: "2차 출처로만 확인" },
  미확인: { color: "#6C757D", bg: "rgba(173,181,189,0.18)", desc: "계획기간을 특정하지 못함" },
  해당없음: { color: "#5C6369", bg: "rgba(134,142,150,0.12)", desc: "단위별 개별 수립 — 국가 차수 없음" },
};

const SOURCE_LABEL: Record<string, string> = {
  neins: "국토환경정보센터",
  added: "누락 발굴",
  marine: "해양수산부 소관",
};

function fileSize(bytes: number | null) {
  if (!bytes) return "";
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

function ConfBadge({ value }: { value: string | null }) {
  if (!value) return null;
  const c = CONF[value];
  if (!c) return <span className="text-xs text-muted-foreground">{value}</span>;
  return (
    <span
      title={c.desc}
      className="inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[11px] font-medium"
      style={{ color: c.color, background: c.bg }}
    >
      {value}
    </span>
  );
}

export function PlansExplorer({ plans }: { plans: PlanRow[] }) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [ministry, setMinistry] = useState("all");
  const [conf, setConf] = useState("all");
  const [level, setLevel] = useState("국가");
  const [onlyVerified, setOnlyVerified] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const toggleOpen = (code: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  const togglePick = (code: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  const counts = useMemo(() => {
    const cat = new Map<string, number>();
    const min = new Map<string, number>();
    const lvl = new Map<string, number>();
    for (const p of plans) {
      lvl.set(p.level, (lvl.get(p.level) ?? 0) + 1);
      cat.set(p.category, (cat.get(p.category) ?? 0) + 1);
      const m = p.ministry?.trim() || "미지정";
      min.set(m, (min.get(m) ?? 0) + 1);
    }
    return {
      cat: [...cat.entries()].sort((a, b) => b[1] - a[1]),
      lvl: [...lvl.entries()].sort((a, b) => b[1] - a[1]),
      min: [...min.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko")),
    };
  }, [plans]);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return plans.filter((p) => {
      if (onlyVerified && !p.verified) return false;
      if (level !== "all" && p.level !== level) return false;
      if (category !== "all" && p.category !== category) return false;
      if (ministry !== "all" && (p.ministry?.trim() || "미지정") !== ministry) return false;
      // 신뢰도는 차수에 붙어 있으므로 "그 신뢰도의 차수를 가진 계획"을 남긴다
      if (conf !== "all" && !p.editions.some((e) => e.confidence === conf)) return false;
      if (kw) {
        const hay = [
          p.code, p.name, p.law, p.article, p.ministry, p.note,
          ...p.editions.map((e) => `${e.label ?? ""} ${e.period ?? ""}`),
        ].join(" ").toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [plans, q, category, ministry, conf, onlyVerified, level]);

  const isAll =
    level === "all" && category === "all" && ministry === "all" && conf === "all" && !q.trim() && !onlyVerified;
  const target = picked.size ? plans.filter((p) => picked.has(p.code)) : filtered;
  const codesParam = picked.size
    ? [...picked].join(",")
    : isAll
      ? ""
      : filtered.map((p) => p.code).join(",");
  const qs = codesParam ? `?code=${encodeURIComponent(codesParam)}` : "";
  const targetDocs = target.reduce((n, p) => n + p.docCount, 0);

  const reset = () => {
    setQ(""); setCategory("all"); setMinistry("all"); setConf("all"); setOnlyVerified(false); setLevel("all");
  };

  return (
    <div className="flex flex-col gap-4">
      {/* ── 검색·필터 ─────────────────────────────── */}
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 sm:p-4">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="계획명 · 근거법률 · 소관부처 · 차수 · 계획기간으로 검색"
            className="pl-9"
          />
          {q && (
            <button
              onClick={() => setQ("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted"
              aria-label="검색어 지우기"
            >
              <XIcon className="size-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <Facet label="수립 층위" value={level} onChange={setLevel} options={counts.lvl} />
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <Facet label="계획부문" value={category} onChange={setCategory} options={counts.cat} />
          <Facet label="신뢰도" value={conf} onChange={setConf}
                 options={["확인", "참고", "미확인", "해당없음"].map((k) => [k, plans.filter((p) => p.editions.some((e) => e.confidence === k)).length] as [string, number])} />
          <label className="flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" checked={onlyVerified} onChange={(e) => setOnlyVerified(e.target.checked)} />
            <span>차수 검증된 계획만</span>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">소관부처</span>
          <select
            value={ministry}
            onChange={(e) => setMinistry(e.target.value)}
            className="h-8 rounded-md border bg-background px-2 text-sm"
          >
            <option value="all">전체 ({plans.length})</option>
            {counts.min.map(([m, n]) => (
              <option key={m} value={m}>{m} ({n})</option>
            ))}
          </select>
          {!isAll && (
            <Button variant="ghost" size="sm" onClick={reset}>
              <XIcon /> 필터 해제
            </Button>
          )}
        </div>
      </div>

      {/* ── 결과 요약 · 내려받기 ───────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          계획 <strong className="num text-foreground">{filtered.length}</strong>건
          {" · "}차수 <strong className="num text-foreground">{filtered.reduce((n, p) => n + p.editionCount, 0)}</strong>개
          {picked.size > 0 && (
            <>
              {" · "}선택 <strong className="num text-foreground">{picked.size}</strong>건
              <button onClick={() => setPicked(new Set())} className="ml-1.5 underline hover:no-underline">
                선택 해제
              </button>
            </>
          )}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" nativeButton={false} render={<a href={`/api/plans/export${qs}`} />}>
            <DownloadIcon /> CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={targetDocs === 0}
            nativeButton={false}
            render={<a href={`/api/plans/download${qs}`} />}
          >
            <ArchiveIcon /> 원문 {targetDocs}건 ZIP
          </Button>
        </div>
      </div>

      {/* ── 목록 ─────────────────────────────────── */}
      <div className="overflow-hidden rounded-lg border">
        <div className="hidden bg-muted/60 px-3 py-2 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[2rem_5rem_1fr_10rem_9rem_6rem] sm:gap-3">
          <span />
          <span>공통번호</span>
          <span>계획명 · 근거법률</span>
          <span>소관부처</span>
          <span>현행 차수</span>
          <span className="text-right">차수</span>
        </div>

        {filtered.length === 0 && (
          <p className="px-3 py-10 text-center text-sm text-muted-foreground">
            조건에 맞는 계획이 없습니다.
          </p>
        )}

        <ul className="divide-y">
          {filtered.map((p) => {
            const isOpen = open.has(p.code);
            return (
              <li key={p.code} className={cn(isOpen && "bg-muted/30")}>
                <div className="grid grid-cols-[2rem_1fr] items-start gap-3 px-3 py-2.5 sm:grid-cols-[2rem_5rem_1fr_10rem_9rem_6rem]">
                  <div className="flex items-center gap-1 pt-0.5">
                    <input
                      type="checkbox"
                      checked={picked.has(p.code)}
                      onChange={() => togglePick(p.code)}
                      aria-label={`${p.name} 선택`}
                    />
                  </div>

                  <button
                    onClick={() => toggleOpen(p.code)}
                    className="hidden items-center gap-1 self-start pt-0.5 text-left font-mono text-xs text-muted-foreground hover:text-foreground sm:flex"
                    aria-expanded={isOpen}
                  >
                    <ChevronRightIcon className={cn("size-3.5 transition-transform", isOpen && "rotate-90")} />
                    {p.code}
                  </button>

                  <div className="min-w-0">
                    <button onClick={() => toggleOpen(p.code)} className="text-left">
                      <span className="font-medium">{p.name}</span>
                    </button>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span className="rounded bg-muted px-1.5 py-0.5">{p.category}</span>
                      {p.law && (
                        p.lawUrl ? (
                          <a href={p.lawUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:text-foreground hover:underline">
                            「{p.law}」{p.article && ` ${p.article}`}
                            <ExternalLinkIcon className="size-3" />
                          </a>
                        ) : (
                          <span>「{p.law}」{p.article && ` ${p.article}`}</span>
                        )
                      )}
                      {p.cycle && <span>· {p.cycle}</span>}
                      {p.source !== "neins" && (
                        <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-700">
                          {SOURCE_LABEL[p.source] ?? p.source}
                        </span>
                      )}
                      {!p.verified && <span className="text-muted-foreground/70">차수 미검증</span>}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground sm:hidden">
                      {p.ministry} · {p.currentLabel ?? "차수 없음"} {p.currentPeriod}
                    </div>
                  </div>

                  <div className="hidden pt-0.5 text-sm sm:block">{p.ministry ?? "—"}</div>

                  <div className="hidden pt-0.5 text-sm sm:block">
                    {p.currentLabel || p.currentPeriod ? (
                      <>
                        <span className="font-medium">{p.currentLabel || "차수없음"}</span>
                        {p.currentPeriod && <span className="num ml-1 text-muted-foreground">{p.currentPeriod}</span>}
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>

                  <div className="hidden justify-end pt-0.5 sm:flex">
                    <button
                      onClick={() => toggleOpen(p.code)}
                      className="rounded border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"
                    >
                      {p.editionCount}개 {isOpen ? "닫기" : "보기"}
                    </button>
                  </div>
                </div>

                {/* 차수 — 계획 안에 들어간다 */}
                {isOpen && (
                  <div className="border-t bg-background/60 px-3 py-2 sm:pl-[7.5rem]">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-muted-foreground">
                          <th className="py-1 pr-3 font-medium">차수번호</th>
                          <th className="py-1 pr-3 font-medium">차수</th>
                          <th className="py-1 pr-3 font-medium">계획기간</th>
                          <th className="py-1 pr-3 font-medium">신뢰도</th>
                          <th className="py-1 font-medium">원문</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {p.editions.map((e) => (
                          <tr key={e.code} className={cn(e.isCurrent && "font-medium")}>
                            <td className="py-1.5 pr-3 font-mono text-xs text-muted-foreground">{e.code}</td>
                            <td className="py-1.5 pr-3">
                              {e.label || <span className="text-muted-foreground">차수없음</span>}
                              {e.isCurrent && (
                                <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-primary/10 px-1 py-0.5 text-[11px] text-primary">
                                  <CheckIcon className="size-3" /> 현행
                                </span>
                              )}
                            </td>
                            <td className="num py-1.5 pr-3">{e.period || "—"}</td>
                            <td className="py-1.5 pr-3"><ConfBadge value={e.confidence} /></td>
                            <td className="py-1.5">
                              {e.hasDoc && e.docFile ? (
                                <a
                                  href={`/docs/${encodeURIComponent(e.docFile)}`}
                                  className="inline-flex items-center gap-1 text-primary hover:underline"
                                >
                                  <FileTextIcon className="size-3.5" />
                                  내려받기
                                  <span className="num text-xs text-muted-foreground">{fileSize(e.docSize)}</span>
                                </a>
                              ) : (
                                <span className="text-xs text-muted-foreground">없음</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {p.note && (
                      <p className="mt-2 border-t pt-2 text-xs text-muted-foreground">비고 — {p.note}</p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function Facet({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, number][];
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="mr-1 text-muted-foreground">{label}</span>
      <button
        onClick={() => onChange("all")}
        className={cn("rounded px-2 py-0.5 text-xs", value === "all" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70")}
      >
        전체
      </button>
      {options.filter(([, n]) => n > 0).map(([k, n]) => (
        <button
          key={k}
          onClick={() => onChange(k === value ? "all" : k)}
          className={cn("rounded px-2 py-0.5 text-xs", value === k ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70")}
        >
          {k} <span className="num opacity-70">{n}</span>
        </button>
      ))}
    </div>
  );
}
