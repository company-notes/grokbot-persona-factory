import type { PersonaRequest } from "../Types.js";
import { AvatarStyles } from "./AvatarStyles.js";
import { PersonaVisualIdentity } from "../persona/PersonaVisualIdentity.js";
import type { Locale } from "../i18n/Localization.js";
import { AvatarRegionalContext } from "./AvatarRegionalContext.js";
import { AvatarAgeGuidance } from "./AvatarAgeGuidance.js";

/**
 * Builds an English, image-model-oriented prompt independently of the
 * localized prompt that /api/v1/prompts returns to Grokbot users.
 *
 * This deliberately keeps style/composition constraints prominent: some
 * image models are less reliable with multilingual instruction strings.
 */
export class AvatarPromptComposer {
  constructor(private readonly styles = new AvatarStyles()) {}

  compose(persona: PersonaRequest, identity = PersonaVisualIdentity.fromInput(persona)): string {
    const style = this.styles.require(persona.avatarStyle);
    const fixed = [
      identity.englishAnchor(),
      ...(style === "realistic" ? [AvatarAgeGuidance.forImage(identity.age)] : []),
      this.styles.describe(style, "en"),
      "One person only; head-and-shoulders portrait, exactly one face, centered square composition, clean natural background. Respect the same individual described in the Markdown.",
      ...(style === "realistic" ? [
        "Photorealistic corporate headshot, real human skin and age-appropriate facial anatomy; natural candid expression, not a synthetic stock-photo face.",
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

  /** Human-readable/localized prompt; the actual FLUX prompt is compose(). */
  composeLocalized(persona: PersonaRequest, locale: Locale, identity = PersonaVisualIdentity.fromInput(persona)): string {
    const style = this.styles.describe(this.styles.require(persona.avatarStyle), locale);
    const visualPersona = { ...persona, values: { ...persona.values, origin: identity.origin, appearance: identity.appearance } };
    const regional = new AvatarRegionalContext().guidance(visualPersona).localized;
    const copy = ({
      en: "Single fictional person headshot portrait. Match the completed persona exactly; no other people, text or watermarks.",
      "zh-hant": "單一原創虛構人物肖像，必須與完成的人設為同一個人；不得增加其他人物、文字或浮水印。",
      "zh-hans": "单个原创虚构人物肖像，必须与完成的人设是同一个人物；不得出现其他人物、文字或水印。",
    })[locale];
    return [
      identity.localizedImageAnchor(locale),
      ...(this.styles.require(persona.avatarStyle) === "realistic" ? [AvatarAgeGuidance.localized(identity.age, locale)] : []),
      style,regional,copy,
      identity.name ? `Name / 姓名：${identity.name}` : "",
      identity.appearance ? `Appearance / 外貌：${identity.appearance}` : "",
      identity.role ? `Role / 職務：${identity.role}` : "",
      identity.personality ? `Persona / 人格：${identity.personality}` : "",
      identity.visualTone ? `Demeanor / 氣質：${identity.visualTone}` : "",
    ].filter(Boolean).join(" ").slice(0,2048);
  }

}
