import Dashboard from "../dashboard-client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  if (!(await cookies()).has("sid")) redirect("/login");
  return <Dashboard mode="dashboard" />;
}
