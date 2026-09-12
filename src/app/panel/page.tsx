import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import Dashboard from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default async function PanelPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/giris");
  return <Dashboard me={user} />;
}
