import type { PersonaRequest } from "../Types.js";
import type { Locale } from "../i18n/Localization.js";
import { workplaceCriteria } from "./WorkplaceQualityCriteria.js";

export class PersonaQualityPolicy {
  guidance(persona: PersonaRequest, locale: Locale): string {
    if (persona.existingMarkdown && persona.revisionInstructions) {
      return { en: "Edit only the requested sections.", "zh-hant": "只修改指定段落，保留其餘內容。", "zh-hans": "只修改指定段落，保留其他内容。" }[locale];
    }
    const detail = persona.detailLevel ?? "standard";
    const levels = {
      en: { concise: "Concise, 300-500 words.", standard: "Standard, 650-1000 words.", full: "Full, 1100-1600 words." },
      "zh-hant": { concise: "精簡：450～750 字。", standard: "標準：1100～1800 字。", full: "完整：1900～2800 字。" },
      "zh-hans": { concise: "精简：450～750 字。", standard: "标准：1100～1800 字。", full: "完整：1900～2800 字。" },
    } as const;
    const job = {
      en: "Show role-specific actions, deliverables, owner, authority and escalation. Give routine, uncertain and error scenarios. Use realistic dialogue.",
      "zh-hant": "具體呈現專業職責、成果、Owner、授權與回報；示範例行任務、資訊不足及錯誤處理，附自然台詞。",
      "zh-hans": "具体呈现职责、成果、Owner、权限和汇报；示范日常任务、信息不足及错误处理，附自然对话。",
    };
    const other: Record<string, Record<Locale, string>> = {
      assistant: {
        en: "Focus on initiative, user preferences, confidentiality, clarification, daily routines, reporting and escalation. Give realistic assistant dialogue.",
        "zh-hant": "個人助理聚焦主動協助、使用者偏好、保密、確認問題、日常流程與回報；提供真實助理對話，不套企業主管職責。",
        "zh-hans": "个人助理聚焦主动协助、用户偏好、保密、澄清问题、日常流程与汇报；给出真实对话，不套企业主管职责。",
      },
      character: {
        en: "Focus on motivation, contradictions, past experiences, speech and believable reactions in specific situations.",
        "zh-hant": "故事角色聚焦動機、性格矛盾、背景、語氣及情境反應，不強制企業管理規則。",
        "zh-hans": "故事角色聚焦动机、性格矛盾、背景、语气和情境反应，不套企业管理规定。",
      },
      npc: {
        en: "Focus on in-world function, motivations, dialogue and player interaction rules and limits.",
        "zh-hant": "NPC 聚焦世界觀內功能、動機、對話及玩家互動規則和限制。",
        "zh-hans": "NPC 聚焦世界观内功能、动机、对话和玩家互动规则与限制。",
      },
    };
    return [levels[locale][detail], persona.presetId === "workplace" ? job[locale] + " " + workplaceCriteria[locale] : (other[persona.presetId]?.[locale] ?? "")].join("\n");
  }
}
