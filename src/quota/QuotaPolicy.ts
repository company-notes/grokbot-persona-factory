import { ValidationError } from "../Errors.js";
import type { PersonaRequest } from "../Types.js";

export interface QuotaSnapshot {
  day: string;
  limit: number;
  used: number;
  remaining: number;
  resetAt: string;
  creditsPerText: number;
  creditsPerAvatar: number;
}

/** Site credits count model requests, not exact Cloudflare neuron consumption. */
export class QuotaPolicy {
  readonly textCost = 1;
  readonly avatarCost = 2;

  getDailyLimit(raw?: string): number {
    const value = raw ?? "150";
    if (!/^(0|[1-9][0-9]{0,5})$/.test(value)) {
      throw new ValidationError("PUBLIC_DAILY_CREDITS must be an integer from 0 to 999999");
    }
    return Number(value);
  }

  cost(persona: PersonaRequest): number {
    // Revision preserves the avatar instead of regenerating it.
    return this.textCost + (persona.includeAvatar && !persona.revisionInstructions ? this.avatarCost : 0);
  }

  utcDay(at = new Date()): string {
    return at.toISOString().slice(0, 10);
  }

  snapshot(day: string, limit: number, used: number): QuotaSnapshot {
    const nextDay = new Date(`${day}T00:00:00.000Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    return {
      day,
      limit,
      used,
      remaining: Math.max(limit - used, 0),
      resetAt: nextDay.toISOString(),
      creditsPerText: this.textCost,
      creditsPerAvatar: this.avatarCost,
    };
  }
}
