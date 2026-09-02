import { NextResponse } from "next/server";
import { authenticatedHeaders, FRAPPE_URL } from "@/lib/frappe";
import { normalizeOrder } from "@/lib/order-normalize";

function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.TIMEZONE || "Asia/Dhaka",
  }).format(new Date());
}

function isDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function GET(request: Request) {
  const requestedDate =
    new URL(request.url).searchParams.get("date") || today();
  const orderDate = isDate(requestedDate) ? requestedDate : today();
  const headers = await authenticatedHeaders();
  const params = new URLSearchParams({
    filters: JSON.stringify([
      ["docstatus", "=", 1],
      ["creation", "like", `${orderDate}%`],
    ]),
    fields: JSON.stringify(["name"]),
    limit_page_length: "0",
    order_by: "creation asc",
  });
  const listResponse = await fetch(
    `${FRAPPE_URL}/api/resource/Sales%20Order?${params}`,
    { headers, cache: "no-store" },
  );
  if (!listResponse.ok)
    return NextResponse.json(
      { message: "Unable to load orders" },
      { status: listResponse.status },
    );
  const list = (await listResponse.json()) as {
    data?: Array<{ name: string }>;
  };
  const orders = await Promise.all(
    (list.data || []).map(async ({ name }) => {
      const response = await fetch(
        `${FRAPPE_URL}/api/resource/Sales%20Order/${encodeURIComponent(name)}?fields=${encodeURIComponent(JSON.stringify(["*"]))}`,
        { headers, cache: "no-store" },
      );
      if (!response.ok) throw new Error(`Unable to load order ${name}`);
      return normalizeOrder(
        ((await response.json()) as { data: unknown }).data,
      );
    }),
  );
  return NextResponse.json(orders);
}
