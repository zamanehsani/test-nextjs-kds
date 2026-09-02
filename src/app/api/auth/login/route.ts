import { NextResponse } from "next/server";
import { extractSid, FRAPPE_URL } from "@/lib/frappe";

export async function POST(request: Request) {
  const response = await fetch(`${FRAPPE_URL}/api/method/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: await request.text(),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({ message: "Login failed" }));
  if (!response.ok) return NextResponse.json(data, { status: response.status });

  const result = NextResponse.json(data);
  const sid = extractSid(response);
  if (sid)
    result.cookies.set("sid", sid, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
  return result;
}
