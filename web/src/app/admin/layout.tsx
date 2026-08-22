import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { SiteHeader } from "@/components/site-header";
import { getConfig } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAdmin())) redirect("/login?next=/admin/plans");
  const config = await getConfig();
  return (
    <>
      <SiteHeader title={config.site_title ?? "환경분야 법정계획"} admin />
      <main className="page py-6">{children}</main>
    </>
  );
}
