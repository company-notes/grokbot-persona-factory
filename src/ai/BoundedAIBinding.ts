import type { AiBinding } from "../Types.js";

/**
 * Bounds how long an HTTP request waits for Workers AI.
 * The AI binding does not reliably expose provider-side cancellation:
 * expiring this promise does NOT guarantee inference has stopped or that
 * Cloudflare's AI usage is refunded.
 */
export class AITimeoutError extends Error {
  constructor(reason: string) { super(reason); this.name = "AITimeoutError"; }
}

export class BoundedAIBinding implements AiBinding {
  static readonly totalMs = 140_000;
  private readonly started = Date.now();

  constructor(private readonly upstream: AiBinding, private readonly testLimits?: { totalMs: number; perCallMs: number }) {}

  async run(model: string, input: Record<string, unknown>): Promise<unknown> {
    const remaining = (this.testLimits?.totalMs ?? BoundedAIBinding.totalMs) - (Date.now() - this.started);
    const perCall = model.includes("moondream") ? 12_000
      : model.includes("flux") ? 48_000
        : model.includes("qwen") ? 38_000 : 35_000;
    if (remaining < (this.testLimits ? 1 : 1_000)) throw new AITimeoutError("AI_TIME_BUDGET_EXHAUSTED");
    const duration = Math.min(this.testLimits?.perCallMs ?? perCall, remaining);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.upstream.run(model, input),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new AITimeoutError("AI_CALL_DEADLINE_EXCEEDED")), duration);
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}
