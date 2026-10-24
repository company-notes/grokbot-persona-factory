import type { PackageRequest, PersonaRequest, PersonaPreset } from "../Types.js";
import { ValidationError } from "../Errors.js";
import { AvatarStyles } from "../avatar/AvatarStyles.js";
import { Localization } from "../i18n/Localization.js";

export class PersonaValidator {
  constructor(private readonly i18n = new Localization()) {}

  validate(persona: PersonaRequest, preset: PersonaPreset): PersonaRequest {
    if (!persona || typeof persona !== "object" || !persona.values || typeof persona.values !== "object" || Array.isArray(persona.values)) {
      throw new ValidationError("persona and values are required");
    }

    const allowedFields = new Set(preset.fields.map((field) => field.id));
    const values: Record<string, string> = {};
    for (const [key, value] of Object.entries(persona.values)) {
      if (!allowedFields.has(key) || typeof value !== "string" || value.length > 2000) {
        throw new ValidationError(`Invalid field: ${key}`);
      }
      values[key] = value.trim();
    }

    const hasBrief = Boolean(values.brief);
    for (const field of preset.fields) {
      if (!hasBrief && field.required && !values[field.id]) {
        throw new ValidationError(`${field.label} is required`);
      }
      if (field.type === "select" && values[field.id] && !field.options?.includes(values[field.id])) {
        throw new ValidationError(`Invalid option: ${field.id}`);
      }
    }

    if (persona.includeAvatar !== undefined && typeof persona.includeAvatar !== "boolean") {
      throw new ValidationError("includeAvatar must be boolean");
    }
    if (persona.existingMarkdown !== undefined) {
      if (typeof persona.existingMarkdown !== "string" || !persona.existingMarkdown.trim() || persona.existingMarkdown.length > 40000) {
        throw new ValidationError("existingMarkdown must be 1-40000 characters");
      }
    }
    if (persona.revisionInstructions !== undefined) {
      if (typeof persona.revisionInstructions !== "string" || !persona.revisionInstructions.trim() || persona.revisionInstructions.length > 2000 || !persona.existingMarkdown) {
        throw new ValidationError("revisionInstructions requires an existingMarkdown draft and must be 1-2000 characters");
      }
    }

    if (persona.detailLevel !== undefined && !["concise", "standard", "full"].includes(persona.detailLevel)) {
      throw new ValidationError("Invalid detailLevel");
    }
    const avatarStyle = new AvatarStyles().require(persona.avatarStyle);

    return {
      avatarStyle,
      detailLevel: persona.detailLevel ?? "standard",
      presetId: preset.id,
      values,
      locale: this.i18n.normalize(persona.locale),
      includeAvatar: persona.includeAvatar ?? true,
      ...(persona.existingMarkdown ? { existingMarkdown: persona.existingMarkdown } : {}),
      ...(persona.revisionInstructions ? { revisionInstructions: persona.revisionInstructions } : {}),
    };
  }

  validatePackage(input: PackageRequest): void {
    if (typeof input.markdown !== "string" || !input.markdown.trim() || input.markdown.length > 40000) {
      throw new ValidationError("markdown must be 1-40000 characters");
    }
    if (!input.avatarBase64) {
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(input.avatarMimeType ?? "")) {
      throw new ValidationError("avatarMimeType must be an image MIME type");
    }
    if (input.avatarBase64.length > 6_800_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(input.avatarBase64)) {
      throw new ValidationError("avatarBase64 is invalid or larger than 5 MB");
    }
  }
}
