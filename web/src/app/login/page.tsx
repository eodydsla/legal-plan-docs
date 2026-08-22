import { redirect } from "next/navigation";
import { login, isAdmin } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const dynamic = "force-dynamic";

/**
 * 관리자 로그인. 비밀번호는 .env 의 ADMIN_PASSWORD 하나뿐이다 —
 * 편집자가 소수인 내부 도구라 계정 테이블을 두지 않았다.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  if (await isAdmin()) redirect(next || "/admin/plans");

  async function submit(fd: FormData) {
    "use server";
    const ok = await login(String(fd.get("password") ?? ""));
    redirect(ok ? String(fd.get("next") || "/admin/plans") : "/login?error=1");
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-4">
      <div>
        <h1 className="text-xl font-bold">관리자 로그인</h1>
        <p className="mt-1 text-sm text-muted-foreground">환경분야 법정계획 관리</p>
      </div>
      <form action={submit} className="flex flex-col gap-3">
        <input type="hidden" name="next" value={next ?? ""} />
        <Input name="password" type="password" placeholder="비밀번호" autoFocus required />
        {error && <p className="text-sm text-destructive">비밀번호가 맞지 않습니다.</p>}
        <Button type="submit">로그인</Button>
      </form>
    </main>
  );
}
