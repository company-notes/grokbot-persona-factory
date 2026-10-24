# Persona Forge HTTP API v1

All request body properties use camelCase, and JSON persona values are strings. API responses follow the requested locale (`en`, `zh-hant`, `zh-hans`; legacy `zh-TW` and `zh-CN` accepted). No browser token is needed on the default public installation.

## GET `/api/v1/quota`

Public, no model call:

```json
{
  "day": "2026-10-23",
  "limit": 150,
  "used": 2,
  "remaining": 148,
  "resetAt": "2026-10-24T00:00:00.000Z",
  "creditsPerText": 1,
  "creditsPerAvatar": 2,
  "enabled": true
}
```

All counts apply to the **entire site**, not a user, and are controlled by `PUBLIC_DAILY_CREDITS`. A new avatar adds two site credits to the base text cost. These credits are not Cloudflare neurons or dollar charges.

## GET `/api/v1/presets?locale=en`

Localized persona sets and editable field definitions. The same field IDs apply to all locales.

## GET `/api/v1/locales/en`

Returns the shared UI and form translation dictionary. Options: `en`, `zh-hant`, `zh-hans`.

## POST `/api/v1/prompts`

Public, **never calls AI**. The response includes separate prompts for model-aware Grokbot workflows and `grokbotPrompt` to paste directly into any Grokbot conversation. Works even with zero remaining site credits.

Example:

```json
{
  "presetId": "workplace",
  "locale": "zh-hant",
  "includeAvatar": true,
  "avatarStyle": "cartoon",
  "detailLevel": "standard",
  "values": {
    "name": "小安",
    "department": "研發部",
    "role": "研發部助理",
    "personality": "細心、認真、不猜測技術問題",
    "origin": "臺灣"
  }
}
```

Response:

```json
{
  "presetId": "workplace",
  "presetLabel": "公司員工／主管",
  "displayName": "小安",
  "systemPrompt": "...",
  "userPrompt": "...",
  "avatarPrompt": "...",
  "grokbotPrompt": "請幫我為 Grokbot 建立一位 AI 助理的人設..."
}
```

Avatar styles: `cartoon` (default), `realistic`, `pencil`, `anime`, `watercolor`, `threeD`, `pixel`. All three locales are supported. The avatar prompt is style-specific and does not introduce current projects or additional organization facts into the personality.

## POST `/api/v1/drafts`

Public by default. Performs a text model call (+ optional avatar) through the site's server-side `AI` binding, returning JSON:

```json
{ "markdown": "# 小安\n...", "avatarBase64": "...", "avatarMimeType": "image/jpeg" }
```

To revise a draft, send the original persona values plus `existingMarkdown` and `revisionInstructions`; includeAvatar=false. A revision costs one site credit and does not regenerate an existing avatar. The Worker does not store drafts or changes.

## POST `/api/v1/personas`

Public by default. Takes the same persona object and returns the final `application/zip` directly, containing `persona.md`, `manifest.json` and optional `avatar.jpg`.

```bash
curl -fSs https://YOUR-WORKER.workers.dev/api/v1/personas \
  -H 'Content-Type: application/json' \
  -d '{"presetId":"workplace","locale":"en","includeAvatar":false,"values":{"brief":"An independent and practical HR assistant"}}' \
  -o persona.zip
```

## POST `/api/v1/packages`

Public by default. **No AI call and no AI credits charged**. Supply a persona, completed Markdown, and optional image content:

```json
{
  "persona": { "presetId": "assistant", "locale": "en", "values": { "brief": "A planning assistant" } },
  "markdown": "# My assistant\n...",
  "avatarBase64": "...",
  "avatarMimeType": "image/jpeg"
}
```

The image must be a valid JPEG/PNG/WebP file under 5 MB. The site does not store it; it is returned in the ZIP. Files come back immediately in the HTTP response.

## Errors and security

- `400 VALIDATION_ERROR`: invalid input, style or language.
- `429 QUOTA_EXHAUSTED`: site-wide free credits consumed. Do not retry generation until reset. Prompt and packaging endpoints remain usable.
- `429 RATE_LIMITED`: burst throttling; user can retry later.
- `503 QUOTA_NOT_CONFIGURED` / `QUOTA_UNAVAILABLE`: misconfigured/unavailable quota database; model calls are denied to avoid unmetered expense.
- `503 AI_UNAVAILABLE`: the model itself failed; copy the Grokbot prompt instead.
- `401 UNAUTHORIZED`: only when the operator explicitly enables private mode (`ENABLE_PUBLIC_GENERATION=false`) and a server caller lacks the `PERSONA_API_TOKEN` header.

