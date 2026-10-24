import { AIUnavailableError } from "../Errors.js";
import { PersonaVisualIdentity } from "../persona/PersonaVisualIdentity.js";
import { AvatarVisualReviewer } from "../avatar/AvatarVisualReviewer.js";
import type { AiBinding, PromptBundle, PersonaRequest } from "../Types.js";

export interface GeneratedPersona {
  markdown: string;
  avatarBytes?: Uint8Array;
  avatarMimeType?: "image/jpeg" | "image/png";
  avatarReviewStatus?: "checked" | "unverified" | "revised" | "rejected";
}

export class WorkerAIService {
  constructor(private readonly ai: AiBinding) {}

  static readonly primaryTextModel = "@cf/qwen/qwen3-30b-a3b-fp8";
  static readonly fallbackTextModel = "@cf/google/gemma-4-26b-a4b-it";
  static readonly primaryImageModel = "@cf/black-forest-labs/flux-2-klein-4b";
  static readonly fallbackImageModel = "@cf/black-forest-labs/flux-1-schnell";

  async generate(prompt: PromptBundle, includeAvatar: boolean, imageModelPrompt: string, persona: PersonaRequest, enableAvatarReview = false): Promise<GeneratedPersona> {
    const maxTokens = persona.detailLevel === "concise" ? 1900 : persona.detailLevel === "full" ? 4200 : 3400;
    const textInput = {
      messages: [
        { role: "system", content: prompt.systemPrompt },
        { role: "user", content: prompt.userPrompt },
      ],
      max_tokens: maxTokens,
      temperature: persona.presetId === "workplace" ? 0.55 : 0.75,
    };
    let markdown = "";
    try {
      const response = await this._invoke(WorkerAIService.primaryTextModel, textInput);
      markdown = this._readText(response);
    } catch {
      console.warn("Primary Workers AI text model unavailable; using Gemma 4 fallback.");
    }
    if (!markdown) {
      const fallback = await this._invoke(WorkerAIService.fallbackTextModel, {
        ...textInput, chat_template_kwargs: { enable_thinking: false },
      });
      markdown = this._readText(fallback);
    }
    if (!markdown) {
      throw new AIUnavailableError("The text model returned no Markdown result");
    }
    if (!includeAvatar) return { markdown };

    // The image and the persona text use the same canonical visual identity.
    const identity = new PersonaVisualIdentity(persona);
    let avatar = await this._generateAvatar(imageModelPrompt);
    if (!enableAvatarReview || persona.avatarStyle !== "realistic") {
      return { markdown, avatarBytes: avatar.bytes, avatarMimeType: avatar.mimeType };
    }

    const reviewer = new AvatarVisualReviewer(this.ai);
    let outcome = await reviewer.review(avatar.bytes, avatar.mimeType, identity);
    if (outcome === "mismatch") {
      // Recreate only once; never return an image the reviewer has clearly flagged
      // as conflicting with the character's visible identity. Bounded extra cost.
      const revisedPrompt = [
        identity.englishAnchor(),
        "CORRECTION: the previous attempt did not match the character. Follow the subject's gender presentation, age, hair, outfit and solo composition strictly.",
        imageModelPrompt,
      ].join(" ").slice(0, 2000);
      avatar = await this._generateAvatar(revisedPrompt);
      outcome = await reviewer.review(avatar.bytes, avatar.mimeType, identity);
      if (outcome === "mismatch") {
        return { markdown, avatarReviewStatus: "rejected" };
      }
      return {
        markdown, avatarBytes: avatar.bytes, avatarMimeType: avatar.mimeType,
        avatarReviewStatus: outcome === "pass" ? "revised" : "unverified",
      };
    }
    return {
      markdown, avatarBytes: avatar.bytes, avatarMimeType: avatar.mimeType,
      avatarReviewStatus: outcome === "pass" ? "checked" : "unverified",
    };
  }

  private async _generateAvatar(imageModelPrompt: string): Promise<{ bytes: Uint8Array; mimeType: "image/jpeg" | "image/png" }> {
    let imageResponse: unknown;
    try {
      const form = new FormData();
      form.append("prompt", imageModelPrompt);
      form.append("width", "1024");
      form.append("height", "1024");
      const serialized = new Response(form);
      imageResponse = await this._invoke(WorkerAIService.primaryImageModel, {
        multipart: { body: serialized.body, contentType: serialized.headers.get("content-type") },
      });
      if (!this._readImage(imageResponse)) imageResponse = undefined;
    } catch {
      console.warn("Primary Workers AI image model unavailable; using FLUX.1 fallback.");
      imageResponse = undefined;
    }
    if (!imageResponse) {
      imageResponse = await this._invoke(WorkerAIService.fallbackImageModel, {
        prompt: imageModelPrompt, steps: 6,
      });
    }
    const bytes = this._readImage(imageResponse);
    if (!bytes) throw new AIUnavailableError("The image model returned no image data");
    const mimeType = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      ? "image/jpeg"
      : bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value)
        ? "image/png"
        : null;
    if (!mimeType) throw new AIUnavailableError("Unexpected avatar image format");
    return { bytes, mimeType };
  }

  private _readText(result: unknown): string {
    if (!result || typeof result !== "object") return "";
    const response = result as { response?: unknown; choices?: { message?: { content?: unknown } }[] };
    const value = response.response ?? response.choices?.[0]?.message?.content;
    return typeof value === "string" ? value.trim() : "";
  }

  private _readImage(result: unknown): Uint8Array | undefined {
    if (!result || typeof result !== "object") return undefined;
    const base64 = (result as { image?: unknown }).image;
    if (typeof base64 !== "string" || !base64) return undefined;
    try {
      const decoded = atob(base64);
      return Uint8Array.from(decoded, c => c.charCodeAt(0));
    } catch {
      return undefined;
    }
  }

  private async _invoke(model: string, input: Record<string, unknown>): Promise<unknown> {
    try {
      return await this.ai.run(model, input);
    } catch (error) {
      throw new AIUnavailableError("The AI model is temporarily unavailable. Please use the Grokbot prompt instead.", { cause: error });
    }
  }
}
