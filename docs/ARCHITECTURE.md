# Architecture and boundaries

```text
Web Application          Grokbot bot / API consumer
       \                      /
        \                    /
       WorkerApplication (HTTP, error handling)
              |
       PersonaService ---------> PersonaPackageFactory --> ZipArchive
          |            \
      PresetCatalog   PromptComposer -----> AvatarStyles
          |            /
        PersonaValidator
          |
    WorkerAIService (Workers AI binding)

Public generation requests:
RequestAuthorizer -> QuotaService -> QuotaLedger (SQLite Durable Object)
                             -> PersonaService -> WorkerAIService

No-AI endpoints:
/locales, /presets, /prompts, /packages
```

Responsibilities stay separated:

- `catalog/PresetCatalog`: source of fields per persona set.
- `i18n/Localization`: one authoritative dictionary for the page, schema names, labels and prompt language.
- `avatar/AvatarStyles`: fixed illustrations styles, localized directions and stable identifiers.
- `persona/PersonaValidator`: all input constraints and normalization.
- `persona/PromptComposer`: the only code that assembles model prompts, including `grokbotPrompt` and image art direction.
- `ai/WorkerAIService`: the only runtime code that calls the Cloudflare AI binding.
- `quota/QuotaPolicy`: cost and reset-day rules. `QuotaLedger`: SQLite Durable Object with atomic credits. `QuotaService`: HTTP client and HTTP error mapping.
- `security/RequestAuthorizer`: optional private API authentication and public traffic throttling; **not** the quota engine.
- `package/PersonaPackageFactory`: valid, traceable ZIP artifacts.
- `http/WorkerApplication`: resource routing and input/output limits.
- `public/web/*`: UI controls, transport client and preview behavior; no private API keys, no duplicated prompt templates.

Only a daily quota counter is persisted, **not** generated personae. Private and workplace identity values remain request-scoped. The Worker has no hard-coded client hostname; operators map domains at deployment. Model usage is restricted by a site-credit counter rather than a provider spending invoice cap.

The single quota Durable Object is deliberately one global reservation bottleneck because the application has a low daily cap; it is not designed for tens of thousands of reservation requests per second. Split by tenant/site only if this becomes a multi-tenant product. This is distinct from low-latency, approximate POP-based throttling.
