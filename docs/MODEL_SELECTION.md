# Workers AI model selection — 2026-10-24

## Production recommendation

- **Text default:** `@cf/qwen/qwen3-30b-a3b-fp8` (multilingual Qwen3, good Traditional Chinese adherence for role-driven personas, low inference cost).
- **Text fallback:** `@cf/google/gemma-4-26b-a4b-it` with thinking disabled. Do not bill both unless the primary fails or returns no text.
- **Image default:** `@cf/black-forest-labs/flux-2-klein-4b` (multipart input, fixed 4 steps, 1024×1024 solo-avatar output). Inspect actual decoded bytes to classify JPEG versus PNG.
- **Image fallback:** `@cf/black-forest-labs/flux-1-schnell`. Do not generate with two image models unless the primary fails.
- Prompt-only and ZIP packaging remain unchanged and model-free.

## A/B benchmark

GitHub Actions run [40069492335](https://github.com/company-notes/grokbot-persona-factory/actions/runs/40069492335) used the exact same UTF-8 Yvonne Lin fixture and production PromptComposer with one inference per candidate.

| Candidate | Completion | Neurons used | Latency | Fact coverage |
| --- | ---: | ---: | ---: | --- |
| Qwen3 30B A3B | 2,229 CJK/other chars | 71.55 | 26 s | Name, age, scenarios, approval, dialogue all present |
| Gemma 4 26B A4B | 3,384 chars | 77.55 | 48 s | Same, longer output |
| GPT-OSS 120B | 3,084 chars | 231.79 | 28 s | Same, much costlier |
| GLM 4.7 Flash | 0 usable chars | 106.38 | 70 s | Failed the output-content check |

Gemma and Qwen both generated concrete operational guidance. Qwen had the lowest measured Neurons and latency. None was flawless: Qwen invented MBTI and specific operational percentages; Gemma and GPT-OSS invented company-sized figures, departments, deadlines or personnel. The workplace output contract therefore also explicitly prohibits invented MBTI, dates, employee counts, SOPs and names. **This is a one-case evaluation, not a general model benchmark or guarantee.**

The image comparison generated two valid JPEGs with the same English headshot prompt. Klein 4B depicted the requested older professional more accurately in this one example; the quick test requested 512×512 for Klein while the old FLUX.1 defaulted to 1024×1024, so image sharpness is not a controlled comparison.

## Official pricing

Workers AI's 10,000 Neurons/day free allocation is **shared across the Cloudflare account**. On Workers Paid, extra usage costs $0.011 per 1,000 Neurons; the site's 150 points/day is a separate product-level cap.

Text published prices per million input/output tokens (USD): Llama 3.3 70B $0.293/$2.253, Qwen3 30B A3B $0.0509/$0.335, Gemma 4 26B $0.10/$0.30, GPT-OSS 120B $0.35/$0.75. These are not quality scores.

The FLUX.2 Klein 4B model is priced at $0.000287 per output 512×512 tile, implying about $0.001148 for a 1024×1024 output if charged as four tiles, before any extra items billed by the provider. Compare actual Neurons in the dashboard.

References:
- https://developers.cloudflare.com/workers-ai/platform/pricing/
- https://developers.cloudflare.com/workers-ai/models/qwen3-30b-a3b-fp8/
- https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/
- https://developers.cloudflare.com/workers-ai/models/flux-2-klein-4b/
- https://developers.cloudflare.com/changelog/post/2026-01-15-flux-2-klein-4b-workers-ai/