No wildcard CORS headers are installed. Headless Grokbot processes can call the public HTTP API directly; browser extensions running on unrelated origins need an explicitly designed CORS policy.

## UTF-8 requests on Windows (Traditional / Simplified Chinese)

**Do not pipe a Chinese PowerShell here-string directly into `node -`.**
Some Windows console or pipe encodings replace Chinese characters with `?` before Node receives them. This can corrupt `gender: 女性`, character names and avatar descriptions, causing both request validation errors and wrong image-generation results. The Worker itself is not the cause.

Write the payload as a **UTF-8 JSON file** (for example `tests/fixtures/YvonneLin.zh-hant.json`), and post the original file bytes:

```powershell
curl.exe -fSs -X POST "https://YOUR-WORKER/api/v1/prompts" `
  -H "Content-Type: application/json; charset=utf-8" `
  --data-binary "@tests/fixtures/YvonneLin.zh-hant.json"
```

Alternatively, use a **UTF-8 Node script** that reads the file with `fs.readFile` and sends the buffer as `fetch(..., { body: buffer })`, or pass a Base64-encoded payload and decode it before posting. Never rely on a PowerShell text pipe to transport non-ASCII JSON.

`npm test` includes a regression check that loads this fixture as UTF-8 bytes, exercises `POST /api/v1/prompts`, verifies Chinese name/gender/appearance survive unchanged, and confirms that prompt-only does not call an AI model.

**Image model versus user-facing language:** the API returns localized avatar prompts in `en`, `zh-hant` or `zh-hans`. Internally the Worker uses a separate English image-model prompt for reliable composition; `realistic` additionally excludes illustration, anime, fantasy costumes, extra people and text. This does not change the language of the persona Markdown.

## Persona quality

Optional `detailLevel`: `concise`, `standard` (default), or `full`. The website supports the same choices. For workplace personas, the prompt requests concrete duties, owner boundaries, verifiable outcomes and work scenarios. Other presets follow their own standards.

`grokbotPrompt` includes the complete `systemPrompt` and `userPrompt`, so local Grokbot receives the same requirements as Workers AI. `/api/v1/prompts` still calls no AI and consumes no site credits.

## Portrait regional context (locales are not nationalities)

Optional `values.origin` is available on every persona set, with a translated website field "Nationality / regional background". A supplied origin becomes an explicit user fact; it is never inferred from the chosen interface language.

For avatars only, when no origin or clear regional/ethnic appearance is supplied:

- `zh-hant`: soft reference to a contemporary Taiwanese professional, not a claim of nationality.
- `zh-hans`: soft reference to a contemporary mainland Chinese professional, not a claim of nationality.
- `en`: no geographic, national or ethnic default.

Explicit `values.origin` and explicit appearance take priority. Nationality alone does not uniquely determine ethnic appearance; users can describe the intended look in `values.appearance`. The same logic is applied to the localized `avatarPrompt`, the Grokbot prompt's optional avatar section, and the Workers AI image-model prompt. Locale-based hints must not be copied into a person's verified biography. `POST /api/v1/prompts` still invokes no AI or site credits.

## Shared visual identity and avatar consistency

The text persona prompt, the localized `avatarPrompt`, the optional Grokbot avatar section and the Workers AI FLUX prompt use the same structured `PersonaVisualIdentity` compiled from user input. It includes explicitly supplied gender, age, appearance, regional background, role and manner; age/gender may also be extracted from an unambiguous short `values.brief`. Neither a person's name nor a locale is evidence of their gender or nationality.

For photorealistic generation, mandatory subject gender (adult woman / adult man / nonbinary where supplied), age, role and visual mood are placed **first** in the actual image-model prompt. The site asks for gender if a realistic avatar is requested without enough input. This reduces the risk of an incongruent avatar but cannot guarantee model compliance.

On the hosted Worker, `AVATAR_VISUAL_REVIEW=true` enables a separate Moondream visual assessment for realistic avatars. This costs additional Workers AI Neurons and may add latency; the site's usual credits are unchanged. A clearly contradictory image is regenerated **at most once**; if both assessments flag a mismatch, the incorrect avatar is withheld and the Markdown is still returned.

The optional `POST /api/v1/drafts` response field `avatarReviewStatus` may be:
- `checked`: automated visual review reported PASS (not a guarantee).
- `revised`: the first image was flagged and the second passed review.
- `unverified`: the visual service was unavailable or unable to decide; human review needed.
- `rejected`: both attempts failed the consistency check; no avatar returned, Markdown remains available.

