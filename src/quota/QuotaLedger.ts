import { QuotaPolicy } from "./QuotaPolicy.js";

export interface ObjectSQLStorage {
  exec(query: string, ...params: (string | number)[]): { toArray(): Array<Record<string, unknown>> };
}

export interface ObjectState {
  storage: { sql: ObjectSQLStorage };
}

/** Durable Object. All global quota reservations are serialized by one SQLite UPDATE. */
export class QuotaLedger {
  private readonly policy = new QuotaPolicy();

  constructor(private readonly state: ObjectState) {
    this.state.storage.sql.exec("CREATE TABLE IF NOT EXISTS daily_usage (day TEXT PRIMARY KEY, used INTEGER NOT NULL)");
  }

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname !== "/credits") {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const day = this.policy.utcDay();
    if (request.method === "GET") {
      const limit = Number(new URL(request.url).searchParams.get("limit"));
      return Response.json(this._snapshot(day, limit));
    }
    if (request.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    const body = await request.json() as { limit: number; cost: number };
    if (!Number.isSafeInteger(body.limit) || body.limit < 0 || !Number.isSafeInteger(body.cost) || body.cost < 1 || body.cost > 3) {
      return Response.json({ error: "Invalid quota operation" }, { status: 400 });
    }

    // One atomic SQLite write. Concurrent requests cannot both spend the final credit.
    // Date-partitioned rows reset the allowance at 00:00 UTC.
    if (body.cost > body.limit) {
      return Response.json(this._snapshot(day, body.limit), { status: 429 });
    }
    const rows = this.state.storage.sql.exec(
      "INSERT INTO daily_usage (day, used) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET used = used + excluded.used WHERE used + excluded.used <= ? RETURNING used",
      day, body.cost, body.limit,
    ).toArray();
    return Response.json(this._snapshot(day, body.limit), { status: rows.length ? 200 : 429 });
  }

  private _snapshot(day: string, limit: number) {
    const rows = this.state.storage.sql.exec("SELECT used FROM daily_usage WHERE day = ?", day).toArray();
    const used = Number(rows[0]?.used ?? 0);
    return this.policy.snapshot(day, limit, used);
  }
}
