import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = (await cookies()).get("sid");
  redirect(session ? "/dashboard" : "/login");
}
