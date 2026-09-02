import { NextResponse } from "next/server";
import { authenticatedHeaders, FRAPPE_URL } from "@/lib/frappe";

export async function POST(
  _request: Request,
  context: { params: Promise<{ name: string }> },
) {
  const { name } = await context.params;
  const params = new URLSearchParams({ order_name: name });
  const response = await fetch(
    `${FRAPPE_URL}/api/method/pizza_app.api.trigger_print_job?${params}`,
    {
      headers: await authenticatedHeaders(),
      cache: "no-store",
    },
  );
  const data = await response
    .json()
    .catch(() => ({ message: "Could not send print job" }));

  return NextResponse.json(data, { status: response.status });
}
