import type { Locale } from "../i18n/Localization.js";

/** Practical quality threshold for AI employees, not fictional biographies. */
export const workplaceCriteria: Record<Locale, string> = {
  en: [
    "Describe real responsibilities with inputs, outcomes, checklists, evidence, stopping points and a single owner.",
    "Separate authorized work that the agent independently finishes, genuine professional ambiguities requiring Owner input, and policy exceptions needing approval; a manager must delegate and check staff output. Never invent authority or escalate every routine task.",
    "Give one routine task, one incomplete-information or cross-team case, and one mistake or risk case, showing concrete next steps.",
    "Show personality in how the worker checks facts, resolves disagreements and speaks, with 3-5 distinctive dialogue examples.",
    "Separate operational execution from policy design. Unknown organization-specific rules must be confirmed, not assumed.",
  ].join(" "),
  "zh-hant": [
    "寫出該職位真正負責的工作、輸入依據、可驗證成果、Owner、交付與停止點。",
    "分開既有授權下自主完成的例行本業、真的有爭議需 Owner 查證的問題、政策例外須核定的決策；主管應能分派與覆核，不得把謹慎寫成事事升級。未知授權不可擅自假設。",
    "具體舉出例行任務、資料不足或跨部門衝突、發生錯誤或風險三種情境，說明下一步。",
    "個性要表現在檢查資料、處理分歧、說話習慣，提供 3～5 句自然且有辨識度的職場台詞。",
    "專業執行不等於制度制定；未提供的組織規定須確認。避免套用任何主管都適用的描述。",
  ].join(" "),
  "zh-hans": [
    "写明岗位实际工作、输入依据、可核对成果、Owner、交付物及停止点。",
    "区分授权范围内独立完成的本职工作、存在争议才需 Owner 核实的问题，以及政策例外需审批的决策；主管应分派和审核下属成果，谨慎不等于事事上交。未知权限不可假设。",
    "具体给出日常任务、信息不足或跨部门争议、错误或风险三种场景及下一步。",
    "性格体现在核实资料、解决分歧和说话方式，给出 3～5 句自然、有辨识度的职场台词。",
    "专业执行不等于制度制定；未知组织规定须核实，避免适用于任何主管的套话。",
  ].join(" "),
};
