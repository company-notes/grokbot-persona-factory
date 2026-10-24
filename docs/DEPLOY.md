# Deployment and upgrade

## Upgrade from the existing v0.2 Worker

1. Backup your existing deployment-specific `wrangler.jsonc` (if you added your hostname there). The distributed config is an **unbranded template** with no real customer domain or route.
2. Keep the **existing Worker name** in your deployed config. The default template name is `grokbot-persona-factory`; do not accidentally deploy a second Worker and leave your production domain pointing to the first.
3. Run `npm ci && npm run typecheck && npm test`.
4. Verify `ai.binding=AI`, `durable_objects.bindings` and `migrations` (or the equivalent current Durable Objects class exports) are present in the config. The first deployment automatically provisions the SQLite-backed `QuotaLedger` namespace. Do not delete or rename an existing quota class without an explicit migration plan; the counter would reset.
5. Set `ENABLE_PUBLIC_GENERATION=true`. Set `PUBLIC_DAILY_CREDITS=150` or another appropriate total **site-wide credit** count; `0` disables generation.
6. `npx wrangler login`, `npm run deploy:dry`, `npm run deploy`.
7. Verify **Domains & Routes → Custom Domains** still points to this Worker, especially if your former custom route was managed in Wrangler; removing `routes` can change the mapping. Bind your hostname in your account/dashboard or a deployment-local Wrangler file. There is intentionally no built-in deployment-specific hostname setting.
8. Open the website from an incognito session. It must not request API tokens. Verify `/api/v1/quota` and an actual generated draft/avatar, then check Cloudflare Workers AI billing graphs.

## Public AI does not need a token

Visitors do not create a Cloudflare account, and they do not type a Workers AI API token. Cloudflare Workers AI is called through the server-side `env.AI.run(...)` binding. Cloudflare account credentials are needed only by the **operator** to deploy using Wrangler or CI. 

If you previously created the optional `PERSONA_API_TOKEN` secret, it is **ignored in public mode**. You may retain it for future private API mode; it is never embedded into static files.

## Site quota and costs

```jsonc
"vars": {
  "ENABLE_PUBLIC_GENERATION": "true",
  "PUBLIC_DAILY_CREDITS": "150"
}
```

- Each text or text revision consumes **1 site credit**, and a request with a newly generated avatar consumes **3 site credits total** (1 text + 2 avatar). Exporting ZIP, Prompt-only, catalog and preview endpoints do not consume credits.
- The daily allowance applies to **the whole site**, across countries and clients, with persistent SQLite Durable Object storage and one atomic reservation query per request. Reset is **00:00 UTC**, not local midnight.
- If daily credits are exhausted, `/api/v1/drafts` and `/api/v1/personas` respond `429` with `{ "errorCode": "QUOTA_EXHAUSTED" }`. In the UI the user is invited to use Grokbot. Prompt and package APIs continue working.
- This is an **application-level request cap**. It is **not the same as Cloudflare's actual neuron quota or a hard billing cap**; any other Workers AI usage in your account and per-request variable token usage are outside this counter. Keep Cloudflare-level account usage monitoring and alerts on.
- Failed attempted AI calls still consume their reserved site credits so a broken/abused model call cannot be retried infinitely for free. The model API can also fail due to provider-side daily quota or service interruptions. These are communicated as generation failures.
- `PERSONA_RATE_LIMIT` adds short-term request throttling. Cloudflare's binding uses approximate per-location counts, so it must not replace the Durable Object's atomic daily cap.
- If a public Worker is exposed to serious abuse, consider a Cloudflare Turnstile challenge and WAF rules; those require additional operator configuration. Do not add a user-entered AI token workaround.

## Private service mode (optional)

Operators running a non-public worker may set `ENABLE_PUBLIC_GENERATION=false`, and add a private server secret via:

```bash
npx wrangler secret put PERSONA_API_TOKEN
```

The service-to-service caller sends `Authorization: Bearer ...` directly from a trusted server environment. The public UI has **no token box**, so this setting is for headless/automation-only installs. Private generation is not charged against the public daily counter.

## CI / GitHub

Included `.github/workflows/deploy.yml` automatically deploys on every push or merge to `main`, after TypeScript, API and browser end-to-end tests pass. `workflow_dispatch` remains available for manual redeployment. Deployments are serialized via GitHub Actions concurrency. Set GitHub secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (deploy permission, not runtime model token). Upload only your own deploy-specific domain configuration if you need a hostname in CI. Never hard-code personal domains or secrets into the generic repository. Pull requests do not deploy by default.

## Verification checklist

1. `GET /api/v1/quota` returns positive allowance and a UTC reset time, without auth.
2. Three languages are available on the page; `POST /api/v1/prompts` respects the locale.
3. Request with `avatarStyle=cartoon` generates the default illustrated portrait; choose realistic or pencil to compare styles.
4. Generate via `POST /api/v1/drafts` with no token. Observe the available allowance go down by 1 or 2.
5. Test on a staging instance with `PUBLIC_DAILY_CREDITS=0`; direct generation should return `429`, prompt-only and packaging should still succeed.
6. Confirm the production custom domain and Worker route remain unchanged.

## Recommended free-vs-hosted configuration

Cloudflare's 10,000 Neurons/day allocation is shared across the account, not per-application. Inference will stop if that allocation is exhausted on Workers Free, regardless of this application's generous 150-credit hosted quota. Workers Paid is required for paid overage (consult current pricing). The application quota only limits attempts, not their precise Neuron costs; monitor actual spending in Cloudflare and consider Turnstile/WAF for public exposure. For truly zero additional inference charges with the current model combination, set the site quota to 30 credits/day or below and monitor your account-wide usage; this still is not a guarantee because each model invocation varies.

The generic repository deliberately excludes your custom domain. For deployment-specific local overrides, copy `wrangler.jsonc` to `.gitignore`-excluded `wrangler.production.jsonc`, edit its `routes`, and deploy with `npx wrangler deploy --config wrangler.production.jsonc`. Alternatively keep DNS/Custom Domain managed in Cloudflare dashboard. The GitHub workflow deploys the generic configuration automatically on pushes to `main`, targeting the configured Worker name; production hostname routing stays managed in the Cloudflare dashboard unless an operator sets up a separate deployment-specific configuration.
