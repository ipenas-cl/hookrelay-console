import type { Delivery, ListOptions, Stats } from "./types";

export interface HookrelayClient {
  stats(): Promise<Stats>;
  list(opts?: ListOptions): Promise<Delivery[]>;
  get(id: number): Promise<Delivery>;
  replay(id: number): Promise<void>;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Talks to a running hookrelay instance. */
export class HttpClient implements HookrelayClient {
  constructor(private baseUrl: string, private fetchImpl: typeof fetch = fetch.bind(globalThis)) {}

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, "")}${path}`, init);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, (body as { error?: string }).error ?? res.statusText);
    return body as T;
  }

  stats() {
    return this.req<Stats>("/api/stats");
  }

  async list(opts: ListOptions = {}) {
    const q = new URLSearchParams();
    if (opts.status) q.set("status", opts.status);
    if (opts.limit) q.set("limit", String(opts.limit));
    if (opts.before) q.set("before", String(opts.before));
    const qs = q.toString();
    return (await this.req<{ items: Delivery[] }>(`/api/deliveries${qs ? `?${qs}` : ""}`)).items;
  }

  get(id: number) {
    return this.req<Delivery>(`/api/deliveries/${id}`);
  }

  async replay(id: number) {
    await this.req(`/api/deliveries/${id}/replay`, { method: "POST" });
  }
}

/** In-memory implementation with realistic WhatsApp-style fixtures; same semantics as the server. */
export class MockClient implements HookrelayClient {
  private items: Delivery[];

  constructor(seed: Delivery[] = mockDeliveries()) {
    this.items = seed.map((d) => ({ ...d }));
  }

  async stats(): Promise<Stats> {
    const s: Stats = { pending: 0, inflight: 0, delivered: 0, dead: 0 };
    for (const d of this.items) s[d.status]++;
    return s;
  }

  async list({ status, limit = 50, before }: ListOptions = {}) {
    return this.items
      .filter((d) => (!status || d.status === status) && (!before || d.id < before))
      .sort((a, b) => b.id - a.id)
      .slice(0, limit)
      .map((d) => ({ ...d }));
  }

  async get(id: number) {
    const d = this.items.find((x) => x.id === id);
    if (!d) throw new ApiError(404, "not found");
    return { ...d };
  }

  async replay(id: number) {
    const d = this.items.find((x) => x.id === id);
    if (!d) throw new ApiError(404, "not found");
    if (d.status !== "dead" && d.status !== "delivered") {
      throw new ApiError(409, "only dead or delivered events can be replayed");
    }
    const now = Date.now();
    Object.assign(d, { status: "pending", attempts: 0, next_attempt_at: now, updated_at: now });
  }
}

export function mockDeliveries(now = Date.now()): Delivery[] {
  const msg = (id: string, text: string) =>
    JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{ id: "1029384756", changes: [{ field: "messages", value: { messages: [{ id, type: "text", text: { body: text } }] } }] }],
    });
  const base = { last_error: null, last_status_code: null, delivered_at: null };
  const rows: Delivery[] = [];
  const specs: Array<[Delivery["status"], number, string | null, number | null]> = [
    ["delivered", 1, null, 200],
    ["delivered", 1, null, 200],
    ["delivered", 3, null, 200],
    ["dead", 8, "downstream returned 503 Service Unavailable", 503],
    ["pending", 2, "request error: connection refused", null],
    ["delivered", 1, null, 202],
    ["dead", 1, "downstream returned 422 Unprocessable Entity", 422],
    ["inflight", 0, null, null],
    ["pending", 0, null, null],
    ["delivered", 2, null, 200],
  ];
  specs.forEach(([status, attempts, err, code], i) => {
    const id = i + 1;
    const created = now - (specs.length - i) * 47_000;
    rows.push({
      ...base,
      id,
      idempotency_key: `whatsapp:wamid.HBgL${(1000 + id).toString(36).toUpperCase()}`,
      source: i % 4 === 3 ? "github" : "whatsapp",
      status,
      attempts,
      next_attempt_at: status === "pending" ? now + attempts * 4_000 : created,
      last_error: err,
      last_status_code: code,
      created_at: created,
      updated_at: created + attempts * 1_500,
      delivered_at: status === "delivered" ? created + attempts * 1_500 : null,
      payload: msg(`wamid.${id}`, `Hola, pedido #${4200 + id}`),
    });
  });
  return rows;
}

/** Picks the client from env/URL: `?mock` or VITE_MOCK=1 enables mock mode. */
export function createClient(env = import.meta.env, search = globalThis.location?.search ?? ""): HookrelayClient {
  const params = new URLSearchParams(search);
  if (params.has("mock") || env.VITE_MOCK === "1") return new MockClient();
  return new HttpClient(params.get("api") ?? env.VITE_HOOKRELAY_URL ?? "http://localhost:8080");
}
