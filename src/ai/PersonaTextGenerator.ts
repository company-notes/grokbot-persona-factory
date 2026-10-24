import type { AiBinding, PersonaRequest, PromptBundle } from "../Types.js";
import { AIUnavailableError } from "../Errors.js";
import { PersonaVisualIdentity } from "../persona/PersonaVisualIdentity.js";

/** Owns text generation and the typed JSON transport contract; no image logic. */
export class PersonaTextGenerator {
  static readonly primaryModel = "@cf/qwen/qwen3-30b-a3b-fp8";
  static readonly fallbackModel = "@cf/google/gemma-4-26b-a4b-it";

  constructor(private readonly ai: AiBinding) {}

  async generate(prompt: PromptBundle, persona: PersonaRequest): Promise<{
    markdown: string; identity?: PersonaVisualIdentity;
  }> {
    const withAvatar = persona.includeAvatar === true;
    const maxTokens = persona.detailLevel === "concise" ? 2600 : persona.detailLevel === "full" ? 5900 : 4500;
    // The structured envelope is required only when an avatar is requested;
    // text-only and revisions retain the historical Markdown format.
    const system = withAvatar
      ? [prompt.systemPrompt, this.envelopeContract()].join("\n\n")
      : prompt.systemPrompt;
    const user = withAvatar
      ? [prompt.userPrompt,
        "Before finalizing, settle the fictional character identity from the complete user request. Return a single JSON object with the Markdown and the same resolvedIdentity."].join("\n\n")
      : prompt.userPrompt;
    for (const model of [PersonaTextGenerator.primaryModel, PersonaTextGenerator.fallbackModel]) {
      try {
        const response = await this.ai.run(model, {
          messages: [{role:"system",content:system},{role:"user",content:user}],
          max_tokens:maxTokens,
          temperature:persona.presetId === "workplace" ? 0.55 : 0.75,
          ...(model === PersonaTextGenerator.fallbackModel ? {chat_template_kwargs:{enable_thinking:false}} : {}),
        });
        const text = this.readText(response);
        if (!text) throw new Error("Text model returned empty content");
        if (!withAvatar) {
          const parsed=this.parseEnvelope(text);
          return {markdown:parsed?.markdown ?? text};
        }
        let parsed = this.parseEnvelope(text);
        if (!parsed && text.trim().startsWith("#")) {
          // Compatibility path for models that ignore JSON-only instructions.
          // Interpret the COMPLETED Markdown with AI, never a keyword dictionary.
          const repaired = await this.ai.run(model, {
            messages: [
              {role:"system",content:this.envelopeContract()},
              {role:"user",content:[
                "Convert the already completed Markdown into the required JSON envelope. Do not change the Markdown. Extract the character's resolved identity from its actual content:",
                text,
              ].join("\n\n")},
            ],
            max_tokens:Math.min(5900,maxTokens+600),temperature:0,
          });
          parsed=this.parseEnvelope(this.readText(repaired));
        }
        if (!parsed) throw new Error("Model did not return a parseable Markdown + identity envelope");
        const identity = PersonaVisualIdentity.resolve(persona,parsed.resolvedIdentity);
        if (identity.gender === "unspecified") {
          throw new Error("No settled gender for a fictional portrait; refuse to guess independently of the generated Markdown");
        }
        return {markdown:parsed.markdown,identity};
      } catch (error) {
        console.warn("Persona text generation or structured identity failed; trying fallback", model, error);
      }
    }
    throw new AIUnavailableError("Text models could not return a consistent character identity and Markdown");
  }

  private envelopeContract(): string {
    return [
      "MANDATORY API TRANSPORT FORMAT OVERRIDE: Return ONLY valid JSON; earlier instructions to return only Markdown apply to the CONTENT of the markdown field, not to the outer response.",
      'Exactly {"markdown":"# Markdown persona ...","resolvedIdentity":{"name":"...","gender":"female|male|nonbinary","age":"...","appearance":"...","origin":"...","role":"...","personality":"...","visualTone":"..."}}.',
      "No Markdown code fences around JSON. All 2 fields required; gender must be a SINGLE enum value, not a string containing pipe characters.",
      "Use semantic understanding of the entire natural-language request, not word matching. E.g. descriptive Chinese expressions may imply presentation without spelling out female/male.",
      "Explicit user facts override creativity; never change a supplied gender, age, origin or appearance.",
      "For a fictional character with unspecified gender, choose one suitable identity yourself and describe that SAME identity in BOTH markdown and resolvedIdentity; do not leave gender unspecified or ask the user.",
      "The markdown MUST describe the same person as resolvedIdentity. Do not infer nationality solely from interface language.",
      "Age and other details may be omitted when genuinely not settled, but never insert invented personal details as actual existing company facts.",
    ].join("\n");
  }

  private readText(result: unknown): string {
    if (!result || typeof result !== "object") return "";
    const data=result as {response?:unknown;choices?:{message?:{content?:unknown}}[]};
    const value=data.response ?? data.choices?.[0]?.message?.content;
    return typeof value==="string" ? value.trim() : "";
  }

  private parseEnvelope(text:string):{markdown:string;resolvedIdentity:unknown}|undefined {
    let body=text.trim();
    if(body.startsWith("```")) body=body.replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"");
    try {
      const result=JSON.parse(body) as {markdown?:unknown;resolvedIdentity?:unknown};
      if(typeof result.markdown !== "string" || !result.markdown.trim() || result.markdown.length>40000) return undefined;
      if(!result.resolvedIdentity || typeof result.resolvedIdentity!=="object") return undefined;
      return {markdown:result.markdown,resolvedIdentity:result.resolvedIdentity};
    } catch {return undefined;}
  }
}
