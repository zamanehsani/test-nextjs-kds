export type OrderStatus =
  "new" | "cooking" | "ready" | "completed" | "cancelled";
export type OrderFilter = "all" | OrderStatus;
export type OrderType = "Dine In" | "Takeaway" | "Delivery";
export type PaymentStatus = "Paid" | "Unpaid";

export interface OrderItem {
  id: string;
  name: string;
  qty: number;
  prepTime: number;
  checked: boolean;
}

export interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  customerNote: string;
  phone: string;
  time: string;
  type: OrderType;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  items: OrderItem[];
}
