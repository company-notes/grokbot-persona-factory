import type { Locale } from "../i18n/Localization.js";

/** Age-aware portrait art direction, separate from persona facts and model calls.
 * This does not estimate a real person's age from a photo.
 */
export class AvatarAgeGuidance {
  static adultAge(value: string): number | undefined {
    const digits = value.trim().match(/^(\d{1,3})(?:\s*(?:歲|岁|years?\s*old))?$/i);
    if (!digits) return undefined;
    const age = Number(digits[1]);
    return Number.isInteger(age) && age >= 18 && age <= 100 ? age : undefined;
  }

  static forImage(value: string): string {
    const age = this.adultAge(value);
    if (age === undefined || age >= 30) return "";
    return [
      `AGE CASTING PRIORITY: the subject is specifically ${age} years old, clearly a young adult in their twenties.`,
      "Give the face age-appropriate young-adult proportions and naturally youthful, realistic skin texture, without artificial smoothing or childlike features.",
      "Neat professional clothing and a confident attitude must not make the face appear like a substantially older senior executive.",
      "Use flattering soft, even photographic lighting rather than harsh shadows that add apparent years.",
    ].join(" ");
  }

  static forReview(value: string): string {
    const age = this.adultAge(value);
    if (age === undefined || age >= 30) return "";
    return [
      `AGE VISUAL CHECK: expected apparent age ${age}, a young adult in their twenties.`,
      "Do not mark PASS when the portrait CLEARLY depicts someone who looks substantially older, such as in their late thirties or forties.",
      "When visual age is borderline or uncertain, choose UNCERTAIN rather than claiming that the portrait definitely matches.",
      "Do not rely on clothing, job title, nationality or beauty standards to estimate age; consider visible facial age cues only.",
    ].join(" ");
  }

  static localized(value: string, locale: Locale): string {
    const age = this.adultAge(value);
    if (age === undefined || age >= 30) return "";
    return ({
      en: `Young adult around ${age}, clearly in their twenties; natural, age-appropriate face and realistic skin, professional clothing without an older-looking executive face.`,
      "zh-hant": `年齡視覺重點：${age} 歲、明顯是二十多歲的成年人物；自然且符合年紀的臉部輪廓與膚質，專業穿著不可讓臉看起來過於年長。`,
      "zh-hans": `年龄视觉重点：${age} 岁、明显是二十多岁的成年人物；自然且符合年龄的面部轮廓和肤质，专业着装不应让面容显得过于年长。`,
    })[locale];
  }
}
