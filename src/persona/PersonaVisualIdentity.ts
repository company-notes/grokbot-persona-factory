import type { PersonaRequest } from "../Types.js";
import type { Locale } from "../i18n/Localization.js";
import { AvatarRegionalContext } from "../avatar/AvatarRegionalContext.js";
import { ValidationError } from "../Errors.js";

export type VisualGender = "female" | "male" | "nonbinary" | "unspecified";
export type IdentitySource = "user" | "ai";

export interface ResolvedIdentity {
  name?: string;
  gender: VisualGender;
  age?: string;
  appearance?: string;
  origin?: string;
  role?: string;
  personality?: string;
  visualTone?: string;
  source?: IdentitySource;
}

/**
 * Immutable portrait/persona identity; semantic interpretation belongs to
 * the text AI (local Grokbot or Workers AI), NOT a dictionary of magic words.
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
  readonly source: IdentitySource;

  private constructor(private readonly persona: PersonaRequest, resolved: ResolvedIdentity) {
    const v = persona.values;
    this.name = this.clean(v.name || resolved.name, 80);
    this.gender = resolved.gender;
    this.age = this.clean(v.age || resolved.age, 24);
    this.appearance = this.clean(v.appearance || resolved.appearance, 600);
    this.origin = this.clean(v.origin || resolved.origin, 160);
    this.role = this.clean([v.department, v.role].filter(Boolean).join(" — ") || resolved.role, 160);
    this.personality = this.clean(v.personality || resolved.personality || v.workStyle, 260);
    this.visualTone = this.clean(resolved.visualTone, 260) || "natural and authentic demeanor appropriate to the person's role and temperament";
    this.source = resolved.source ?? "ai";
  }

  /** Preview only; NO attempt to infer gender/age from natural-language brief. */
  static fromInput(persona: PersonaRequest): PersonaVisualIdentity {
    return new PersonaVisualIdentity(persona, {
      gender: this.explicitGender(persona.values.gender),
      source: "user",
    });
  }

  /** Validates an AI/local-agent character card and preserves explicit form facts. */
  static resolve(persona: PersonaRequest, card: unknown): PersonaVisualIdentity {
    if (!card || typeof card !== "object" || Array.isArray(card)) {
      throw new ValidationError("resolvedIdentity must be a structured object, generated from the completed persona");
    }
    const data = card as Record<string, unknown>;
    const valid: VisualGender[] = ["female", "male", "nonbinary", "unspecified"];
    if (typeof data.gender !== "string" || !valid.includes(data.gender as VisualGender)) {
      throw new ValidationError("resolvedIdentity.gender must be female, male, nonbinary or unspecified");
    }
    for (const key of ["name","age","appearance","origin","role","personality","visualTone"]) {
      if (data[key] !== undefined && (typeof data[key] !== "string" || (data[key] as string).length > 800)) {
        throw new ValidationError(`Invalid resolvedIdentity field: ${key}`);
      }
    }
    const explicit = this.explicitGender(persona.values.gender);
    if (explicit !== "unspecified" && data.gender !== explicit) {
      throw new ValidationError("resolvedIdentity.gender contradicts the explicitly selected character gender");
    }
    if (data.source !== undefined && !["ai", "user"].includes(String(data.source))) {
      throw new ValidationError("resolvedIdentity.source must be ai or user");
    }
    return new PersonaVisualIdentity(persona, {
      ...(data as unknown as ResolvedIdentity),
      gender: explicit !== "unspecified" ? explicit : data.gender as VisualGender,
    });
  }

  get value(): ResolvedIdentity {
    return {
      name: this.name || undefined, gender: this.gender,
      age: this.age || undefined, appearance: this.appearance || undefined,
      origin: this.origin || undefined, role: this.role || undefined,
      personality: this.personality || undefined,
      visualTone: this.visualTone, source: this.source,
    };
  }

  englishAnchor(): string {
    const subject = ({
      female: "Exactly ONE adult WOMAN. Never depict a man. No male subject.",
      male: "Exactly ONE adult MAN. Never depict a woman. No female subject.",
      nonbinary: "Exactly ONE nonbinary adult character. Follow the supplied presentation.",
      unspecified: "Exactly ONE adult person; no explicit gender was specified.",
    })[this.gender];
    return [
      "SINGLE CHARACTER IDENTITY — MUST MATCH THE GENERATED MARKDOWN:",
      subject,
      this.age ? `The single subject appears ${this.age} years old; age-appropriate face, not visibly decades older or younger.` : "",
      this.role ? `Professional context: ${this.role}. Clothing and demeanor should suit this role without changing identity details.` : "",
      `Facial expression and body language: ${this.visualTone}.`,
    ].filter(Boolean).join(" ");
  }

  englishDetails(): string {
    const visualPersona = {
      ...this.persona,
      values: { ...this.persona.values, origin: this.origin, appearance: this.appearance },
    };
    return [
      this.name ? `Character name (reference only, no text): ${this.name}.` : "",
      `Gender presentation: ${this.gender}.`,
      this.age ? `Apparent age: ${this.age}.` : "",
      this.appearance ? `Exact appearance and clothing: ${this.appearance}.` : "",
      this.personality ? `Character disposition: ${this.personality}.` : "",
      new AvatarRegionalContext().guidance(visualPersona).english,
    ].filter(Boolean).join(" ");
  }

  /** The initial prompt contains only form facts; the AI must fill missing traits. */
  textAnchor(locale: Locale): string {
    const header = ({
      en: "Canonical user-supplied identity facts (do not contradict):",
      "zh-hant": "【使用者明確指定的角色事實，生成時不得違反】",
      "zh-hans": "【用户明确指定的角色事实，生成时不得违反】",
    })[locale];
    const gender = ({female: "female / 女性",male:"male / 男性",nonbinary:"nonbinary / 非二元",unspecified:""})[this.gender];
    const lines = [
      header,
      gender ? `- Gender / 性別：${gender}` : "",
      this.age ? `- Age / 年齡：${this.age}` : "",
      this.name ? `- Name / 姓名：${this.name}` : "",
      this.appearance ? `- Appearance / 外貌：${this.appearance}` : "",
      this.role ? `- Role / 職務：${this.role}` : "",
      this.origin ? `- Origin / 地域：${this.origin}` : "",
      this.personality ? `- Personality / 人格：${this.personality}` : "",
      ({
        en: "Interpret the complete brief semantically. If a fictional character's gender or age is not supplied, you may invent them, but use ONE choice consistently in the Markdown and resolvedIdentity. Do not infer nationality from UI locale.",
        "zh-hant": "請以語意理解完整的一句話需求，不要靠固定關鍵字猜性別。虛構人物若未指定性別或年齡，可合理創作，但 Markdown 與 resolvedIdentity 必須是同一個選擇。不可依介面語言杜撰國籍。",
        "zh-hans": "请语义理解完整需求，不靠固定关键词猜性别。虚构人物未指定性别或年龄时可合理创作，但 Markdown 与 resolvedIdentity 须完全一致。不可凭界面语言捏造国籍。",
      })[locale],
    ];
    return lines.filter(Boolean).join("\n");
  }

  localizedImageAnchor(locale: Locale): string {
    const genders: Record<Locale, Record<VisualGender, string>> = {
      en: {female:"Exactly ONE adult woman, NOT a man.",male:"Exactly ONE adult man, NOT a woman.",nonbinary:"Exactly one nonbinary adult.",unspecified:"Exactly one adult person."},
      "zh-hant": {female:"畫面必須只有一位成年女性，不可畫成男性。",male:"畫面必須只有一位成年男性，不可畫成女性。",nonbinary:"畫面只有一位非二元成年人物。",unspecified:"畫面只有一位成年人物。"},
      "zh-hans": {female:"画面只能有一位成年女性，不得画成男性。",male:"画面只能有一位成年男性，不得画成女性。",nonbinary:"画面只有一位非二元成年人物。",unspecified:"画面只有一位成年人物。"},
    };
    const age = this.age ? ({
      en:`The subject must look approximately ${this.age} years old.`,
      "zh-hant":`外觀年齡約 ${this.age} 歲。`,
      "zh-hans":`外观年龄约 ${this.age} 岁。`,
    })[locale] : "";
    return [genders[locale][this.gender],age].filter(Boolean).join(" ");
  }

  private clean(value: string | undefined, max: number): string {
    return (value ?? "").replace(/\s+/g, " ").trim().slice(0,max);
  }

  private static explicitGender(value?: string): VisualGender {
    return ({
      "女性":"female","男性":"male","非二元":"nonbinary",
      "不限／不設定":"unspecified",
    } as Record<string, VisualGender>)[value ?? ""] ?? "unspecified";
  }
}