Photo-checking does not claim to verify a person's actual nationality, identity, ethnicity or real gender identity from appearance. It checks whether a fictional portrait visibly follows supplied casting and composition instructions. For Grokbot/external image generation the website can supply a consistent avatar prompt, but cannot inspect images created outside the Worker.

## Persona-first avatar generation — same identity for Markdown and image

**On-site**: Workers AI first returns BOTH complete Markdown and a structured `resolvedIdentity` in the same text response. Only then does the server compose the final FLUX prompt from that resolved identity. This means a brief such as `大美女，一個專業又幽默的秘書` is interpreted semantically by the text model, not a hardcoded gender-keyword list. Gender/age/appearance explicitly entered by the user remain authoritative. The website no longer requires manual gender selection for photoreal characters.

**External Grokbot**: `POST /api/v1/prompts` (0 AI) → local AI returns Markdown + resolvedIdentity card → `POST /api/v1/avatar-prompts` (0 AI) → local image generation → `POST /api/v1/packages` (0 AI). The initial `/prompts.avatarPrompt` is preliminary until the character card is completed. A caller cannot expect a no-AI endpoint to extract semantic facts from arbitrary Markdown itself.

### POST `/api/v1/avatar-prompts`

Public, deterministic, no Workers AI calls or site credits. Send the character card generated by the SAME AI that wrote Markdown:

```json
{
  "persona": {
    "presetId": "workplace", "locale": "zh-hant", "includeAvatar": true,
    "avatarStyle": "realistic",
    "values": { "brief": "大美女，一個能幹幽默的總經理秘書" }
  },
  "markdown": "# 秘書\\n\\n一位 29 歲的女性……",
  "resolvedIdentity": {
    "gender": "female",
    "age": "29",
    "appearance": "深棕短髮、職場穿著",
    "role": "總經理秘書",
    "personality": "自信、專業、幽默",
    "visualTone": "confident, friendly, subtle playful smile",
    "source": "ai"
  }
}
```

Returns `{ "resolvedIdentity": { ... }, "avatarPrompt": "...localized...", "imageModelPrompt": "...English FLUX instructions..." }`. Use **`imageModelPrompt`** as the final image model input. `gender` accepts `female`, `male`, `nonbinary` or `unspecified`; for a fictional portrait, the local AI should make one coherent choice before requesting an image. An invalid card or a contradiction of an explicitly selected gender returns HTTP 400.

`/drafts` now also returns an optional `resolvedIdentity`. `/packages` accepts the same optional card and includes it in ZIP `manifest.json`. All four old endpoints and their core response fields remain. Text-only generation and revisions continue using Markdown. If the text model unexpectedly returns only Markdown for an avatar request, the server may ask the text model to extract the identity in a second pass; if no consistent card can be obtained, it fails safely without producing an unrelated image.

The site does not store input, Markdown, or cards. Existing post-image visual review still applies, but it is not a guarantee of correctness.

## Character age and generation feedback

For an avatar-enabled *fictional* character, the text model must choose a
**concrete age** if the user did not specify one. `resolvedIdentity.age`, the
finished Markdown and the final FLUX image prompt all use this one AI decision.
When the model supplies an age in its card but omits it from the Markdown,
the server places an age line after the primary heading; it labels an invented
age as an **AI-proposed character detail**. A conflicting or missing age is
rejected before image generation rather than independently guessed by FLUX.
A user-supplied age remains authoritative. The local Grokbot prompt also
requests the same age in Markdown and `resolvedIdentity`.

The website displays an accessible, indeterminate loading mask with elapsed
seconds for AI text/image creation and refinements. The single `/drafts` HTTP
request does not stream backend progress, so the mask explicitly describes the
sequence without pretending to report an exact step or percent. Requests can
take longer with photorealistic generation and visual review. No unnecessary
extra model call is used when the initial text model returns a valid Markdown
and identity card. `/prompts`, `/avatar-prompts`, and `/packages` remain
zero-Workers-AI operations.

### Apparent age in realistic portraits

For **realistic portraits with a settled age of 18–29**, both the hosted FLUX
prompt and the localized external `/avatar-prompts` prompt now emphasize a
believable **young adult in their twenties**, natural facial age cues and
soft photographic lighting. Professional clothing and a senior-facing role
must not add decades of apparent age. Older characters retain their specified
age and never receive the young-adult constraints. No age is guessed
from nationality, attractiveness or job title by this image component.

