import { describe, expect, it, vi } from "vitest";
import { ApiError, HttpClient, MockClient, createClient } from "./api";

describe("MockClient", () => {
  it("computes stats and filters by status, newest first", async () => {
    const c = new MockClient();
    const s = await c.stats();
    expect(s).toEqual({ pending: 2, inflight: 1, delivered: 5, dead: 2 });
    const dead = await c.list({ status: "dead" });
    expect(dead.map((d) => d.id)).toEqual([7, 4]);
  });

  it("replays dead deliveries and enforces server semantics", async () => {
    const c = new MockClient();
    await c.replay(4);
    const d = await c.get(4);
    expect(d.status).toBe("pending");
    expect(d.attempts).toBe(0);
    await expect(c.replay(4)).rejects.toMatchObject({ status: 409 });
    await expect(c.replay(999)).rejects.toBeInstanceOf(ApiError);
  });

  it("supports keyset pagination", async () => {
    const page = await new MockClient().list({ limit: 3, before: 6 });
    expect(page.map((d) => d.id)).toEqual([5, 4, 3]);
  });
});

describe("HttpClient", () => {
  const ok = (body: unknown, status = 200) =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

  it("builds query strings and unwraps items", async () => {
    const f = vi.fn(() => ok({ items: [{ id: 1 }] }));
    const c = new HttpClient("http://relay:8080/", f as unknown as typeof fetch);
    const items = await c.list({ status: "dead", limit: 10 });
    expect(items).toHaveLength(1);
    expect(f).toHaveBeenCalledWith("http://relay:8080/api/deliveries?status=dead&limit=10", undefined);
  });

  it("POSTs replay and surfaces API errors", async () => {
    const f = vi.fn(() => ok({ error: "only dead or delivered events can be replayed" }, 409));
    const c = new HttpClient("http://relay", f as unknown as typeof fetch);
    await expect(c.replay(3)).rejects.toMatchObject({ status: 409, message: "only dead or delivered events can be replayed" });
    expect(f).toHaveBeenCalledWith("http://relay/api/deliveries/3/replay", { method: "POST" });
  });
});

describe("createClient", () => {
  it("selects mock mode from ?mock or VITE_MOCK", () => {
    expect(createClient({} as ImportMetaEnv, "?mock")).toBeInstanceOf(MockClient);
    expect(createClient({ VITE_MOCK: "1" } as unknown as ImportMetaEnv, "")).toBeInstanceOf(MockClient);
    expect(createClient({} as ImportMetaEnv, "?api=http://x")).toBeInstanceOf(HttpClient);
  });
});
