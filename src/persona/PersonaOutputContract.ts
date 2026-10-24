import type { PersonaRequest } from "../Types.js";
import type { Locale } from "../i18n/Localization.js";

/** Defines the required structure and self-check for a NEW persona. */
export class PersonaOutputContract {
  private readonly workplace: Record<Locale, string[]> = {
    en: [
      "OUTPUT CONTRACT FOR A WORKPLACE AI EMPLOYEE (use these section headings, not a generic 8-section biography):",
      "## Identity and working character — explicitly repeat all provided identity facts, including age, name and disposition; show how temperament changes actions.",
      "## Responsibilities and verifiable deliverables — at least 3 role-relevant duties, each with inputs, action, tangible deliverable, how to verify and stopping point.",
      "## Authority and decision boundaries — distinguish (1) routine actions within confirmed authorization, (2) expert Owner verification, (3) approvals. Label proposed division of responsibility as provisional when unconfirmed.",
      "## Three concrete working scenarios — separately give A. routine execution; B. missing facts or cross-team disagreement; C. an error, exception or risk. EACH must show trigger, source checks, action, handoff and recorded outcome.",
      "## Collaboration and reporting — clear handoffs, evidence trail, deadline/priority handling and a concise example progress report.",
      "## Distinctive voice — 3-5 natural, role-specific quotes showing the requested personality in behavior, not just adjectives.",
      "## Boundaries and facts to confirm — confidentiality, scope limitations and unknown policies requiring the correct Owner. No duplicated 'character summary'.",
      "Do not invent MBTI types, precise tenure, real staff counts, named colleagues, due dates, internal SOPs, payroll periods, percentages or approved budgets. Hypothetical examples must be explicitly labeled as scenarios, not existing company facts.",
      "MANDATORY PRIVATE SELF-CHECK: Before answering, verify every supplied fact is preserved; each section contains actionable content; all 3 scenarios and 3 dialogue examples exist; no generic filler, unsupported policy or inferred authority. Rewrite missing pieces before submitting. Output only the finished Markdown.",
    ],
    "zh-hant": [
      "【公司 AI 員工輸出契約】請依下列章節產出真正可操作的人設，不得沿用舊式「身分與定位／目標與職責／角色總結」八章節空泛介紹：",
      "## 固定身分與人格行為：明確寫出使用者提供的姓名、英文名、年齡、性別、外觀及個性（有提供才寫），並舉出特質如何影響查證與決策。",
      "## 核心職責與可驗證成果：至少三項與該職位真正相關的工作；每項寫輸入依據、執行動作、可交付成果、覆核方式及責任停止點，不能只寫「管理日常事務」。",
      "## 決策權限與責任分工：分成①既有授權下可自行處理②需專業 Owner 查證③必須權責主管核定；未提供的權限只能寫『建議分工／待確認』，不可假裝已核定。",
      "## 三種實際工作情境：分別寫【例行任務】【資訊不足／跨部門爭議】【錯誤／風險事件】。每個情境都必須寫觸發原因→查核來源→本人採取動作→向誰交接／核准→留下哪些紀錄／成果；不能只列情境標題。",
      "## 協作與工作回報：具體寫移交、查核紀錄、期限管理，提供一段結論先行且可採取行動的主管回報示例。",
      "## 個人說話風格與範例：提供 3～5 句有該職位專業判斷、符合指定個性的自然對話；不能用「大家好，請積極參與」之類通用台詞代替幽默感。",
      "## 工作界線與待確認事項：寫個資與保密界線、停止點、未核定制度及需查證的組織分工；不要另外寫重複前文的「角色總結」。",
      "不可擅自補上未指定的 MBTI、精確資歷、員工人數、主管姓名、每月結算日期、抽查比例、預算或既有 SOP。情境裡需要示範數字時，明確標示『假設案例』，不可寫成公司的現況。",
      "【提交前內部驗收】逐一核對輸入中的姓名、年齡、個性、職稱等事實都有保留；三種具體情境、交付物、三層權限與 3 句以上台詞齊備；沒有自行擴張招募、考核、調薪等權限。任何缺漏先在內部補完，再只輸出完成的 Markdown，不列出驗收清單。",
    ],
    "zh-hans": [
      "【企业 AI 员工输出标准】使用以下具体结构，不要沿用旧版八段式通用人物介绍：",
      "## 固定身份与个性行为：保留用户给出的姓名、英文名、年龄、性别、外貌及性格（只写已提供的事实），并展示性格如何影响工作。",
      "## 核心职责与可核对成果：至少三项与岗位有关的任务，分别写输入依据、执行、交付物、核对方法及责任停止点。",
      "## 决策权限与职责分工：区分①在已确认授权内自行执行②需要专业 Owner 核实③需要负责人审批；未知权限一律标为建议／待确认。",
      "## 三种具体工作场景：分别描述日常任务、信息不足或跨部门争议、错误或风险。每个场景写触发→核查资料→采取行动→交接或审批→记录和成果。",
      "## 协作与汇报：明确记录、交接、期限与可执行的简短报告示例。",
      "## 个性化语言与示例：给出 3～5 句符合专业、性格且不空泛的工作对话。",
      "## 边界与待确认事项：隐私、保密、未核实制度；不得额外重复职位总结。",
      "不可自行添加未经指定的 MBTI、具体年资、员工人数、主管姓名、结算日期、抽查比例、预算及现成 SOP。举例数字须标明是假设情境，不可写成公司事实。",
      "【输出前自检】所有提供的事实（尤其姓名、年龄、性格、岗位）完整；三类场景、成果、三层权限和对话均具备；无编造的招聘、绩效、加薪权力。发现缺失先修改，只输出完成的 Markdown。",
    ],
  };

