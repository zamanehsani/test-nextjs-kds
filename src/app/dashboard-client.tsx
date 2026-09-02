"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { Badge } from "@/components/ui/badge";
import { LoaderCircle, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizeOrder } from "@/lib/order-normalize";
import type { Order, OrderFilter, OrderStatus } from "@/types/order";
import { toast } from "sonner";

type LoginResult = { message?: string; full_name?: string };

interface PrintJobStatus {
  agent?: string;
  attempts?: number;
  error?: string | null;
  job_id?: string;
  order_id?: string;
  printer?: string;
  status?: string;
  timestamp?: string;
}

const filters: OrderFilter[] = [
  "all",
  "new",
  "cooking",
  "ready",
  "completed",
  "cancelled",
];

const nextStatus: Partial<Record<OrderStatus, OrderStatus>> = {
  new: "cooking",
  cooking: "ready",
  ready: "completed",
};

const statusLabel = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);
const siteNamespace = (
  process.env.NEXT_PUBLIC_SITE_NAMESPACE ||
  `/${process.env.NEXT_PUBLIC_SITE_NAME || "kababrayhan.com"}`
).replace(/^([^/])/, "/$1");

function unpackSocketPayload(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      return unpackSocketPayload(JSON.parse(value));
    } catch {
      return value;
    }
  }
  if (Array.isArray(value)) return unpackSocketPayload(value[0]);
  if (value && typeof value === "object") {
    const payload = value as Record<string, unknown>;
    if (payload.data !== undefined) return unpackSocketPayload(payload.data);
    if (payload.message && typeof payload.message === "object") {
      return unpackSocketPayload(payload.message);
    }
  }
  return value;
}

interface DashboardProps {
  mode: "login" | "dashboard";
}

