import { ZipArchive, type ZipEntry } from "./ZipArchive.js";
import type { PersonaRequest, PromptBundle } from "../Types.js";
import { ValidationError } from "../Errors.js";

export interface AvatarAsset {
  bytes: Uint8Array;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
}

export class PersonaPackageFactory {
  private readonly zip = new ZipArchive();
  private readonly encoder = new TextEncoder();

  create(persona: PersonaRequest, prompt: PromptBundle, markdown: string, avatar?: AvatarAsset): Uint8Array {
    const metadata = {
      version: 1,
      presetId: prompt.presetId,
      presetLabel: prompt.presetLabel,
      displayName: prompt.displayName,
      locale: persona.locale,
      avatarStyle: persona.avatarStyle,
      hasAvatar: Boolean(avatar),
      generator: "grokbot-persona-factory",
    };
    const entries: ZipEntry[] = [
      { name: "persona.md", data: this.encoder.encode(markdown) },
      { name: "manifest.json", data: this.encoder.encode(JSON.stringify(metadata, null, 2)) },
    ];
    if (avatar) {
      const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[avatar.mimeType];
      entries.push({ name: `avatar.${extension}`, data: avatar.bytes });
    }

    return this.zip.create(entries);
  }

  fromBase64(value: string, mimeType: "image/jpeg" | "image/png" | "image/webp"): AvatarAsset {
    const decoded = atob(value);
    const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
    if (bytes.length > 5_000_000) {
      throw new ValidationError("Avatar must be at most 5 MB");
    }
    const signatures = {
      "image/jpeg": bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
      "image/png": bytes.length >= 8 && bytes.slice(0, 8).every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index]),
      "image/webp": new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP",
    };
    if (!signatures[mimeType]) {
      throw new ValidationError("Avatar file does not match its MIME type");
    }

    return { bytes, mimeType };
  }
}
