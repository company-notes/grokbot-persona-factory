import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { QuotaLedger } from "../build/quota/QuotaLedger.js";
import { QuotaPolicy } from "../build/quota/QuotaPolicy.js";

class SQLiteStorage {
  constructor() {
    this.db = new DatabaseSync(":memory:");
  }

  exec(query, ...params) {
    const stmt = this.db.prepare(query);
    if (query.startsWith("CREATE")) {
      stmt.run();
      return { toArray: () => [] };
    }
    return { toArray: () => stmt.all(...params) };
  }
}

function ledger() {
  return new QuotaLedger({ storage: { sql: new SQLiteStorage() } });
}

function grant(quota, limit, cost) {
  return quota.fetch(new Request("https://quota.internal/credits", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ limit, cost }),
  }));
}

test("site-wide credits are persistent and cannot be overspent, even with concurrent requests", async () => {
  const quota = ledger();
  const responses = await Promise.all(Array.from({ length: 30 }, () => grant(quota, 7, 1)));
  assert.equal(responses.filter((result) => result.status === 200).length, 7);
  assert.equal(responses.filter((result) => result.status === 429).length, 23);
  const status = await quota.fetch(new Request("https://quota.internal/credits?limit=7"));
  const credits = await status.json();
  assert.equal(credits.used, 7);
  assert.equal(credits.remaining, 0);
  assert.match(credits.resetAt, /T00:00:00.000Z$/);
});

test("avatar generation costs three credits, while text and revisions cost one", async () => {
  const policy = new QuotaPolicy();
  assert.equal(policy.cost({ includeAvatar: true }), 3);
  assert.equal(policy.cost({ includeAvatar: false }), 1);
  assert.equal(policy.cost({ includeAvatar: true, revisionInstructions: "shorten" }), 1);
  const quota = ledger();
  assert.equal((await grant(quota, 4, 3)).status, 200);
  assert.equal((await grant(quota, 4, 3)).status, 429);
  assert.equal((await grant(quota, 4, 1)).status, 200);
  assert.equal((await grant(quota, 4, 1)).status, 429);
});

test("zero-credit allowance rejects model requests and still reports status", async () => {
  const quota = ledger();
  assert.equal((await grant(quota, 0, 1)).status, 429);
  assert.equal((await (await quota.fetch(new Request("https://quota.internal/credits?limit=0"))).json()).remaining, 0);
});

test("default hosted allowance offers 50 combined requests or 150 text requests", async () => {
  const policy = new QuotaPolicy();
  assert.equal(policy.getDailyLimit(), 150);
  assert.equal(policy.getDailyLimit("150"), 150);
  assert.equal(policy.cost({ includeAvatar: true }), 3);
  assert.equal(policy.getDailyLimit() / policy.cost({ includeAvatar: true }), 50);
  assert.equal(policy.getDailyLimit() / policy.cost({ includeAvatar: false }), 150);
});
