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
  "values": {
    "name": "小安",
    "department": "研發部",
    "role": "研發部助理",
    "personality": "細心、認真、不猜測技術問題"
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
