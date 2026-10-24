import { AIUnavailableError } from "../Errors.js";
import type { AiBinding, PromptBundle, PersonaRequest } from "../Types.js";

export interface GeneratedPersona {
  markdown: string;
  avatarBytes?: Uint8Array;
  avatarMimeType?: "image/jpeg";
}

export class WorkerAIService {
  constructor(private readonly ai: AiBinding) {}

  async generate(prompt: PromptBundle, includeAvatar: boolean, imageModelPrompt: string, persona: PersonaRequest): Promise<GeneratedPersona> {
    const maxTokens = persona.detailLevel === "concise" ? 1900 : persona.detailLevel === "full" ? 4200 : 3400;
    const textResponse = await this._invoke("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
      messages: [
        { role: "system", content: prompt.systemPrompt },
        { role: "user", content: prompt.userPrompt },
      ],
      max_tokens: maxTokens,
      temperature: persona.presetId === "workplace" ? 0.55 : 0.75,
    }) as { response?: string };
    const markdown = textResponse.response?.trim();
    if (!markdown) {
      throw new AIUnavailableError("The text model returned no Markdown result");
    }
    if (!includeAvatar) {
      return { markdown };
    }

    const imageResponse = await this._invoke("@cf/black-forest-labs/flux-1-schnell", {
      prompt: imageModelPrompt,
      steps: 6,
    }) as { image?: string };
    if (!imageResponse.image) {
      throw new AIUnavailableError("The image model returned no image data");
    }

    const decoded = atob(imageResponse.image);
    const avatarBytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
    return { markdown, avatarBytes, avatarMimeType: "image/jpeg" };
  }

  private async _invoke(model: string, input: Record<string, unknown>): Promise<unknown> {
    try {
      return await this.ai.run(model, input);
    } catch (error) {
      throw new AIUnavailableError("The AI model is temporarily unavailable. Please use the Grokbot prompt instead.", { cause: error });
    }
  }
}
