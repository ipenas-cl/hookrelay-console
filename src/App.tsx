import { useCallback, useEffect, useState } from "react";
import type { HookrelayClient } from "./api";
import { prettyJson, relativeTime } from "./format";
import type { Delivery, Stats, Status } from "./types";

const TABS: Array<{ key: Status | "all"; label: string }> = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "inflight", label: "In flight" },
  { key: "delivered", label: "Delivered" },
  { key: "dead", label: "Dead letter" },
];

export function App({ client, refreshMs = 5000, mock = false }: { client: HookrelayClient; refreshMs?: number; mock?: boolean }) {
  const [tab, setTab] = useState<Status | "all">("all");
  const [items, setItems] = useState<Delivery[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selected, setSelected] = useState<Delivery | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, list] = await Promise.all([client.stats(), client.list({ status: tab === "all" ? undefined : tab, limit: 100 })]);
      setStats(s);
      setItems(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [client, tab]);

  useEffect(() => {
    void load();
    if (!refreshMs) return;
    const t = setInterval(() => void load(), refreshMs);
    return () => clearInterval(t);
  }, [load, refreshMs]);

  const replay = async (d: Delivery) => {
    try {
      await client.replay(d.id);
      setNotice(`Delivery #${d.id} re-queued`);
      setSelected(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const replayAllDead = async () => {
    const dead = await client.list({ status: "dead", limit: 500 });
    for (const d of dead) await client.replay(d.id);
    setNotice(`${dead.length} dead deliveries re-queued`);
    await load();
  };

  return (
    <div className="app">
      <header>
        <h1>
          hookrelay <span className="muted">console</span>
        </h1>
        {mock && <span className="badge mock">mock mode</span>}
      </header>

      {stats && (
        <section className="stats" aria-label="queue stats">
          {(["pending", "inflight", "delivered", "dead"] as const).map((k) => (
            <div key={k} className={`stat ${k}`} data-testid={`stat-${k}`}>
              <div className="value">{stats[k]}</div>
              <div className="label">{k}</div>
            </div>
          ))}
        </section>
      )}

      {error && <div role="alert" className="error">{error}</div>}
      {notice && <div role="status" className="notice">{notice}</div>}

      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
        {tab === "dead" && items.length > 0 && (
          <button className="danger" onClick={() => void replayAllDead()}>
            Replay all dead
          </button>
        )}
      </nav>

      <table>
        <thead>
          <tr>
            <th>ID</th><th>Source</th><th>Status</th><th>Attempts</th><th>Last result</th><th>Created</th><th></th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr><td colSpan={7} className="muted">No deliveries</td></tr>
          )}
          {items.map((d) => (
            <tr key={d.id} onClick={() => setSelected(d)} data-testid={`row-${d.id}`}>
              <td>#{d.id}</td>
              <td>{d.source}</td>
              <td><span className={`badge ${d.status}`}>{d.status}</span></td>
              <td>{d.attempts}</td>
              <td className="mono">{d.last_status_code ?? (d.last_error ? "error" : "—")}</td>
              <td title={new Date(d.created_at).toISOString()}>{relativeTime(d.created_at)}</td>
              <td>
                {(d.status === "dead" || d.status === "delivered") && (
                  <button aria-label={`replay ${d.id}`} onClick={(e) => { e.stopPropagation(); void replay(d); }}>
                    Replay
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {selected && (
        <aside className="drawer" aria-label="delivery detail">
          <button className="close" aria-label="close" onClick={() => setSelected(null)}>×</button>
          <h2>Delivery #{selected.id}</h2>
          <dl>
            <dt>Idempotency key</dt><dd className="mono">{selected.idempotency_key}</dd>
            <dt>Status</dt><dd>{selected.status}</dd>
            <dt>Attempts</dt><dd>{selected.attempts}</dd>
            {selected.status === "pending" && (<><dt>Next attempt</dt><dd>{relativeTime(selected.next_attempt_at)}</dd></>)}
            {selected.last_error && (<><dt>Last error</dt><dd className="error-text">{selected.last_error}</dd></>)}
          </dl>
          <h3>Payload</h3>
          <pre>{prettyJson(selected.payload)}</pre>
        </aside>
      )}
    </div>
  );
}
