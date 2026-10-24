# Persona Forge prompt quality v2

The prompt-only endpoint `POST /api/v1/prompts` is static and does **not** call Workers AI. The returned `grokbotPrompt` contains the full system rules and the user prompt, including `PersonaOutputContract` requirements. The same output contract is sent to the on-site text model.

## Contract by persona set

- Workplace: fixed facts, concrete duties with verifiable deliverables, three decision levels, three distinct problem-solving scenarios, reporting, realistic character-specific dialogue, and unresolved policy boundaries.
- Assistant: helpful initiative, preferences, privacy, daily workflows and natural interactions.
- Character: motivation, voice, contradictions and scenes.
- NPC: in-world role, interaction rules and dialogue.

Previously the workplace prompt contained eight generic headings; they have been removed. The replacement prompts require the model to self-check that all supplied facts are retained, including age if specified, without fabricating facts that were not supplied.

Specific HR administration examples are included **only** when the user supplies an HR administration department or role. They are labeled as provisional examples, never asserted as confirmed company policy.

## Test using UTF-8

Use the checked-in `tests/fixtures/YvonneLin.zh-hant.json` as a regression input. Send file bytes as UTF-8 rather than piping Chinese PowerShell here-strings into Node, which can damage payload text.

## Limitations

Tests verify prompt contents, role isolation and API behaviors. External Grokbot/other LLMs may still ignore instructions; inspect real generated Markdown for role-specific quality and missing supplied facts.