export default function Dashboard({ mode }: DashboardProps) {
  const router = useRouter();
  const [user, setUser] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("offline");
  const socketRef = useRef<Socket | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<OrderFilter>("all");
  const [selected, setSelected] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [printingOrderId, setPrintingOrderId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(() =>
    new Intl.DateTimeFormat("en-CA").format(new Date()),
  );
  const audio = useRef<HTMLAudioElement | null>(null);

  function mergeOrders(incoming: Order[]) {
    setOrders((current) => {
      const map = new Map(current.map((order) => [order.id, order]));
      incoming.forEach((order) =>
        map.set(order.id, { ...map.get(order.id), ...order }),
      );
      return [...map.values()].sort(
        (a, b) => Date.parse(b.time) - Date.parse(a.time),
      );
    });
  }

  async function loadOrders(date = selectedDate) {
    setLoading(true);
    const response = await fetch(`/api/orders?date=${date}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Could not load today's orders");
    setOrders((await response.json()) as Order[]);
    setLoading(false);
  }

  function connectSocket() {
    socketRef.current?.disconnect();
    const namespace = siteNamespace;
    console.log("namespace", namespace);
    setConnectionStatus("connecting");
    const connection = io(namespace, {
      transports: ["websocket"],
      withCredentials: true,
    });
    console.log("[socket] client created", {
      namespace,
      connected: connection.connected,
      id: connection.id,
    });
    connection.io.engine?.on("upgrade", (transport) => {
      console.log("[socket] transport upgraded", transport.name);
    });
    connection.io.engine?.on("close", (reason) => {
      console.log("[socket] engine closed", reason);
    });
    connection.onAny((event, ...data) =>
      console.log("[socket incoming event]", { event, data }),
    );
    connection.onAnyOutgoing((event, ...data) =>
      console.log("[socket outgoing event]", { event, data }),
    );
    connection.io.engine?.on("packet", (packet) => {
      console.log("[socket packet]", {
        type: packet.type,
        data: packet.data,
      });
    });
    connection.on("print_job_status", (payload: PrintJobStatus) => {
      const orderId = payload.order_id || payload.job_id || "order";
      const printer = payload.printer
        ? `Printer: ${payload.printer}`
        : undefined;

      if (payload.status === "printed") {
        toast.success(`Order ${orderId} printed`, {
          description: printer,
        });
      } else {
        toast.error(`Print failed for ${orderId}`, {
          description: payload.error || printer || "The print job failed.",
        });
      }
    });
    connection.on("print_job", (payload: PrintJobStatus) => {
      const orderId = payload.order_id || payload.job_id || "order";
      const description = payload.printer
        ? `Printer: ${payload.printer}`
        : payload.status
          ? `Status: ${payload.status}`
          : undefined;
      toast.info(`Print job for ${orderId}`, { description });
    });
    const handleNewOrder = (payload: unknown) => {
      console.log("[socket] new order payload", payload);
      try {
        const order = normalizeOrder(unpackSocketPayload(payload));
        mergeOrders([order]);
        toast.success(`New order ${order.orderNumber}`, {
          description: `${order.items.length} item${order.items.length === 1 ? "" : "s"} received`,
        });
        if (audio.current) {
          audio.current.currentTime = 0;
          void audio.current.play().catch(() => undefined);
        }
      } catch (reason) {
        console.error("[socket] invalid new order", reason, payload);
      }
    };
    connection.on("new order", handleNewOrder);
    connection.on("new_order", handleNewOrder);
    connection.on("connect", () => {
      console.log("[socket] connected", {
        id: connection.id,
        namespace,
        transport: connection.io.engine.transport.name,
      });
      setConnectionStatus("connected");
    });
    connection.on("disconnect", (reason) => {
      console.log("[socket] disconnected", { reason, namespace });
      setConnectionStatus("offline");
    });
    connection.on("connect_error", (reason) => {
      const socketError = reason as Error & {
        description?: unknown;
        context?: unknown;
      };
      console.error("[socket] connection error", {
        message: socketError.message,
        namespace,
        description: socketError.description,
        context: socketError.context,
      });
      setConnectionStatus("offline");
      setError(socketError.message);
    });
    connection.io.on("open", () => {
      console.log("[socket manager] open", { namespace });
    });
    connection.io.on("error", (reason) => {
      console.error("[socket manager] error", { namespace, reason });
    });
    connection.io.on("reconnect_attempt", (attempt) => {
      console.log("[socket manager] reconnect attempt", { namespace, attempt });
    });
    connection.io.on("reconnect", (attempt) => {
      console.log("[socket manager] reconnected", { namespace, attempt });
    });
    connection.io.on("reconnect_error", (reason) => {
      console.error("[socket manager] reconnect error", { namespace, reason });
    });
    socketRef.current = connection;
  }

  useEffect(() => {
    if (mode !== "dashboard") return;
    audio.current = new Audio("/notification.mp3");
    audio.current.preload = "auto";
    fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => response.json() as Promise<LoginResult>)
      .then((session) => {
        if (!session.message) {
          router.replace("/login");
          return;
        }
        setUser(session.message);
        void loadOrders(selectedDate)
          .then(() => connectSocket())
          .catch((reason) => {
            setError(
              reason instanceof Error
                ? reason.message
                : "Could not load orders",
            );
            setLoading(false);
          });
      })
      .catch(() => router.replace("/login"));
    // Bootstrap once per route; helpers intentionally use the current session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, router]);

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, []);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ usr: username, pwd: password }),
      });
      const data = (await response.json()) as LoginResult;
      if (!response.ok) throw new Error(data.message || "Login failed");
      const session = (await fetch("/api/auth/me").then((result) =>
        result.json(),
      )) as LoginResult;
      if (!session.message)
        throw new Error("Login succeeded, but the session was not established");
      audio.current = new Audio("/notification.mp3");
      audio.current.preload = "auto";
      setUser(session.message || data.full_name || username);
      setPassword("");
      router.push("/dashboard");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Login failed");
    }
  }

  async function logout() {
    socketRef.current?.disconnect();
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    socketRef.current = null;
    setUser(null);
    setOrders([]);
    setSelected(null);
    setConnectionStatus("offline");
    router.replace("/login");
    router.refresh();
  }

  async function updateStatus(order: Order, status: OrderStatus) {
    setOrders((current) =>
      current.map((item) =>
        item.id === order.id ? { ...item, status } : item,
      ),
    );
    setSelected((current) =>
      current?.id === order.id ? { ...current, status } : current,
    );
    await fetch(`/api/orders/${encodeURIComponent(order.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  }

  function toggleItemChecked(orderId: string, itemId: string) {
    const update = (order: Order) =>
      order.id === orderId
        ? {
            ...order,
            items: order.items.map((item) =>
              item.id === itemId ? { ...item, checked: !item.checked } : item,
            ),
          }
        : order;

    setOrders((current) => current.map(update));
    setSelected((current) => (current ? update(current) : current));
  }

  function canAdvance(order: Order) {
    return (
      order.status !== "cooking" ||
      (order.items.length > 0 && order.items.every((item) => item.checked))
    );
  }

  function handleDateChange(date: string) {
    setSelectedDate(date);
    setOrders([]);
    void loadOrders(date).catch((reason) => {
      setError(
        reason instanceof Error ? reason.message : "Could not load orders",
      );
      setLoading(false);
    });
  }

  async function onPrint(order: Order) {
    setPrintingOrderId(order.id);
    try {
      const response = await fetch(
        `/api/orders/${encodeURIComponent(order.id)}/print`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error("Could not send print job");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Print failed");
    } finally {
      setPrintingOrderId(null);
    }
  }

  const visible = useMemo(
    () =>
      filter === "all"
        ? orders
        : orders.filter((order) => order.status === filter),
    [orders, filter],
  );
  const counts = Object.fromEntries(
    filters.map((key) => [
      key,
      key === "all"
        ? orders.length
        : orders.filter((order) => order.status === key).length,
    ]),
  );

  if (mode === "login") {
    return (
      <main className="grid min-h-screen place-items-center  p-6">
        <section className="w-full max-w-md rounded-2xl bg-white p-8 ">
          <p className="font-mono text-center text-xs uppercase tracking-widest text-slate-500">
            Kabab Al Rayhan Restaurant
          </p>
          <h1 className="mt-4 text-4xl text-center font-bold tracking-tight text-slate-950">
            Kitchen Order
          </h1>
          <p className="mt-4 text-slate-500 text-center">
            Monitor today&apos;s orders and receive new tickets.
          </p>
          <br />
          <form onSubmit={login} className="mt-10 grid gap-5">
            <Label className="grid gap-1 ">
              Username / Email
              <Input
                className="rounded-full"
                placeholder="email/username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
              />
            </Label>
            <Label className="grid gap-1">
              Password
              <Input
                className="rounded-full"
                type="password"
                placeholder="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </Label>
            <Button type="submit" className="rounded-full">
              Sign in <span>→</span>
            </Button>
          </form>
          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 text-sm text-slate-500">
        Checking session...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-950 sm:p-4">
      <header className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-4 border-b border-slate-300 pb-2">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-slate-500">
            Kitchen display / today
          </p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight">Orders</h1>
        </div>
        <Label className="grid gap-1 text-xs text-slate-500">
          <Input
            className="h-9 w-auto rounded-full bg-transparent px-3 text-slate-700"
            type="date"
            value={selectedDate}
            onChange={(event) => handleDateChange(event.target.value)}
          />
        </Label>
        <div className="flex items-center gap-3 text-xs uppercase">
          <span
            className={`h-2.5 w-2.5 rounded-full ${connectionStatus === "connected" ? "bg-emerald-500" : "bg-red-400"}`}
          />
          {connectionStatus}
          <span className="border-l border-slate-300 pl-3 text-slate-500">
            {user}
          </span>
          <Button
            className="px-3 py-2 text-xs bg-transparent text-slate-700 hover:bg-slate-600 hover:text-slate-100"
            onClick={logout}
          >
            Sign out
          </Button>
        </div>
      </header>
      <nav className="mx-auto flex justify-center max-w-7xl flex-wrap gap-2 py-2">
        {filters.map((item) => (
          <Button
            key={item}
            className={
              filter === item
                ? "inline-flex items-center gap-2 bg-slate-950 text-white py-2 px-4 rounded-full hover:text-slate-100"
                : "inline-flex items-center gap-2 border border-slate-300 py-2 px-4 bg-transparent rounded-full text-slate-700 hover:text-slate-100"
            }
            onClick={() => setFilter(item)}
          >
            {statusLabel(item)} <b className="px-2">{counts[item]}</b>
          </Button>
        ))}
      </nav>
      {loading ? (
        <div className="grid min-h-[50vh] place-items-center text-slate-500">
          Loading today&apos;s orders...
        </div>
      ) : visible.length === 0 ? (
        <div className="grid min-h-[50vh] place-items-center font-mono text-2xl tracking-widest text-slate-400">
          KITCHEN CLEAR
        </div>
      ) : (
        <section className="mx-auto pt-4 grid max-w-7xl gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((order) => (
            <Card
              key={order.id}
              className="flex h-full min-h-[280px] cursor-pointer flex-col rounded-4xl border-0 p-3 shadow-none ring-0 transition hover:-translate-y-1 hover:shadow-lg"
              onClick={() => setSelected(order)}
            >
              <div className="flex flex-1 flex-col">
                <div className="flex justify-between gap-3">
                  <div>
                    <strong className="text-xl">{order.orderNumber}</strong>
                    <p className="text-xs text-slate-500">
                      {order.phone || order.customerName}
                    </p>
                  </div>
                  <Badge className="bg-lime-200">
                    {statusLabel(order.status)}
                  </Badge>
                </div>
                <p className="mt-4 border-b border-slate-200 pb-3 text-xs text-slate-500">
                  {order.type} ·{" "}
                  {new Date(order.time).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
                <ul className="mt-4 grid gap-2 py-3 text-sm text-slate-600">
                  {order.items.slice(0, 3).map((item) => (
                    <li key={item.id}>
                      {item.qty} × {item.name}
                    </li>
                  ))}
                </ul>
                {order.items.length > 3 && (
                  <p className="text-xs text-slate-400">
                    +{order.items.length - 3} more item
                    {order.items.length - 3 === 1 ? "" : "s"}
                  </p>
                )}
              </div>

              {nextStatus[order.status] && (
                <Button
                  className="mt-5 w-full justify-center rounded-full py-2"
                  disabled={!canAdvance(order)}
                  onClick={(event) => {
                    event.stopPropagation();
                    void updateStatus(order, nextStatus[order.status]!);
                  }}
                >
                  {canAdvance(order)
                    ? `Move to ${statusLabel(nextStatus[order.status]!)} `
                    : "Check off all items first"}
                </Button>
              )}
            </Card>
          ))}
        </section>
      )}
      {selected && (
        <Dialog className="" onClick={() => setSelected(null)}>
          <DialogContent
            className="max-w-5xl rounded-4xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3">
              <div>
                <strong className="text-2xl">{selected.orderNumber}</strong>
                <p className="text-xs text-slate-500">{selected.id}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-lime-200">
                  {statusLabel(selected.status)}
                </Badge>
                <Button
                  className="rounded-full border border-slate-700 bg-transparent p-2 text-slate-700 hover:bg-slate-700 hover:text-slate-100"
                  onClick={() => void onPrint(selected)}
                  disabled={printingOrderId === selected.id}
                  aria-label={`Print ${selected.orderNumber}`}
                  title="Print order"
                >
                  {printingOrderId === selected.id ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <Printer />
                  )}
                </Button>
                <Button
                  className="rounded-full border border-slate-700 bg-transparent p-2 text-slate-700 hover:bg-slate-700 hover:text-slate-100"
                  onClick={() => setSelected(null)}
                  aria-label="Close order details"
                  title="Close"
                >
                  <X />
                </Button>
              </div>
            </div>
            <div className="grid items-stretch gap-8 md:grid-cols-2">
              <section className="order-2 flex min-h-[340px] flex-col md:order-1">
                <h2 className="text-xl font-bold">Items</h2>
                <ul className="mt-4 min-h-[90px] flex-1 space-y-2 overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {selected.items.map((item) => (
                    <li
                      key={item.id}
                      className="border-b border-slate-200 py-2"
                    >
                      <label
                        className={`flex w-full items-center justify-between gap-3 ${selected.status === "cooking" ? "cursor-pointer" : "cursor-not-allowed opacity-70"}`}
                      >
                        <span className="flex min-w-0 flex-1 items-center gap-3">
                        <input
                          type="checkbox"
                          checked={item.checked}
                          disabled={selected.status !== "cooking"}
                          onChange={() =>
                            toggleItemChecked(selected.id, item.id)
                          }
                          className="h-4 w-4 accent-slate-950"
                        />
                        <span className={item.checked ? "line-through" : ""}>
                          {item.qty} × {item.name}
                        </span>
                        </span>
                        <span className="text-xs text-slate-500">
                          {item.prepTime}m
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                {nextStatus[selected.status] && (
                  <Button
                    className="mt-auto w-full justify-center rounded-full"
                    disabled={!canAdvance(selected)}
                    onClick={() =>
                      void updateStatus(selected, nextStatus[selected.status]!)
                    }
                  >
                    {canAdvance(selected)
                      ? `Move to ${statusLabel(nextStatus[selected.status]!)} `
                      : "Check off all items first"}
                  </Button>
                )}
              </section>

              <section className="order-1 md:order-2">
                <h2 className="text-xl font-bold pb-2">Order details</h2>
                <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 ">
                  <dt className="text-slate-500">Date</dt>
                  <dd className="text-right">
                    {new Date(selected.time).toLocaleDateString()}
                  </dd>
                  <dt className="text-slate-500">Time</dt>
                  <dd className="text-right">
                    {new Date(selected.time).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </dd>
                  <dt className="text-slate-500">Customer</dt>
                  <dd className="text-right">{selected.customerName}</dd>
                  <dt className="text-slate-500">Phone</dt>
                  <dd className="text-right">
                    {selected.phone || "Not provided"}
                  </dd>
                  <dt className="text-slate-500">Order type</dt>
                  <dd className="text-right">{selected.type}</dd>
                  <dt className="text-slate-500">Payment</dt>
                  <dd className="text-right">{selected.paymentStatus}</dd>
                </dl>
              </section>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </main>
  );
}
