import Link from "next/link";
import { LayersIcon } from "lucide-react";

/** 상단 바 — 공개 화면과 관리자에서 같이 쓴다 */
export function SiteHeader({ title, admin = false }: { title: string; admin?: boolean }) {
  return (
    <header className="border-b bg-card">
      <div className="page flex h-14 items-center justify-between gap-4">
        <Link href="/plans" className="flex items-center gap-2 font-bold">
          <LayersIcon className="size-5 text-primary" />
          <span>{title}</span>
          {admin && (
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
              관리자
            </span>
          )}
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/plans" className="text-muted-foreground hover:text-foreground">
            계획 목록
          </Link>
          <Link href="/admin/plans" className="text-muted-foreground hover:text-foreground">
            관리자
          </Link>
        </nav>
      </div>
    </header>
  );
}
