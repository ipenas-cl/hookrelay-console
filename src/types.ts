// Mirrors hookrelay's JSON API (src/store.rs).
export type Status = "pending" | "inflight" | "delivered" | "dead";

export interface Delivery {
  id: number;
  idempotency_key: string;
  source: string;
  status: Status;
  attempts: number;
  next_attempt_at: number;
  last_error: string | null;
  last_status_code: number | null;
  created_at: number;
  updated_at: number;
  delivered_at: number | null;
  payload: string;
}

export interface Stats {
  pending: number;
  inflight: number;
  delivered: number;
  dead: number;
}

export interface ListOptions {
  status?: Status;
  limit?: number;
  before?: number;
}
