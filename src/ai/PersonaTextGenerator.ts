import type { AiBinding, PersonaRequest, PromptBundle } from "../Types.js";
import { AIUnavailableError } from "../Errors.js";
import { PersonaVisualIdentity } from "../persona/PersonaVisualIdentity.js";
import { PersonaMarkdownIdentityPolicy } from "../persona/PersonaMarkdownIdentityPolicy.js";
import { HostedPersonaBrief } from "./HostedPersonaBrief.js";

/** Owns text generation and the typed JSON transport contract; no image logic. */
export class PersonaTextGenerator {
  static readonly primaryModel = "@cf/qwen/qwen3-30b-a3b-fp8";
  static readonly fallbackModel = "@cf/google/gemma-4-26b-a4b-it";

  constructor(private readonly ai: AiBinding) {}

  async generate(prompt: PromptBundle, persona: PersonaRequest): Promise<{
    markdown: string; identity?: PersonaVisualIdentity;
  }> {
    const withAvatar = persona.includeAvatar === true;
    const maxTokens = persona.detailLevel === "concise" ? 1600 : persona.detailLevel === "full" ? 3600 : 2600;
    // The structured envelope is required only when an avatar is requested;
    // text-only and revisions retain the historical Markdown format.
    // Website AI uses a lighter creative contract. The public /prompts API
    // and external Grokbot SOP remain unchanged for advanced users.
    const creative = new HostedPersonaBrief().compose(persona, prompt);
    const system = withAvatar
      ? [creative.system, this.envelopeContract()].join("\n\n")
      : creative.system;
    const user = withAvatar
      ? [creative.user,
        "First output a short <PERSONA_IDENTITY> JSON card, then write the complete Markdown normally. Both must describe the SAME person."].join("\n\n")
      : creative.user;
    for (const model of [PersonaTextGenerator.primaryModel, PersonaTextGenerator.fallbackModel]) {
      let stage = "model_call";
      let finishReason: string | undefined;
      try {
        const response = await this.ai.run(model, {
          messages: [
            { role: "system", content: system },
            { role: "user", content: model === PersonaTextGenerator.primaryModel
              ? user + "\n/no_think" : user },
          ],
          max_tokens: maxTokens,
          temperature: persona.presetId === "workplace" ? 0.70 : 0.75,
          ...(model === PersonaTextGenerator.fallbackModel
            ? { chat_template_kwargs: { enable_thinking: false } } : {}),
        });
        finishReason = this.finishReason(response);
        const raw = this.readText(response);
        if (!raw) throw new Error("EMPTY_TEXT");
        stage = "parse";
        if (!withAvatar) {
          const legacy = this.parseEnvelope(raw);
          return { markdown: legacy?.markdown ?? raw };
        }
        let parsed = this.parseEnvelope(raw);
        if (!parsed) {
          // Legacy models may return Markdown only. Request a SMALL identity
          // card rather than printing/escaping the entire Markdown again.
          const markdown = this.readPlainMarkdown(raw);
          if (markdown) {
            stage = "repair_identity_only";
            const repaired = await this.ai.run(model, {
              messages: [
                { role: "system", content: [
                  "Return ONLY a small JSON identity object for this fictional person.",
                  "Fields: name, gender (female/male/nonbinary), age (numeric string), appearance, origin, role, personality, visualTone.",
                  "If the text omits age, choose a plausible adult age that fits it. Do NOT repeat the Markdown.",
                ].join("\n") },
                { role: "user", content: markdown },
              ],
              max_tokens: 420, temperature: 0,
              ...(model === PersonaTextGenerator.primaryModel ? { chat_template_kwargs: { enable_thinking: false } } : {}),
              ...(model === PersonaTextGenerator.fallbackModel
                ? { chat_template_kwargs: { enable_thinking: false } } : {}),
            });
            const card = this.parseIdentity(this.readText(repaired));
            if (card) parsed = { markdown, resolvedIdentity: card };
          }
        }
        if (!parsed) throw new Error("INVALID_MODEL_FORMAT");
        stage = "identity_validation";
        const identity = PersonaVisualIdentity.resolve(persona, parsed.resolvedIdentity);
        if (identity.gender === "unspecified") throw new Error("MISSING_GENDER");
        stage = "age_consistency";
        const finalized = new PersonaMarkdownIdentityPolicy().finalize(parsed.markdown, identity, persona);
        return { markdown: finalized, identity };
      } catch (error) {
        // No prompt, Markdown, personal information or user input in logs.
        console.warn("persona_text_attempt_failed", {
          model, stage, finishReason, errorType: error instanceof Error ? error.name : "UnknownError",
        });
      }
    }
    throw new AIUnavailableError("Text models could not return a usable persona and consistent character identity");
  }

