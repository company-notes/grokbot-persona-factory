# Persona Forge architecture and boundaries

## Core principle

**One fictional character, one resolved identity.** Markdown is generated first,
and the portrait prompt is created only after the text model supplies the
matching structured `resolvedIdentity`. No production module tries to
infer gender from a dictionary of phrases or the person's name.

```text
Web UI / API input
    |
WorkerApplication — routing, limits and security
    |
PersonaService — application orchestration
    |       |
    |       +-- PersonaValidator — canonical input
    |       +-- PresetCatalog + PromptComposer — text and preview prompts
    |
    +-- Direct Workers AI flow (/drafts, /personas; metered)
    |       |
    |       +-- WorkerAIService — high-level flow orchestration
    |               |
    |               +-- PersonaTextGenerator (Qwen3 / Gemma)
    |               |     |-- complete Markdown + resolvedIdentity (same call)
    |               |     +-- compatibility repair if plain Markdown returned
    |               |
    |               +-- PersonaVisualIdentity.resolve (single source of truth)
    |               +-- AvatarPromptComposer (EN FLUX prompt)
    |               +-- FLUX.2 / FLUX.1 image generation
    |               +-- AvatarVisualReviewer (optional quality check + retry)
    |
    +-- Local Grokbot flow (all API steps are zero-AI)
    |       +-- /prompts -> local model creates Markdown + resolvedIdentity
    |       +-- /avatar-prompts -> PersonaVisualIdentity.resolve
    |       |                   -> AvatarPromptComposer
    |       +-- /packages -> PersonaPackageFactory -> ZipArchive
    |
    +-- ZIP manifest may include the same resolvedIdentity
```

## SOLID/DRY boundaries

- `PersonaVisualIdentity` — immutable normalized character card. Holds
  gender, age, appearance, role, origin, personality, visual mood and source;
  merges explicit inputs with model decisions. Rejects clear contradictions.
- `PersonaTextGenerator` — semantic interpretation by one text model, parsing
  a typed JSON envelope; never builds image prompts. Primary Qwen3, fallback Gemma 4.
- `AvatarPromptComposer` — **only** image prompt builder (localized preview and
  image-model English), always based on the resolved card.
- `AvatarRegionalContext` — visual-only soft locale defaults, not nationality facts.
- `AvatarVisualReviewer` — optional post-image check; never the initial gender
  decision maker. False positives/uncertainty require human review.
- `PromptComposer` / `PersonaQualityPolicy` / `PersonaOutputContract` —
  localized instruction composition, quality criteria and preset-specific
  output structure. The initial `avatarPrompt` is explicitly preliminary.
- `PersonaService` — zero-AI and AI application workflows, input/output wiring.
- `WorkerApplication` — HTTP route handlers; does not interpret character traits.
- `PersonaValidator` — bounds and schema validation. `PresetCatalog` and
  `i18n/Localization` — user fields and all three locales.
- `QuotaService`, `QuotaPolicy` and `QuotaLedger` — site-wide Durable Object
  credits; `RequestAuthorizer` — separate request authentication and rate limits.
- `PersonaPackageFactory` and `ZipArchive` — self-contained persona archives.

## Compatibility and limitations

`/api/v1/prompts` returns original response fields with zero Workers AI calls.
`/api/v1/avatar-prompts` is new and zero-AI, **requires** Markdown and a
semantic card made by the local AI; a no-AI Worker cannot understand arbitrary
Markdown by itself. `/api/v1/packages` is likewise zero-AI and may include
the resolved card in the manifest.

`/api/v1/drafts` returns Markdown and optionally avatar bytes, review status
and `resolvedIdentity`. `/api/v1/personas` returns ZIP. Their authentication,
site-credit reserve and response types stay compatible. Text-only/revision
calls remain Markdown, not JSON envelopes. Validating the image model output
cannot prove a real-world identity or nationality.

All characters and images remain request-scoped: the Worker persists **only
site-wide quota data**. Image generation/review consumes Workers AI Neurons.
The daily site-credit limit is not a Cloudflare spending cap.

## Generation integrity and user feedback

`PersonaMarkdownIdentityPolicy` operates after the semantic
`PersonaTextGenerator`: it requires an AI-resolved concrete age for fictional
portraits, checks the introduction for conflicting numeric ages, and inserts
the already-chosen age into Markdown if absent. This step never chooses a
number itself, and never starts a new AI call. Missing/contradictory model
facts prevent a wrongly matched portrait.

`public/web/LoadingMask.js` owns the accessible modal progress overlay,
elapsed seconds and cleanup, separate from API transport. Because the Worker
returns one final JSON result, the overlay is deliberately indeterminate
rather than inventing per-model stage progress.
