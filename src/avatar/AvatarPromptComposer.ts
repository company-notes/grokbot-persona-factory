import type { PersonaRequest } from "../Types.js";
import { AvatarStyles } from "./AvatarStyles.js";

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
    const gender = this._gender(persona.values.gender);
    const name = this._value(persona.values.name, 80);
    const age = this._value(persona.values.age, 80);
    const appearance = this._value(persona.values.appearance, 400);
    const personality = this._value(persona.values.personality, 200);

    const details = [
      name ? `Character name: ${name}.` : "",
      gender ? `Gender presentation: ${gender}.` : "",
      age ? `Apparent age: ${age}.` : "",
      appearance ? `Appearance: ${appearance}.` : "",
      personality ? `Expression and demeanor: ${personality}.` : "",
    ].filter(Boolean).join(" ");

    return [
      this.styles.describe(style, "en"),
      "Exactly ONE original character. Solo head-and-shoulders portrait, one face, centered composition, square crop, clean background, natural expression, tasteful and nonsexualized.",
      "No extra people, no groups, no duplicate faces, no split panels, no text, no lettering, no typography, no captions, no brand logos, no watermarks.",
      details,
    ].filter(Boolean).join(" ").slice(0, 2000);
  }

  private _value(value: string | undefined, max: number): string {
    return (value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  }

  private _gender(value?: string): string {
    const gender: Record<string, string> = {
      "女性": "female",
      "男性": "male",
      "非二元": "nonbinary",
      "不限／不設定": "unspecified",
    };
    return value ? gender[value] ?? this._value(value, 60) : "";
  }
}
