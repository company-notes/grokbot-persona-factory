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
