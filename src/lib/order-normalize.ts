import type {
  Order,
  OrderItem,
  OrderStatus,
  OrderType,
  PaymentStatus,
} from "@/types/order";

const types: OrderType[] = ["Dine In", "Takeaway", "Delivery"];
const statuses: OrderStatus[] = [
  "new",
  "cooking",
  "ready",
  "completed",
  "cancelled",
];
const text = (value: unknown, fallback = "") =>
  String(value ?? "").trim() || fallback;
const number = (value: unknown, fallback = 0) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

function first(source: Record<string, unknown>, ...keys: string[]) {
  return keys
    .map((key) => source[key])
    .find((value) => value !== undefined && value !== null && value !== "");
}

function timestamp(value: unknown) {
  const raw = text(value);
  const parsed = new Date(raw.includes("T") ? raw : raw.replace(" ", "T"));
  return Number.isNaN(parsed.getTime())
    ? new Date().toISOString()
    : parsed.toISOString();
}

function itemsFrom(raw: Record<string, unknown>): OrderItem[] {
  const source = ["items", "order_items", "sales_order_items"]
    .map((key) => raw[key])
    .find(Array.isArray);

  return (Array.isArray(source) ? source : [])
    .filter(
      (item): item is Record<string, unknown> =>
        !!item && typeof item === "object",
    )
    .map((item, index) => ({
      id: text(first(item, "name", "item_code"), `item-${index}`),
      name: text(first(item, "item_name", "item_code"), "Item"),
      qty: number(first(item, "qty"), 1),
      prepTime: number(first(item, "prep_time", "custom_prep_time"), 5),
      checked: false,
    }));
}

export function normalizeOrder(value: unknown): Order {
  const input = (value && typeof value === "object" ? value : {}) as Record<
    string,
    unknown
  >;
  const raw = (
    input.data && typeof input.data === "object"
      ? input.data
      : input.message && typeof input.message === "object"
        ? input.message
        : input
  ) as Record<string, unknown>;
  const id = text(first(raw, "id", "name"));
  if (!id) throw new Error("Order payload is missing an id/name");
  const status = text(
    first(raw, "status", "custom_cooking_status"),
    "New",
  ).toLowerCase() as OrderStatus;
  const type = text(
    first(raw, "type", "custom_order_type", "delivery_type"),
    "Takeaway",
  );
  const schedule = Array.isArray(raw.payment_schedule)
    ? (raw.payment_schedule[0] as Record<string, unknown>)
    : null;
  const outstanding = number(
    schedule?.outstanding,
    number(raw.grand_total) - number(raw.advance_paid),
  );
  const ticket = text(raw.custom_kitchen_order_ticket);
  const suffix = (ticket || id).split("-").pop() || id;
  return {
    id,
    orderNumber: text(raw.orderNumber, `#${suffix}`),
    customerName: text(
      first(raw, "customerName", "customer_name", "customer"),
      "Walk-in",
    ),
    phone: text(
      first(raw, "phone", "contact_mobile", "contact_phone", "customer"),
    ),
    time:
      typeof raw.time === "string"
        ? raw.time
        : timestamp(first(raw, "creation", "transaction_date")),
    type: types.includes(type as OrderType) ? (type as OrderType) : "Takeaway",
    paymentStatus:
      text(raw.paymentStatus) === "Paid" || outstanding <= 0
        ? ("Paid" as PaymentStatus)
        : "Unpaid",
    status: statuses.includes(status) ? status : "new",
    items: itemsFrom(raw),
  };
}
