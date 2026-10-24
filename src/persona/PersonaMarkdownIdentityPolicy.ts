import type { PersonaRequest } from "../Types.js";
import { PersonaVisualIdentity } from "./PersonaVisualIdentity.js";

/**
 * Ensures the *same AI-chosen age* is explicitly visible in the finished
 * Markdown and the visual identity card. Never chooses an age in application
 * code. Invoked only after the text model has returned both artifacts.
 */
export class PersonaMarkdownIdentityPolicy {
  finalize(markdown: string, identity: PersonaVisualIdentity, persona: PersonaRequest): string {
    const age = identity.age.trim();
    if (!age || !/\d/.test(age)) {
      throw new Error("The text model must choose a concrete character age before avatar generation");
    }

    // Look only at the identity/introduction portion, not ages in later case
    // studies or third-party stories.
    const introduction = markdown.slice(0, 1250);
    const mentioned = introduction.match(/(?:^|\D)(\d{1,3})\s*(?:歲|岁|years?\s*old)/i);
    if (mentioned) {
      const resolved = age.match(/\d{1,3}/)?.[0];
      if (resolved && Number(mentioned[1]) !== Number(resolved)) {
        throw new Error("Markdown age conflicts with resolvedIdentity.age");
      }
      return markdown;
    }

    const locale = persona.locale ?? "en";
    const inferred = !persona.values.age;
    const label = locale === "zh-hant"
      ? `**年齡：${age} 歲${inferred ? "（AI 建議設定）" : ""}**`
      : locale === "zh-hans"
        ? `**年龄：${age} 岁${inferred ? "（AI 建议设定）" : ""}**`
        : `**Age: ${age}${inferred ? " (AI-proposed character detail)" : ""}**`;
    const header = markdown.match(/^(#{1,2}\s+[^\n]+)(\r?\n)/);
    if (header) return markdown.slice(0, header[0].length) + "\n" + label + "\n" + markdown.slice(header[0].length);
    return label + "\n\n" + markdown;
  }
}
