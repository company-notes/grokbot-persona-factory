import type { PersonaRequest } from "../Types.js";
import { AvatarStyles } from "./AvatarStyles.js";
import { PersonaVisualIdentity } from "../persona/PersonaVisualIdentity.js";

/**
 * Builds an English, image-model-oriented prompt independently of the
 * localized prompt that /api/v1/prompts returns to Grokbot users.
 *
 * This deliberately keeps style/composition constraints prominent: some
 * image models are less reliable with multilingual instruction strings.
 */
export class AvatarPromptComposer {
  constructor(private readonly styles = new AvatarStyles()) {}

  compose(persona: PersonaRequest): string {
    const style = this.styles.require(persona.avatarStyle);
    const identity = new PersonaVisualIdentity(persona);
    const fixed = [
      identity.englishAnchor(),
      this.styles.describe(style, "en"),
      "One person only; head-and-shoulders portrait, exactly one face, centered square composition, clean natural background. Respect the same individual described in the Markdown.",
      ...(style === "realistic" ? [
        "Photorealistic professional headshot, real human skin and age-appropriate facial anatomy; natural candid expression, not a synthetic stock-photo face.",
        "No other people. No illustration. No anime. No fantasy costume.",
        "No text, lettering, logo, watermark, or stamp.",
      ] : []),
      "Do not swap the subject's gender, age, nationality or user-specified appearance to fit a familiar stock portrait.",
    ].join(" ");
    // Put all mandatory identity clauses first. Optional descriptions are truncated
    // separately so long names or personality text cannot erase gender/age rules.
    const details = identity.englishDetails();
    return [fixed, details].join(" ").slice(0, 2000);
  }

}
