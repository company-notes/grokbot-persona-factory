import type { FieldSpec, PersonaPreset } from "../Types.js";
import { ValidationError } from "../Errors.js";
import { Localization, type Locale } from "../i18n/Localization.js";

type FieldDefinition = Pick<FieldSpec, "id" | "type" | "required" | "options">;

const identity: FieldDefinition[] = [
  { id: "name", type: "text", required: true },
  { id: "englishName", type: "text" },
  { id: "gender", type: "select", options: ["", "女性", "男性", "非二元", "不限／不設定"] },
  { id: "age", type: "text" },
  { id: "origin", type: "text" },
  { id: "birthday", type: "text" },
  { id: "personality", type: "textarea" },
  { id: "speakingStyle", type: "textarea" },
  { id: "appearance", type: "textarea" },
  { id: "additional", type: "textarea" },
];

const career: FieldDefinition[] = [
  { id: "organization", type: "text" },
  { id: "department", type: "text", required: true },
  { id: "role", type: "text", required: true },
  { id: "seniority", type: "textarea" },
  { id: "responsibilities", type: "textarea" },
  { id: "workStyle", type: "textarea" },
  { id: "authority", type: "textarea" },
];

const definitions: { id: string; fields: FieldDefinition[] }[] = [
  { id: "workplace", fields: [...identity, ...career] },
  { id: "assistant", fields: [
    ...identity,
    { id: "mission", type: "textarea", required: true },
    { id: "skills", type: "textarea" },
    { id: "workStyle", type: "textarea" },
    { id: "boundaries", type: "textarea" },
  ] },
  { id: "character", fields: [
    ...identity,
    { id: "world", type: "textarea" },
    { id: "backstory", type: "textarea" },
    { id: "motivation", type: "textarea" },
  ] },
  { id: "npc", fields: [
    ...identity,
    { id: "world", type: "textarea", required: true },
    { id: "function", type: "textarea", required: true },
    { id: "backstory", type: "textarea" },
    { id: "interaction", type: "textarea" },
    { id: "boundaries", type: "textarea" },
  ] },
];

export class PresetCatalog {
  constructor(private readonly i18n = new Localization()) {}

  list(locale: Locale = this.i18n.defaultLocale): PersonaPreset[] {
    return definitions.map((definition) => this._localize(definition, locale));
  }

  require(presetId: string, locale: Locale = this.i18n.defaultLocale): PersonaPreset {
    const preset = definitions.find((item) => item.id === presetId);
    if (!preset) {
      throw new ValidationError(`Unknown presetId: ${presetId}`);
    }
    return this._localize(preset, locale);
  }

  private _localize(definition: { id: string; fields: FieldDefinition[] }, locale: Locale): PersonaPreset {
    const tr = (key: string) => this.i18n.translate(locale, key);
    const fields = [{ id: "brief", type: "textarea" } as FieldDefinition, ...definition.fields]
      .map((field): FieldSpec => {
        const localized: FieldSpec = { ...field, label: tr(`field.${field.id}.label`) };
        const placeholderKey = `field.${field.id}.placeholder`;
        if (this.i18n.messages(locale)[placeholderKey]) {
          localized.placeholder = tr(placeholderKey);
        }
        if (field.id === "gender") {
          const keys = ["none", "female", "male", "nonbinary", "unspecified"];
          localized.optionLabels = Object.fromEntries(
            (field.options ?? []).map((value, index) => [value, tr(`option.gender.${keys[index]}`)]),
          );
        }
        return localized;
      });

    return {
      id: definition.id,
      label: tr(`preset.${definition.id}.label`),
      description: tr(`preset.${definition.id}.description`),
      guidance: tr(`preset.${definition.id}.guidance`),
      fields,
    };
  }
}
