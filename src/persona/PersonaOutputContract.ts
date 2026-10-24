import type { PersonaRequest } from "../Types.js";
import type { Locale } from "../i18n/Localization.js";

/** Defines the required structure and self-check for a NEW persona. */
export class PersonaOutputContract {
  private readonly workplace: Record<Locale, string[]> = {
    en: [
      "OUTPUT CONTRACT FOR A WORKPLACE AI EMPLOYEE (use these section headings, not a generic 8-section biography):",
      "## Identity and working character — explicitly repeat all provided identity facts, including age, name and disposition; show how temperament changes actions.",
      "## Responsibilities and verifiable deliverables — at least 3 profession-specific duties, not merely generic paperwork, coordination and risk lists; for each specify inputs, own actions, deliverables, verification and stop points. Managers must delegate, review staff results and correct process errors.",
      "## Authority and decision boundaries — distinguish (1) routine work completed independently within approved procedures, (2) real policy ambiguity or disputes needing professional Owner validation, (3) changes or major exceptions requiring approval. Caution is not reflexive escalation. Unknown authority must remain provisional.",
      "## Three concrete working scenarios — separately give A. routine execution; B. missing facts or cross-team disagreement; C. an error, exception or risk. EACH must show trigger, source checks, action, handoff and recorded outcome.",
      "## Collaboration and reporting — manager task delegation, review and correction of team output; clear handoffs, evidence trail, deadline/priority handling and a concise example progress report.",
      "## Distinctive voice — 3-5 natural, role-specific quotes showing the requested personality in behavior, not just adjectives.",
      "## Boundaries and facts to confirm — confidentiality, scope limitations and unknown policies requiring the correct Owner. No duplicated 'character summary'.",
      "Do not invent MBTI types, precise tenure, real staff counts, named colleagues, due dates, internal SOPs, payroll periods, percentages or approved budgets. Each invented scenario AND example progress report must begin with 'Hypothetical example / not company data'. Prefer placeholders to invented counts, dates or deadlines.",
      "MANDATORY PRIVATE SELF-CHECK: Before answering, verify every supplied fact is preserved; each section contains actionable content; all 3 scenarios and 3 dialogue examples exist; no generic filler, unsupported policy or inferred authority. Rewrite missing pieces before submitting. Output only the finished Markdown.",
    ],
    "zh-hant": [
      "【公司 AI 員工輸出契約】請依下列章節產出真正可操作的人設，不得沿用舊式「身分與定位／目標與職責／角色總結」八章節空泛介紹：",
      "## 固定身分與人格行為：明確寫出使用者提供的姓名、英文名、年齡、性別、外觀及個性（有提供才寫），並舉出特質如何影響查證與決策。",
      "## 核心職責與可驗證成果：至少三項該專業本業（不可全是通用資料整理、進度協調、風險彙整）；每項寫輸入、本人執行動作、交付物、覆核及停止點。主管也須具體交代如何分派任務、覆核部屬成果、修正作業錯誤。",
      "## 決策權限與責任分工：分成①已確認授權內可自主執行、完成並結案的例行工作②僅在制度不明、資料爭議或專業界線不清時需 Owner 查證③政策變更、重大例外等必須權責主管核定。謹慎不代表事事升級；未提供的授權只能寫『建議分工／待確認』，不可假裝已核定。",
      "## 三種實際工作情境：分別寫【例行任務】【資訊不足／跨部門爭議】【錯誤／風險事件】。每個情境都必須寫觸發原因→查核來源→本人採取動作→向誰交接／核准→留下哪些紀錄／成果；不能只列情境標題。",
      "## 協作與工作回報：具體寫主管分工、部屬覆核、交接、查核紀錄與期限管理，提供一段結論先行且可採取行動的主管回報示例。",
      "## 個人說話風格與範例：提供 3～5 句有該職位專業判斷、符合指定個性的自然對話；不能用「大家好，請積極參與」之類通用台詞代替幽默感。",
      "## 工作界線與待確認事項：寫個資與保密界線、停止點、未核定制度及需查證的組織分工；不要另外寫重複前文的「角色總結」。",
      "不可擅自補上未指定的 MBTI、精確資歷、員工人數、主管姓名、每月結算日期、抽查比例、預算或既有 SOP。每個假設工作情境與回報範例開頭都必須標示『假設案例／非公司現況』；未提供的數字、姓名與期限盡量使用佔位符，絕不可把示例寫成實際工作進度。",
      "【提交前內部驗收】逐一核對輸入中的姓名、年齡、個性、職稱等事實都有保留；三種具體情境、交付物、三層權限與 3 句以上台詞齊備；沒有自行擴張招募、考核、調薪等權限。任何缺漏先在內部補完，再只輸出完成的 Markdown，不列出驗收清單。",
    ],
    "zh-hans": [
      "【企业 AI 员工输出标准】使用以下具体结构，不要沿用旧版八段式通用人物介绍：",
      "## 固定身份与个性行为：保留用户给出的姓名、英文名、年龄、性别、外貌及性格（只写已提供的事实），并展示性格如何影响工作。",
      "## 核心职责与可核对成果：至少三项专业本职任务，不能全是整理资料及协调进度；分别写输入、本人执行、交付物、核查与停止点。主管还须分派任务、审核下属成果并纠正错误。",
      "## 决策权限与职责分工：区分①按现有授权和已批准流程独立完成日常本职工作②政策疑问或资料争议才找 Owner 核实③重大例外或制度变化才需批准。谨慎不等于事事上交；未知权限标为建议／待确认。",
      "## 三种具体工作场景：分别描述日常任务、信息不足或跨部门争议、错误或风险。每个场景写触发→核查资料→采取行动→交接或审批→记录和成果。",
      "## 协作与汇报：主管描述任务分配、下属成果审核与错误改善；明确记录、交接、期限及简短汇报示例。",
      "## 个性化语言与示例：给出 3～5 句符合专业、性格且不空泛的工作对话。",
      "## 边界与待确认事项：隐私、保密、未核实制度；不得额外重复职位总结。",
      "不可自行添加未经指定的 MBTI、具体年资、员工人数、主管姓名、结算日期、抽查比例、预算及现成 SOP。每个虚构工作场景和汇报示例开头必须标明「假设案例／非公司现况」；未知数字、期限和人名应使用占位符，不能伪装成真实进度。",
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
        en: "ROLE EXAMPLE (provisional, not a company fact): HR administration typically executes approved payroll/bonus calculations and checks, attendance/leave, insurance/benefits, personnel changes and onboarding/offboarding. Its manager delegates, reviews results and completes authorized routine work, rather than referring each payroll or insurance task away. Policy design, promotions, evaluations, pay changes and major exceptions require the confirmed authority; never assume a company policy.",
        "zh-hant": "【人事行政專業示例，非已確認公司制度】列出已核定制度下的薪資／獎金核算及覆核、考勤休假、勞健保與福利行政、人事異動及到離職行政等本業；主管負責分派、覆核團隊成果，在授權內自行完成例行執行。只有制度設計、績效晉升決策、調薪或重大例外才依實際權責確認／核定，勿將每筆薪資或保險工作轉交別人。公司權限不明須標示待確認。",
        "zh-hans": "【人事行政示例，非已核实公司制度】人事行政应包括已批准规则下的薪资／奖金核算与复核、考勤休假、保险福利、人事异动及入离职行政。主管分派、审核并完成授权内的日常执行，不把所有工资和保险业务转交其他 Owner。政策制定、绩效与晋升决策、调薪或重大例外才按实际分工核准，未知授权标为待确认。",
      })[locale]);
    }
    return lines;
  }
}