When hosted visual review is enabled, the reviewer is explicitly instructed
to flag a **clear** age-decade mismatch and return `UNCERTAIN` rather than
claiming success for borderline age impressions. Apparent age is subjective;
this reduces mismatches but is **not** a measured age classifier or a guarantee
that every generated portrait looks exactly its written age. Review remains
one extra AI call and at most one image retry.

## Resilient Workers AI persona response transport

The hosted text models now request a **small** `<PERSONA_IDENTITY>` JSON card first, followed by ordinary Markdown. This avoids wrapping an entire multilingual Markdown document inside a JSON string (a common source of invalid or truncated responses). Older full JSON envelopes still parse; if a model returns only Markdown, the service asks for a **short identity card only** rather than asking it to re-generate the entire Markdown. Only when the first model cannot provide a consistent character does it try the backup model. Hosted Qwen3 calls request `/no_think` for usable interactive latency, while the lighter creative brief preserves character personality. Thinking mode was briefly enabled and led to excessively long waits in live use. The optional identity-only repair remains a short non-creative request.

Cloudflare Workers observability already collects logs for this deployment. Each unsuccessful text attempt records just the model, stage (`model_call`, `parse`, `repair_identity_only`, `identity_validation`, `age_consistency`), completion reason and error type. **Do not log prompts, names, Markdown, identity cards or raw model responses.** These logs diagnose the difference between model outages, incomplete output, and validation conflicts. CI uses mocked AI outputs; full public model quality must still be checked from real Workers AI logs and a controlled live test.

## First-release hosted persona style

The public website's Workers AI `/drafts` and `/personas` flows use a balanced, character-first `HostedPersonaBrief` for **new** characters: a short, vivid introduction followed by a few useful Markdown sections. Workplace personas cover identity, 2–4 specific duties, autonomy/approval boundaries, one hypothetical work example, and distinctive spoken lines; personal assistants cover mission, helpful services, consent/privacy, example and voice. Fictional characters and NPCs instead get narrative/worldbuilding and interaction outlines. This is intentionally less rigid than the detailed external Grokbot SOP but more usable than a free-form biography. Standard Traditional/Simplified Chinese output targets roughly 650–1100 characters; users can still choose concise or full. Qwen3 uses `/no_think` for website generation after long real-world stalls with `/think`. The first-release character-first brief is retained; shorter token budgets keep requests responsive.

The deterministic, zero-AI `/prompts` endpoint and Grokbot prompt continue using the existing detailed `PersonaOutputContract` and `PersonaQualityPolicy` for external model workflows. This change intentionally does not mutate the local-agent interface, package format, avatar identity resolution, quota policies or existing draft-editing contract.

## AI request deadlines and cancel behavior

The Workers AI orchestration uses `BoundedAIBinding` to limit the time a single text/image/visual-review AI call can occupy the request (38 seconds for Qwen3, 35 seconds for the fallback text model, 48 seconds for an image call and 12 seconds for image review), with an overall request AI budget of **140 seconds**. When a call times out, text and image fallbacks are attempted only within the remaining time. The browser imposes a **155-second** total request deadline and exposes a cancel button in its loading mask. A deadline yields a visible error instead of waiting indefinitely.

**Important cost limitation:** cloud AI bindings may not honor transport-level cancellation; timeouts and the browser cancel button end the wait but cannot guarantee the model stops executing or that Workers AI usage is refunded. Site credits continue to be reserved for attempted calls. The web UI makes this explicit after cancellation. These limits are practical first-release protections, not a measured SLA.

## Dedicated Grokbot creation assistant (site UI)

The public builder links to the user-provided Grokbot persona assistant template at `https://x.ai/bot/5FSBNs8g-d_JwCxvoa4Vq`, directly beside the Generate / Prompt-only choice. The link opens a separate tab and **does not call Persona Forge Workers AI or consume site credits**. Grokbot's own login, account entitlements and usage limits remain independent. The site still offers its existing metered AI generation and free, deterministic prompt/ZIP endpoints without changes.

## Clean persona artifacts

When the AI selects an unspecified fictional age, `PersonaMarkdownIdentityPolicy` may add a simple age label to the Markdown, but never marks it `AI-proposed` or `AI 建議設定`. Such generation provenance is not character identity and must not leak into persona Markdown, ZIP files or future bot prompts. The API `resolvedIdentity` carries the chosen age separately. Hosted authoring instructions also forbid editorial notes or creator asides inside the final persona.
