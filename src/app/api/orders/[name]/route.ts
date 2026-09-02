import { NextResponse } from "next/server";
import { authenticatedHeaders, FRAPPE_URL } from "@/lib/frappe";

export async function PUT(
  request: Request,
  context: { params: Promise<{ name: string }> },
) {
  const { name } = await context.params;
  const body = (await request.json()) as { status?: string };
  if (!body.status)
    return NextResponse.json(
      { message: "Status is required" },
      { status: 400 },
    );
  const response = await fetch(
    `${FRAPPE_URL}/api/resource/Sales%20Order/${encodeURIComponent(name)}`,
    {
      method: "PUT",
      headers: {
        ...(await authenticatedHeaders()),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status: body.status.charAt(0).toUpperCase() + body.status.slice(1),
      }),
      cache: "no-store",
    },
  );
  const data = await response
    .json()
    .catch(() => ({ message: "Could not update order" }));
  return NextResponse.json(data, { status: response.status });
}
