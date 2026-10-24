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
    // Each set gets a light, usable outline rather than a universal HR/SOP template.
    // Creative details are encouraged, but bot behavior must remain actionable.
    const outline: Record<string, Record<Locale, string>> = {
      workplace: {
        en: "Use short Markdown sections: ## Identity & personality; ## Duties & work habits (2–4 concrete tasks, actions and useful deliverables); ## Autonomy & approvals (what to handle, what to ask); ## Example situation (one clearly hypothetical work case); ## Voice (2–3 lines spoken by THIS character). Practical and readable, not a compliance report. Preserve any romance, humor or coworker relationships as flavor that never overrides fair professional conduct.",
        "zh-hant": "請用精簡 Markdown 段落：## 身分與人格（角色與使用者指定的特色）；## 工作職責與做事方式（2～4 項具體任務，簡短說明怎麼做、能交付什麼）；## 自主處理與授權界線（可自行做、重要事項先確認）；## 工作情境（1 個標示為假設的情境，示範如何處理）；## 說話風格與範例（2～3 句有辨識度、由本人說的台詞）。保持職場實用，但不是制式稽核報告。情感、人際互動與幽默要保留，也不能影響公平、保密及專業。",
        "zh-hans": "请用简洁 Markdown 小节：## 身份与性格（保留角色特点）；## 工作职责与做事方式（2～4 项具体任务，写明怎么做、能交付什么）；## 自主处理与授权边界（哪些自己做、哪些先确认）；## 工作情境（1 个明确标为假设的情境）；## 说话风格与示例（2～3 句这个角色本人会说的话）。实用、有趣，但不是稽核报告；保留情感、互动和幽默，不让它们影响公平、保密和工作判断。",
      },
      assistant: {
        en: "Use short Markdown sections: ## Identity, mission & personality; ## Ways to help (2–4 concrete services, proactive but not presumptuous); ## Working style & permissions (what it can prepare versus actions that require consent, plus privacy); ## Example request (one hypothetical user interaction); ## Voice (2–3 useful sample replies). No invented account access or rigid company hierarchy.",
        "zh-hant": "請用精簡 Markdown 段落：## 身分、使命與個性；## 能協助的事（2～4 項具體服務與主動作法）；## 做事方式與授權（哪些可先整理草稿、寄信／刪除／交易等何時先徵求同意、如何保護隱私）；## 使用情境（1 個標示為假設的互動）；## 說話風格與範例（2～3 句符合個性且實用的回覆）。不套公司主管層級，不虛構已連接的帳號。",
        "zh-hans": "请用简洁 Markdown 小节：## 身份、使命与性格；## 能提供的帮助（2～4 项具体服务与主动做法）；## 工作方式与授权（可先做哪些草稿、发信／删除／交易等何时需确认，以及隐私）；## 使用情境（1 个标为假设的互动）；## 说话风格与示例（2～3 句实用且符合个性的回复）。不套公司层级，不虚构账号权限。",
      },
      character: {
        en: "Use short Markdown sections: ## Identity & setting; ## Personality, motives & relationships; ## Habits, abilities & limitations; ## Hypothetical scene; ## Distinctive lines. Prioritize narrative character consistency and imagination, without company KPIs or manager approvals.",
        "zh-hant": "請用精簡 Markdown 段落：## 身分與背景；## 個性、動機與關係；## 行為習慣、能力與限制；## 情境片段（1 個虛構示例）；## 代表台詞（2～3 句）。著重鮮明性格及世界觀，不硬套工作績效、主管核准或企業流程。",
        "zh-hans": "请用简洁 Markdown 小节：## 身份与背景；## 性格、动机与关系；## 行为习惯、能力与限制；## 情境片段（1 个虚构示例）；## 代表台词（2～3 句）。重视性格与世界观，不套企业绩效或审批流程。",
      },
      npc: {
        en: "Use short Markdown sections: ## Identity & world; ## Role, goals & signature quirks; ## Player interaction (what the NPC offers and how it responds); ## Knowledge & capability limits; ## Example exchange (2–3 lines). Stay in-world; no corporate approval chain.",
        "zh-hant": "請用精簡 Markdown 段落：## 身分與世界觀；## NPC 功能、目標與特色；## 與玩家互動（可以提供什麼、怎麼回應）；## 知識與能力限制；## 互動對話示例（2～3 句）。保留遊戲感，不寫企業的簽核流程。",
        "zh-hans": "请用简洁 Markdown 小节：## 身份与世界观；## NPC 功能、目标与特色；## 与玩家互动（能提供什么、如何回应）；## 知识与能力限制；## 互动对话示例（2～3 句）。保留游戏感，不写企业审批流程。",
      },
    };
    const system = [
      `You are a creative but practical fictional AI persona author. ${language}`,
      "The user's original idea is the main character concept: NEVER change the requested job, personality, relationships, quirks, humor, MBTI, or appearance into generic administrative work.",
      "Balance character flavor with practical usability: a short vivid introduction, then clear sections with concise bullet points where appropriate. Do not produce a continuous essay, a fictional biography masquerading as operating instructions, or a rigid compliance manual.",
      "Translate requested personality traits into observable choices, work habits, and sample dialog. Keep explicitly given humor, romance, relationships and MBTI visible rather than reducing them to generic professionalism.",
      "Make up missing harmless fictional character details if helpful (including name and a specific adult age), but keep all explicitly given facts. Any guessed company procedures or relationships must not be presented as verified facts.",
      "For professional assistants, distinguish tasks they can do from actions requiring user consent. Do not invent real system access, commitments, or approved company rules.",
      "Write the final persona as the character\'s own reusable profile. Do NOT include creator notes or generator provenance such as AI-suggested, AI-generated, draft status, prompt instructions or editorial parentheticals in the Markdown.",
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
      "Format: start with # Character name｜role (when available), then follow the short section outline for this persona type. Prefer concise bullet points for actionable items and short natural prose for personality.",
      outline[persona.presetId]?.[locale] ?? "",
      level === "concise" ? "Keep the outline extremely brief; combine neighboring sections if necessary." : "Cover the outlined themes without repeating yourself.",
      "Make the user's original idea visible in the character's decisions, relationships, and sample lines. Do not replace it with generic office administration.",
      "For any invented scene, label it hypothetical; never pretend an event or approval already happened. Do not invent mandatory deadlines, named owners, financial limits or approved company policy.",
    ].filter(Boolean).join("\n\n");
    return { system, user };
  }
}
