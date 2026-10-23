import { HTTPError } from "../http/HTTPError.js";
import type { Env } from "../Types.js";

/** Public users need no token. Private API deployments may opt in to a server-side secret. */
export class RequestAuthorizer {
  async authorize(request: Request, env: Env, resource: string): Promise<void> {
    if (env.ENABLE_PUBLIC_GENERATION === "false") {
      if (!env.PERSONA_API_TOKEN || env.PERSONA_API_TOKEN.length < 24) {
        throw new HTTPError("Private-mode server token is missing", 503, "NOT_CONFIGURED");
      }
      if (request.headers.get("authorization") !== `Bearer ${env.PERSONA_API_TOKEN}`) {
        throw new HTTPError("Unauthorized", 401, "UNAUTHORIZED");
      }
      return;
    }

    // Abuse protection, not a site-wide allowance; rate-limit binding is approximate.
    const ipAddress = request.headers.get("CF-Connecting-IP") ?? "local";
    const result = await env.PERSONA_RATE_LIMIT.limit({ key: `${ipAddress}:${resource}` });
    if (!result.success) {
      throw new HTTPError("Too many requests, please try again later", 429, "RATE_LIMITED");
    }
  }
}
