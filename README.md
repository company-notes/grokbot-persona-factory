# Persona Forge — AI agent persona builder

Persona Forge creates reusable, practical AI personalities for Grokbot, AI workplace teammates, managers, and assistants. Creative sets are optional; responsibilities, decision boundaries, speaking style, and realistic workflows are its primary focus.

## v0.3 — public AI, daily free quota, avatar art styles

- **The visitor does not need an API key.** The deployed Worker accesses text and image models through its `AI` binding, which is configured server-side. Nothing is pasted into the browser or disclosed to users.
- **Site-wide daily generation limit:** a SQLite-backed Durable Object stores an atomic allowance ledger. The default is `PUBLIC_DAILY_CREDITS=150`. A text generation or revision costs one *site credit*; a new avatar costs two additional credits (3 total). The reset is **00:00 UTC**. A site credit is **not** a Cloudflare neuron or billing unit.
- **When credits are exhausted:** AI generation stops (HTTP 429 `QUOTA_EXHAUSTED`); users can still fetch a simple Grokbot-ready prompt, use their own Grokbot to generate Markdown, and package the result. No personal Cloudflare AI token requested.
- **Avatar styles:** original cartoon (default), photorealistic, pencil sketch, anime, watercolor, stylized 3D, pixel art. Art styles change only avatar rendering prompts; they do not change the persona's working behavior.
- **Languages:** English, Traditional Chinese, Simplified Chinese for the page, forms, user-facing prompts and persona-output instructions. To improve image quality, the model receives a separate English composition prompt while the user-facing avatar prompt remains localized.
- **Presets:** workplace teammate/manager, personal assistant, original character and interactive NPC; workplace roles stay separated from stable identity and short-lived projects.
- **Reusable deployment:** `wrangler.jsonc` contains no custom domain. Configure your own domain separately in the dashboard or a deployment-specific config.
- **No saved personas:** only the daily site-credit counter is persisted; completed personalities, prompts and avatars are not saved on the server.

## Local setup and deploy

Requires Node.js 22+ and a Cloudflare account for deployment.

```bash
npm ci
npm run typecheck
npm test
npx wrangler login
npm run deploy:dry
npm run deploy
```

**No `wrangler secret put PERSONA_API_TOKEN` is needed for normal public use.** The `ai` binding is included in `wrangler.jsonc`; there is no user-supplied AI key. Wrangler config also provisions the SQLite Durable Object quota store on first deploy.

Site owner can edit the configurable daily limit in `wrangler.jsonc` (150 credits allows 50 combined text+avatar generations if every request includes a new avatar):

```jsonc
"vars": {
  "ENABLE_PUBLIC_GENERATION": "true",
  "PUBLIC_DAILY_CREDITS": "150"
}
```

Setting `PUBLIC_DAILY_CREDITS` to `0` turns off paid inference without blocking prompt generation or packaging. Because all site users share the allowance, it is deliberately not a per-user free tier.

**Private / headless mode:** optional `ENABLE_PUBLIC_GENERATION=false` with a server-side `PERSONA_API_TOKEN` secret continues to protect AI-generating endpoints for trusted API callers. It is not shown in the public website and is not required in the default configuration.

**Cloudflare billing:** Cloudflare Workers AI currently includes 10,000 free Neurons/day per account, with paid-plan overage ($0.011 per 1,000 Neurons above that allocation). Based on one dashboard example showing approximately 275.55 text and 499.20 image neurons, 50 combined jobs consume roughly 38,738 Neurons/day, of which roughly 28,738 would be above the free allocation ($0.32/day when usage elsewhere is zero). These are estimates, not a hard budget limit. On a Workers Free plan Cloudflare blocks model calls once the 10,000-Neuron shared daily allocation is depleted. This site cap does NOT create more Cloudflare free inference.

 credit limits here count requests at an intentionally low site-defined cap, *not exact model charges*. Set account-level usage/budget alarms, WAF/Turnstile protections if abuse increases, and check the real account's AI usage after deployment. Inference is attempted only after the quota reservation; an attempted request consumes its assigned site credits even if the model returns an error.

## API resources

| Method | URL | AI calls | Public by default |
|---|---|---|---|
| GET | `/api/v1/locales/{locale}` | none | yes |
| GET | `/api/v1/presets?locale=en` | none | yes |
| GET | `/api/v1/quota` | none | yes |
| POST | `/api/v1/prompts` | none | yes |
| POST | `/api/v1/drafts` | text, optional image | yes, consumes credits |
| POST | `/api/v1/personas` | text, optional image | yes, consumes credits |
| POST | `/api/v1/packages` | none | yes |

See [`docs/API.md`](docs/API.md) for body formats and curl commands, [`docs/DEPLOY.md`](docs/DEPLOY.md) for updating an existing Cloudflare deployment, and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for module boundaries.

## Code and tests

```text
src/
  ai/           Cloudflare model adapter
  avatar/       avatar art style definitions
  catalog/      persona presets and dynamic fields
  http/         REST endpoints and output
  i18n/         one source of strings for server and website
  package/      ZIP construction
  persona/      validation, shared PromptComposer and orchestration
  quota/        pricing policy, globally serialized SQLite Durable Object, API client
  security/     optional private service auth, public burst controls
public/web/     browser UI, translation client, form, API client, result preview
```

Follow `CODE_PRINCIPLES.md` and `TESTING.md`: DRY, object-oriented state ownership, explicit concerns, no monolithic modules, and real flow tests. Test the API locally with `npm test` and the full browser flow with `npm run test:browser`. The browser E2E suite requires a working Chromium executable and permission to access localhost. The Cloudflare AI binding itself must be smoke-tested on a real Cloudflare staging deployment; in unit tests only model requests are substituted.

GitHub Actions automatically tests and deploys on every push to `main` (including merges); `workflow_dispatch` also supports a manual redeploy. The production deploy is serialized to avoid concurrent releases. Secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are configured only in the repository Actions settings. Suggested repository: `company-notes/grokbot-persona-factory`.

### Example pricing and choosing an allowance

The default 150 hosted credits allow 50 complete text + avatar requests (3 credits each), but are **not 150 free Cloudflare inference units**. In one observed hourly dashboard report, text used 275.55 Neurons and image generation 499.20 Neurons (774.75 combined); 50 similar generations would use roughly 38,738 Neurons, above Cloudflare's 10,000 free Neurons per day. On a paid plan the model inference overage is approximately US$0.32/day or US$9.49/30-day month at that steady rate, **excluding other usage and infrastructure charges**. Text length, image steps, other applications in your Cloudflare account and model pricing can change the actual bill. For Workers Free, reduce the cap to 30 credits (10 combined requests) or use smaller models after testing output quality. Neuron usage needs to be checked in Cloudflare's billing dashboard, not inferred from site credits.

### Deployment-specific hostname

The tracked `wrangler.jsonc` contains no `routes` or `custom_domain` values. Assign your hostname in Cloudflare's dashboard, or copy it to an ignored local `wrangler.production.jsonc` and add your own custom domain, then run `npx wrangler deploy --config wrangler.production.jsonc`. Do not commit this personal configuration. The manual GitHub Action deploys the portable template by default, so confirm an existing Custom Domain remains attached to the same Worker before triggering it.