  private readonly other: Record<string, Record<Locale, string>> = {
    assistant: {
      en: "Structure: identity and preferences; initiative and daily workflows; privacy and authority; 2 realistic situations; 3 natural example messages. Preserve every given fact and do not apply corporate manager requirements.",
      "zh-hant": "請依個人助理用途具體寫：固定人格與偏好、主動協助與日常流程、隱私及授權、兩個工作情境、三句自然對話；保留所有指定事實，不套企業主管章節。",
      "zh-hans": "按个人助理用途写：个性与偏好、主动协助和日常流程、隐私权限、两个场景、三句自然对话；保留所有事实，不套企业主管结构。",
    },
    character: {
      en: "Structure: identity and explicit facts; motivating needs; inner conflict and decisions; two representative scenes; distinctive speech. No workplace checklist.",
      "zh-hant": "依故事角色寫：身分與指定事實、核心動機、性格矛盾與選擇、兩個故事情境、個人聲線；不要套用企業 SOP。",
      "zh-hans": "按故事人物写：身份与事实、核心动机、矛盾及选择、两段情境、独特语气；不套企业 SOP。",
    },
    npc: {
      en: "Structure: in-world identity; function; interaction boundaries; two player encounters with dialogue. Preserve user facts; no corporate approvals.",
      "zh-hant": "依 NPC 用途寫：世界觀身分、功能、互動界線、兩段玩家互動與台詞；保留指定事實，不套公司簽核。",
      "zh-hans": "按 NPC 用途写：世界观身份、功能、互动边界、两段玩家交互与台词；保留事实，不套企业审批。",
    },
  };

  instructions(persona: PersonaRequest, locale: Locale): string[] {
    if (persona.existingMarkdown && persona.revisionInstructions) {
      return [];
    }
    const lines = persona.presetId === "workplace"
      ? [...this.workplace[locale]]
      : [this.other[persona.presetId]?.[locale] ?? ""];
    const hrRole = [persona.values.department, persona.values.role].join(" ");
    if (persona.presetId === "workplace" && /人事行政|HR administration|People Operations/i.test(hrRole)) {
      lines.push(({
        en: "ROLE EXAMPLE (provisional, not a company fact): HR administration may execute approved attendance, payroll and insurance record procedures; recruiting policy, evaluations, promotions and pay changes require verification of the actual policy Owner. Do not assume they belong to this department.",
        "zh-hant": "【人事行政專業示例，非已確認公司制度】可描述依核定資料處理出勤、薪資核算、保險及人事紀錄；招募制度、績效考核決定、晉升與調薪不應自動歸給人事行政主管，須標示由實際權責 Owner 確認。",
        "zh-hans": "【人事行政示例，非已核实公司制度】可描述按已批准资料处理考勤、薪资核算、保险与人事记录；招聘制度、绩效决定、晋升和调薪不能默认归人事行政主管，应由实际 Owner 确认。",
      })[locale]);
    }
    return lines;
  }
}
