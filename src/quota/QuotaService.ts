import type { Env } from "../Types.js";
import { HTTPError } from "../http/HTTPError.js";
import { QuotaPolicy, type QuotaSnapshot } from "./QuotaPolicy.js";

export class QuotaService {
  private readonly policy = new QuotaPolicy();

  async status(env: Env): Promise<QuotaSnapshot & { enabled: boolean }> {
    const limit = this.policy.getDailyLimit(env.PUBLIC_DAILY_CREDITS);
    const response = await this._ledger(env).fetch(`https://quota.internal/credits?limit=${limit}`);
    this._requireSuccess(response);
    return { ...await response.json() as QuotaSnapshot, enabled: env.ENABLE_PUBLIC_GENERATION !== "false" };
  }

  async reserve(env: Env, cost: number): Promise<void> {
    const limit = this.policy.getDailyLimit(env.PUBLIC_DAILY_CREDITS);
    const response = await this._ledger(env).fetch("https://quota.internal/credits", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ limit, cost }),
    });
    if (response.status === 429) {
      throw new HTTPError("Today's free AI allowance is exhausted. Use the prompt with Grokbot instead.", 429, "QUOTA_EXHAUSTED");
    }
    this._requireSuccess(response);
  }

  cost(persona: Parameters<QuotaPolicy["cost"]>[0]): number {
    return this.policy.cost(persona);
  }

  private _ledger(env: Env) {
    if (!env.QUOTA_LEDGER) {
      throw new HTTPError("Site quota storage is not configured", 503, "QUOTA_NOT_CONFIGURED");
    }
    return env.QUOTA_LEDGER.getByName("public-site-daily-quota");
  }

  private _requireSuccess(response: Response): void {
    if (!response.ok) {
      throw new HTTPError("Unable to verify remaining quota", 503, "QUOTA_UNAVAILABLE");
    }
  }
}
