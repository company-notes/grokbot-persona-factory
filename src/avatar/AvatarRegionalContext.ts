import type { PersonaRequest } from "../Types.js";
import type { Locale } from "../i18n/Localization.js";

/**
 * Nationality is a fact only when supplied by the user.
 * Locale is merely a reversible visual casting default for portraits.
 */
export class AvatarRegionalContext {
  guidance(persona: PersonaRequest): { english: string; localized: string } {
    const locale = (persona.locale ?? "en") as Locale;
    const origin = (persona.values.origin ?? "").trim().slice(0, 160);
    const appearance = persona.values.appearance ?? "";
    const explicitAppearance = /台灣|臺灣|中國|大陆|大陸|香港|澳門|澳门|日本|韓國|韩国|美國|美国|歐洲|欧洲|非洲|印度|泰國|越南|菲律賓|東南亞|东南亚|白人|黑人|華裔|华裔|混血|原住民|族裔|血統|Taiwan|China|Chinese|Japan|Korea|Europe|African|Indian|Asian|Latina|Latino|Caucasian|White|Black|ethnic|ancestry|heritage/i.test(appearance);
    if (origin) {
      return {
        english: `User-specified nationality or cultural background: ${origin}. Respect this context AND any explicit appearance details. Nationality does not guarantee ethnicity or facial features; do not stereotype or change the user's requested appearance.`,
        localized: ({
          en: `Character nationality / regional or cultural background (user-specified): ${origin}. Follow explicit appearance details; nationality alone does not determine facial features.`,
          "zh-hant": `人物國籍／地域文化背景（使用者明確指定）：${origin}。以具體外貌描述優先；國籍不等於固定族裔或臉型。`,
          "zh-hans": `人物国籍／地域文化背景（用户明确指定）：${origin}。优先遵循具体外貌描述；国籍不等于固定族裔或脸型。`,
        })[locale],
      };
    }
    if (explicitAppearance) {
      return {
        english: "The appearance text specifies cultural, geographic or ethnic identity cues. Follow those explicit details; do not impose the interface language as nationality or ethnicity.",
        localized: ({
          en: "Use the geographic or ethnic appearance explicitly described by the user; do not infer nationality from interface language.",
          "zh-hant": "外貌已有明確地域或族裔線索，請優先遵從；不要從介面語言推定國籍。",
          "zh-hans": "外貌已有明确地域或族裔线索，请优先遵从；不要从界面语言推断国籍。",
        })[locale],
      };
    }
    if (locale === "zh-hant") {
      return {
        english: "SOFT VISUAL DEFAULT ONLY (not a verified fact): when no background is given, portray a believable contemporary Taiwanese professional, with natural East Asian facial features often seen in Taiwan and realistic local workplace styling. Taiwanese people are diverse; avoid caricature. Any explicit user description overrides this.",
        localized: "未指定人物國籍／外貌地域背景時，頭像可暫以當代臺灣職場人物、自然東亞面貌作為柔性視覺預設。臺灣人口外貌多元，此設定不表示人物已確認具有臺灣國籍；使用者描述優先。",
      };
    }
    if (locale === "zh-hans") {
      return {
        english: "SOFT VISUAL DEFAULT ONLY (not a verified fact): when no background is given, portray a believable contemporary mainland Chinese professional, with natural East Asian facial features common in mainland China and realistic local workplace styling. Mainland China is diverse; avoid caricature. Any explicit user description overrides this.",
        localized: "未指定人物国籍／外貌地域背景时，头像可暂以当代中国大陆职场人物、自然东亚面貌作柔性视觉预设。大陆人群外貌多样，该预设不代表已确认的国籍；用户描述优先。",
      };
    }
    return {
      english: "No nationality, ethnicity, or specific country should be inferred from English interface language. Follow only the character's explicit background and appearance.",
      localized: "English interface language alone does not specify nationality or ethnicity. Follow the user's explicit appearance instead.",
    };
  }
}