  private envelopeContract(): string {
    return [
      "MANDATORY API TRANSPORT FORMAT OVERRIDE: Output a SHORT JSON identity FIRST, then NORMAL Markdown. Never JSON-escape the complete Markdown document.",
      "Exact structure:",
      "<PERSONA_IDENTITY>",
      '{"name":"...","gender":"female","age":"28","appearance":"...","origin":"...","role":"...","personality":"...","visualTone":"..."}',
      "</PERSONA_IDENTITY>",
      "# Full Markdown persona...",
      "No preamble, code fences or thinking traces. Gender must be one of female, male, nonbinary. Age must be a concrete adult age expressed as digits.",
      "Interpret the complete natural language request semantically; do not match a fixed word list. Use the SAME person in JSON identity and Markdown.",
      "For fictional characters, invent reasonable gender and age only when not user-specified. Explicit facts override inferred ones.",
      "Follow the requested writing language. Do not treat interface locale as verified nationality, or invent company policies.",
    ].join("\n");
  }

  private readText(result: unknown): string {
    if (!result || typeof result !== "object") return "";
    const data=result as {response?:unknown;choices?:{message?:{content?:unknown}}[]};
    const value=data.response ?? data.choices?.[0]?.message?.content;
    return typeof value==="string" ? value.trim() : "";
  }

  private finishReason(result: unknown): string | undefined {
    if (!result || typeof result !== "object") return undefined;
    const choices = (result as { choices?: { finish_reason?: unknown }[] }).choices;
    return typeof choices?.[0]?.finish_reason === "string" ? choices[0].finish_reason : undefined;
  }

  private cleanText(text: string): string {
    return text.trim().replace(/^(?:<think>[\s\S]*?<\/think>\s*)+/i, "").trim();
  }

  private readPlainMarkdown(text: string): string | undefined {
    const value = this.cleanText(text);
    return /^#{1,3}\s+/.test(value) ? value : undefined;
  }

  private parseIdentity(text: string): unknown | undefined {
    let value = this.cleanText(text);
    if (value.startsWith("```")) value = value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    try {
      const obj: unknown = JSON.parse(value);
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) return undefined;
      return "resolvedIdentity" in obj ? (obj as { resolvedIdentity: unknown }).resolvedIdentity : obj;
    } catch { return undefined; }
  }

  private parseEnvelope(text: string): { markdown: string; resolvedIdentity: unknown } | undefined {
    let body = this.cleanText(text);
    const tagged = body.match(/^<PERSONA_IDENTITY>\s*(\{[\s\S]*?\})\s*<\/PERSONA_IDENTITY>\s*(#{1,3}\s+[\s\S]+)$/);
    if (tagged) {
      try {
        const card: unknown = JSON.parse(tagged[1]);
        if (card && typeof card === "object" && !Array.isArray(card) && tagged[2].length <= 40000) {
          return { markdown: tagged[2].trim(), resolvedIdentity: card };
        }
      } catch { /* invalid identity */ }
    }
    // Backward compatibility for existing JSON envelope responses.
    if (body.startsWith("```")) body = body.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    try {
      const result = JSON.parse(body) as { markdown?: unknown; resolvedIdentity?: unknown };
      if (typeof result.markdown !== "string" || !result.markdown.trim() || result.markdown.length > 40000) return undefined;
      if (!result.resolvedIdentity || typeof result.resolvedIdentity !== "object") return undefined;
      return { markdown: result.markdown, resolvedIdentity: result.resolvedIdentity };
    } catch { return undefined; }
  }
}
