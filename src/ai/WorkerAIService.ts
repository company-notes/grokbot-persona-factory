import { AIUnavailableError } from "../Errors.js";
import type { AiBinding, PromptBundle } from "../Types.js";

export interface GeneratedPersona {
  markdown: string;
  avatarBytes?: Uint8Array;
  avatarMimeType?: "image/jpeg";
}

export class WorkerAIService {
  constructor(private readonly ai: AiBinding) {}

  async generate(prompt: PromptBundle, includeAvatar: boolean): Promise<GeneratedPersona> {
    const textResponse = await this._invoke("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
      messages: [
        { role: "system", content: prompt.systemPrompt },
        { role: "user", content: prompt.userPrompt },
      ],
      max_tokens: 3400,
      temperature: 0.75,
    }) as { response?: string };
    const markdown = textResponse.response?.trim();
    if (!markdown) {
      throw new AIUnavailableError("The text model returned no Markdown result");
    }
    if (!includeAvatar) {
      return { markdown };
    }

    const imageResponse = await this._invoke("@cf/black-forest-labs/flux-1-schnell", {
      prompt: prompt.avatarPrompt,
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
