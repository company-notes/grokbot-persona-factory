import type { PersonaRequest, PromptBundle } from "../Types.js";
import type { Locale } from "../i18n/Localization.js";

/**
 * Light public-playground generation brief for the hosted text models only.
 * The zero-AI /prompts and Grokbot flows retain their existing full contracts.
 * Never turn a character's personality into a generic company SOP.
 */
export class HostedPersonaBrief {
  compose(persona: PersonaRequest, prompt: PromptBundle): { system: string; user: string } {
    if (persona.existingMarkdown && persona.revisionInstructions) {
      return { system: prompt.systemPrompt, user: prompt.userPrompt };
    }
    const locale = (persona.locale ?? "en") as Locale;
    const language = {
      en: "Write natural English.",
      "zh-hant": "全文使用自然的繁體中文（臺灣），包括所有範例對話。",
      "zh-hans": "全文使用自然的简体中文，包括所有示例对话。",
    }[locale];
    const level = persona.detailLevel ?? "standard";
    const size = {
      en: { concise: "250–400 words", standard: "450–700 words", full: "800–1200 words" },
      "zh-hant": { concise: "350～550 字", standard: "650～1100 字", full: "1200～1900 字" },
      "zh-hans": { concise: "350～550 字", standard: "650～1100 字", full: "1200～1900 字" },
    }[locale][level];
    const focus: Record<string, Record<Locale, string>> = {
      workplace: {
        en: "A believable coworker: 2–4 role-specific duties, practical autonomy, simple approval boundaries and a couple of real-life examples. Do not demand KPI grids, three mandatory incidents, legalese or fictitious company policy.",
        "zh-hant": "工作同事：寫出 2～4 項符合職務的具體工作、能主動完成什麼、重要事情何時先詢問，加一兩個自然的工作互動。不要強制三種事件、逐項五欄表格、企業 SOP 或一大堆 Owner 簽核。",
        "zh-hans": "工作同事：写出 2～4 项符合岗位的工作、能自主完成什么、重要事项何时先确认，配一两个自然的工作互动。不强制三种事件、五栏表格或企业 SOP。",
      },
      assistant: {
        en: "Personal assistant: useful help, communication style, initiative and clear consent before consequential actions.",
        "zh-hant": "個人助理：重點是貼心且實用的協助、說話方式、主動性，以及寄信、刪除或其他重要操作前的授權。",
        "zh-hans": "个人助理：重在贴心实用的协助、说话方式、主动性，以及发信、删除等重要操作前取得授权。",
      },
      character: {
        en: "Fictional character: rich personality, motivations, relationships and believable scenes; no workplace paperwork.",
        "zh-hant": "故事人物：突出個性、動機、人際關係及精彩的互動，不必硬套職場流程。",
        "zh-hans": "故事人物：突出性格、动机、人际关系和鲜活互动，不套企业工作流程。",
      },
      npc: {
        en: "NPC: worldbuilding, memorable behavior, player interactions and appropriate in-world limits.",
        "zh-hant": "NPC：凸顯世界觀、鮮明行為、玩家互動與故事內的合理限制。",
        "zh-hans": "NPC：突出世界观、鲜明行为、玩家互动和故事内的合理限制。",
      },
    };
    const system = [
      `You are a creative but practical fictional AI persona author. ${language}`,
      "The user's original idea is the main character concept: NEVER change the requested job, personality, relationships, quirks, humor, MBTI, or appearance into generic administrative work.",
      "Give the character a distinctive voice, believable behavior, a little charm, and examples that sound like THEM. Make it enjoyable to read and useful for a roleplaying or assistant bot.",
      "Make up missing harmless fictional character details if helpful (including name and a specific adult age), but keep all explicitly given facts. Any guessed company procedures or relationships must not be presented as verified facts.",
      "For professional assistants, distinguish tasks they can do from actions requiring user consent. Do not invent real system access, commitments, or approved company rules.",
      "Output Markdown only unless a later API transport instruction requests a short identity card before the Markdown.",
    ].join("\n");
    const original = (persona.values.brief ?? "").trim();
    const provided = Object.entries(persona.values)
      .filter(([field, value]) => field !== "brief" && typeof value === "string" && value.trim())
      .map(([field, value]) => `- ${field}: ${value}`).join("\n");
    const user = [
      `Persona set: ${prompt.presetLabel} (${persona.presetId})`,
      `Original idea (MOST IMPORTANT):\n${original || "(see explicit details below)"}`,
      `Other user-specified details:\n${provided || "(none)"}`,
      `Expected length: approximately ${size}.`,
      focus[persona.presetId]?.[locale] ?? "",
      "Show who the character is, how they actually act and speak, and how they handle a typical situation. Do not repeat the brief as a list or bury its distinctive traits.",
      "If a scene or example is invented, make it clear it is an example, not a record of real completed company work.",
    ].filter(Boolean).join("\n\n");
    return { system, user };
  }
}
