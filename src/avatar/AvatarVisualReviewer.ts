import type { AiBinding } from "../Types.js";
import { PersonaVisualIdentity } from "../persona/PersonaVisualIdentity.js";

export type AvatarReviewOutcome = "pass" | "mismatch" | "uncertain";

/**
 * A lightweight second-model look at *visible* portrait features.
 * Does not infer nationality, real gender identity or any sensitive trait.
 * Explicit mismatches can trigger one retry; uncertainty is not a pass.
 */
export class AvatarVisualReviewer {
  static readonly model = "@cf/moondream/moondream3.1-9B-A2B";
  constructor(private readonly ai: AiBinding) {}

  async review(image: Uint8Array, mime: "image/jpeg" | "image/png", identity: PersonaVisualIdentity): Promise<AvatarReviewOutcome> {
    const gender = identity.gender === "female" ? "one adult woman, female-presenting"
      : identity.gender === "male" ? "one adult man, male-presenting"
        : identity.gender === "nonbinary" ? "one adult character with user-specified nonbinary presentation"
          : "exactly one adult person";
    const checks = [
      `The portrait must show exactly ${gender} and only one face.`,
      identity.age ? `Approximate apparent adult age: ${identity.age}; don't demand exact age, only flag large visual mismatches.` : "",
      identity.appearance ? `Specific visual appearance/clothes: ${identity.appearance}.` : "",
      identity.role ? `Business context: ${identity.role}.` : "",
      `Overall demeanor: ${identity.visualTone}.`,
    ].filter(Boolean).join(" ");

    let result: unknown;
    try {
      let binary = "";
      for (let i = 0; i < image.byteLength; i += 8192) {
        binary += String.fromCharCode(...image.subarray(i, i + 8192));
      }
      result = await this.ai.run(AvatarVisualReviewer.model, {
        task: "query", stream: false, reasoning: false, max_tokens: 64,
        image: `data:${mime};base64,${btoa(binary)}`,
        question: `You are comparing a fictional generated portrait with supplied visual character facts. ${checks} Return exactly one uppercase word: PASS (all verifiable facts broadly match); FAIL (clearly wrong person count, visually opposite gender presentation, or obvious age/clothing mismatch); UNCERTAIN (not enough confidence). Do not determine real-world nationality or identity from appearance.`,
      });
    } catch (error) {
      console.warn("Avatar visual review unavailable", error);
      return "uncertain";
    }
    const answer = result && typeof result === "object"
      ? (result as { answer?: unknown; response?: unknown }).answer ?? (result as { response?: unknown }).response
      : undefined;
    const verdict = typeof answer === "string" ? answer.trim().toUpperCase().replace(/[.\s]+$/g, "") : "";
    if (verdict === "PASS") return "pass";
    if (verdict === "FAIL") return "mismatch";
    return "uncertain";
  }
}
