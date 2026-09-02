import { NextResponse } from "next/server";
import { authenticatedHeaders, FRAPPE_URL } from "@/lib/frappe";

export async function GET() {
  const response = await fetch(
    `${FRAPPE_URL}/api/method/frappe.auth.get_logged_user`,
    {
      headers: await authenticatedHeaders(),
      cache: "no-store",
    },
  );
  const data = await response
    .json()
    .catch(() => ({ message: "Not signed in" }));
  return NextResponse.json(data, { status: response.status });
}
