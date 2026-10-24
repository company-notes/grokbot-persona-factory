# Changelog

## Unreleased — Avatar prompt reliability

- Separated public localized avatar prompts (`/api/v1/prompts`) from the English image-model prompt sent to Workers AI, preserving the user's selected locale for the interface and Grokbot persona instructions.
- Made solo-character, no-text, no-logo and requested visual style constraints explicit in the image-model prompt.
- Added regression tests for realistic and pencil styles across EN, Traditional Chinese and Simplified Chinese; 27/27 tests passing on GitHub Actions.
- The reported Cloudflare Error 1010 affected GitHub Runner requests; a separate client's successful production API call shows this was not a universal API outage.

## 0.3.1 — Hosted allowance recalibration and deployment separation

- Increased site allowance to 150 hosted credits/day (not Cloudflare billing Neurons).
- Recalibrated charged work to 1 credit for text and +2 credits for a generated avatar (3 total): 50 complete persona+avatar generations/day at the configured cap.
- Browser now reads the per-operation credit weights from `GET /api/v1/quota` instead of hard-coding.
- Maintained language-specific quota copy in English, Traditional Chinese and Simplified Chinese.
- Explicitly documented account-wide Cloudflare 10,000 Neurons/day free allocation, overage pricing and estimated usage. Increasing the hosted site allowance does not increase Cloudflare's free allocation.
- Separated custom-domain routing from portable `wrangler.jsonc`. `wrangler.production.jsonc` is ignored; an optional example documents local deployment-specific configuration.
- Kept deploy workflow `workflow_dispatch` only, preventing accidental live updates from a GitHub push.

## v0.3.0

- Initial public hosted quota, avatar styles, three languages and prompt-only workflow.
