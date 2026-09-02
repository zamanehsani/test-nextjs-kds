import { NextResponse } from "next/server";
import { authenticatedHeaders, FRAPPE_URL } from "@/lib/frappe";

export async function POST() {
  try {
    await fetch(`${FRAPPE_URL}/api/method/logout`, {
      method: "POST",
      headers: await authenticatedHeaders(),
      cache: "no-store",
    });
  } catch (error) {
    console.error("[auth] upstream logout failed:", error);
  }

  const result = NextResponse.json({ message: "Logged out" });
  result.cookies.set("sid", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: new Date(0),
    path: "/",
  });
  return result;
}
