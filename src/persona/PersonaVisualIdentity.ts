import type { PersonaRequest } from "../Types.js";
import type { Locale } from "../i18n/Localization.js";
import { AvatarRegionalContext } from "../avatar/AvatarRegionalContext.js";

export type VisualGender = "female" | "male" | "nonbinary" | "unspecified";

/**
 * Single source of truth for the text persona's immutable visual facts
 * and the picture's casting, age, job, appearance and demeanor.
 * Missing facts remain missing: NEVER guess gender from a name or locale.
 */
export class PersonaVisualIdentity {
  readonly name: string;
  readonly gender: VisualGender;
  readonly age: string;
  readonly appearance: string;
  readonly origin: string;
  readonly role: string;
  readonly personality: string;
  readonly visualTone: string;

  constructor(private readonly persona: PersonaRequest, private readonly region = new AvatarRegionalContext()) {
    const v = persona.values;
    const brief = v.brief ?? "";
    this.name = this.clean(v.name, 80);
    this.gender = this.readGender(v.gender, brief);
    this.age = this.clean(v.age, 24) || this.ageInBrief(brief);
    this.appearance = this.clean(v.appearance, 420);
    this.origin = this.clean(v.origin, 160);
    this.role = this.clean([v.department, v.role].filter(Boolean).join(" — "), 160);
    this.personality = this.clean(v.personality || v.workStyle || brief, 240);
    this.visualTone = this.tone([this.personality, brief].join(" "));
  }

  /** Mandatory casting facts are first, to survive image-prompt length limits. */
  englishAnchor(): string {
    const subject = this.gender === "female"
      ? "Exactly ONE adult WOMAN. The only person in the picture is a woman with feminine visual presentation. Never depict a man. No male subject."
      : this.gender === "male"
        ? "Exactly ONE adult MAN. The only person in the picture is a man with masculine visual presentation. Never depict a woman. No female subject."
        : this.gender === "nonbinary"
          ? "Exactly ONE nonbinary adult character. Preserve the user's specified gender presentation; do not arbitrarily force male or female cues."
          : "Exactly ONE adult person. Gender was not specified; do not infer it from their name or UI language.";
    return [
      "SINGLE CHARACTER IDENTITY — MUST MATCH PERSONA:",
      subject,
      this.age ? `The single subject appears ${this.age} years old; age-appropriate adult face, not a child and not visibly decades older.` : "",
      this.role ? `Professional context: ${this.role}. Clothing and demeanor should suit this role; do not change the person's gender, age or clothing to fit a generic stock-photo archetype.` : "",
      `Facial expression and body language: ${this.visualTone}.`,
    ].filter(Boolean).join(" ");
  }

  englishDetails(): string {
    return [
      this.name ? `Character name (reference only, no text): ${this.name}.` : "",
      this.gender !== "unspecified" ? `Gender presentation: ${this.gender}.` : "",
      this.age ? `Apparent age: ${this.age}.` : "",
      this.appearance ? `Exact appearance and clothing specified by the user: ${this.appearance}.` : "",
      this.personality ? `Character disposition: ${this.personality}.` : "",
      this.region.guidance(this.persona).english,
    ].filter(Boolean).join(" ");
  }

  /**
   * The same anchor is passed to the text model and external Grokbot prompt.
   * Regional fallback is intentionally absent: locale is not a nationality.
   */
  textAnchor(locale: Locale): string {
    const lines = ({
      en: {
        head: "Character identity lock (shared by biography and avatar):",
        gender: { female: "woman / female", male: "man / male", nonbinary: "nonbinary", unspecified: "not specified (do not guess)" },
        age: "Age", look: "Appearance", job: "Role", mood: "Personality and photographic demeanor", origin: "User-provided regional background",
        rule: "The generated Markdown and the avatar must describe the same individual. Do not contradict these facts or invent a fixed gender, age or nationality if absent. Treat the region inferred from UI language as a visual default only, never as an identity fact.",
      },
      "zh-hant": {
        head: "【文字人設與頭像共用的角色事實】",
        gender: { female: "女性", male: "男性", nonbinary: "非二元", unspecified: "未指定（不可依姓名猜測）" },
        age: "年齡", look: "外貌與穿著", job: "職務", mood: "人格與視覺氣質", origin: "使用者提供的國籍／地域背景",
        rule: "Markdown 人設與頭像必須是同一個角色；不能擅改性別、年齡、外貌或穿著。缺少的性別、年齡、國籍不得依姓名或介面語言虛構。繁中臺灣視覺預設僅限圖像，不等於身分事實。",
      },
      "zh-hans": {
        head: "【文字人设与头像共用的角色事实】",
        gender: { female: "女性", male: "男性", nonbinary: "非二元", unspecified: "未指定（不可按姓名猜测）" },
        age: "年龄", look: "外貌与服装", job: "职务", mood: "性格及形象气质", origin: "用户提供的国籍／地域背景",
        rule: "Markdown 人设与头像必须是同一个人物；不能擅改性别、年龄、外貌或服装。缺少的性别、年龄、国籍不得按姓名或界面语言虚构。简中大陆视觉预设仅用于图像，并非身份事实。",
      },
    })[locale];
    return [
      lines.head,
      `- Gender / 性別：${lines.gender[this.gender]}`,
      this.age ? `- ${lines.age}：${this.age}` : "",
      this.appearance ? `- ${lines.look}：${this.appearance}` : "",
      this.role ? `- ${lines.job}：${this.role}` : "",
      this.personality ? `- ${lines.mood}：${this.personality}` : "",
      this.origin ? `- ${lines.origin}：${this.origin}` : "",
      lines.rule,
    ].filter(Boolean).join("\n");
  }

