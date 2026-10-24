import { AIUnavailableError } from "../Errors.js";
import type { ResolvedIdentity } from "../persona/PersonaVisualIdentity.js";
import { PersonaTextGenerator } from "./PersonaTextGenerator.js";
import { AvatarPromptComposer } from "../avatar/AvatarPromptComposer.js";
import { AvatarVisualReviewer } from "../avatar/AvatarVisualReviewer.js";
import type { AiBinding, PromptBundle, PersonaRequest } from "../Types.js";

export interface GeneratedPersona {
  markdown: string;
  resolvedIdentity?: ResolvedIdentity;
  avatarBytes?: Uint8Array;
  avatarMimeType?: "image/jpeg" | "image/png";
  avatarReviewStatus?: "checked" | "unverified" | "revised" | "rejected";
}

export class WorkerAIService {
  constructor(private readonly ai: AiBinding) {}

  static readonly primaryImageModel = "@cf/black-forest-labs/flux-2-klein-4b";
  static readonly fallbackImageModel = "@cf/black-forest-labs/flux-1-schnell";

  /**
   * Text/model identity is resolved FIRST. Image prompts are never assembled
   * from the raw input before the model knows who the character is.
   */
  async generate(prompt: PromptBundle, persona: PersonaRequest, enableAvatarReview = false): Promise<GeneratedPersona> {
    const generated = await new PersonaTextGenerator(this.ai).generate(prompt, persona);
    const markdown = generated.markdown;
    if (!persona.includeAvatar) return { markdown };

    if (!generated.identity) {
      throw new AIUnavailableError("Character identity is required before generating an avatar");
    }
    const identity = generated.identity;
    const imageModelPrompt = new AvatarPromptComposer().compose(persona, identity);
    let avatar = await this._generateAvatar(imageModelPrompt);
    const data = { markdown, resolvedIdentity: identity.value };
    if (!enableAvatarReview || persona.avatarStyle !== "realistic") {
      return { ...data, avatarBytes: avatar.bytes, avatarMimeType: avatar.mimeType };
    }

    const reviewer = new AvatarVisualReviewer(this.ai);
    let outcome = await reviewer.review(avatar.bytes, avatar.mimeType, identity);
    if (outcome === "mismatch") {
      const revisedPrompt = [
        identity.englishAnchor(),
        "CORRECTION: the previous attempt did not match the character. Follow the person's gender presentation, age, hair, outfit and solo composition strictly.",
        imageModelPrompt,
      ].join(" ").slice(0, 2000);
      avatar = await this._generateAvatar(revisedPrompt);
      outcome = await reviewer.review(avatar.bytes, avatar.mimeType, identity);
      if (outcome === "mismatch") {
        return { ...data, avatarReviewStatus: "rejected" };
      }
      return {
        ...data, avatarBytes: avatar.bytes, avatarMimeType: avatar.mimeType,
        avatarReviewStatus: outcome === "pass" ? "revised" : "unverified",
      };
    }
    return {
      ...data, avatarBytes: avatar.bytes, avatarMimeType: avatar.mimeType,
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