  localizedImageAnchor(locale: Locale): string {
    const gender: Record<Locale, Record<VisualGender, string>> = {
      en: { female: "Exactly ONE adult woman, NOT a man.", male: "Exactly ONE adult man, NOT a woman.", nonbinary: "Exactly one nonbinary adult, follow their stated presentation.", unspecified: "Exactly one adult person; gender is not specified." },
      "zh-hant": { female: "畫面必須只有一位成年女性，不可畫成男性。", male: "畫面必須只有一位成年男性，不可畫成女性。", nonbinary: "畫面只有一位非二元成年人物，遵守指定性別呈現。", unspecified: "畫面只有一位成年人物，未指定性別，不得依姓名猜測。" },
      "zh-hans": { female: "画面只能有一位成年女性，不得画成男性。", male: "画面只能有一位成年男性，不得画成女性。", nonbinary: "画面只有一位非二元成年人物，遵守指定性别呈现。", unspecified: "画面只有一位成年人，未指定性别，不按姓名猜测。" },
    };
    const age = this.age ? ({
      en: `The subject must look approximately ${this.age} years old.`,
      "zh-hant": `外觀年齡約 ${this.age} 歲，符合其成年年齡感。`,
      "zh-hans": `外观年龄约 ${this.age} 岁，符合其成年年龄感。`,
    })[locale] : "";
    return [gender[locale][this.gender], age].filter(Boolean).join(" ");
  }

  private clean(s: string | undefined, max: number): string {
    return (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  }

  private readGender(explicit: string | undefined, brief: string): VisualGender {
    const fromSelect: Record<string, VisualGender> = {
      "女性": "female", "男性": "male", "非二元": "nonbinary", "不限／不設定": "unspecified",
    };
    if (explicit) return fromSelect[explicit] ?? "unspecified";
    const female = /(?:女性|女生|女主管|女助理|女員工|女客服|女工程師|女角色|女同事|女律師|女醫師|\bfemale\b|\bwoman\b|\bwomen\b)/i.test(brief);
    const male = /(?:男性|男生|男主管|男助理|男員工|男客服|男工程師|男角色|男同事|男律師|男醫師|\bmale\b|\bman\b|\bmen\b)/i.test(brief);
    if (female && !male) return "female";
    if (male && !female) return "male";
    return "unspecified";
  }

  private ageInBrief(brief: string): string {
    const match = brief.match(/(?:^|\D)(\d{1,3})\s*(?:歲|岁|years? old|yo\b)/i);
    return match ? match[1] : "";
  }

  private tone(text: string): string {
    const cues: string[] = [];
    if (/細心|细心|謹慎|谨慎|認真|认真|慎重|careful|meticulous|detail/i.test(text)) cues.push("attentive, composed, observant");
    if (/沉穩|沉稳|穩重|稳重|冷靜|冷静|calm|steady|reserved/i.test(text)) cues.push("calm and confident, restrained professional posture");
    if (/親切|亲切|溫柔|温柔|友善|友好|warm|friendly|approachable/i.test(text)) cues.push("subtly warm and approachable smile");
    if (/幽默|幽默|風趣|风趣|humor|playful|witty/i.test(text)) cues.push("a subtle relaxed sense of humor, not exaggerated");
    if (/活潑|活泼|外向|energetic|outgoing/i.test(text)) cues.push("open and lively eyes with natural energy");
    return cues.length ? cues.join("; ") : "natural, believable expression fitting the described personality";
  }
}
