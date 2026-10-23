import type { Locale } from "../i18n/Localization.js";
import { ValidationError } from "../Errors.js";

export type AvatarStyle = "cartoon" | "realistic" | "pencil" | "anime" | "watercolor" | "threeD" | "pixel";

const styles: Record<AvatarStyle, Record<Locale, string>> = {
  cartoon: {
    en: "Original friendly cartoon portrait for an AI teammate: polished 2D vector illustration, rounded shapes, clean bold contours, simple geometric shading, expressive eyes and charming approachable personality; a unified professional avatar aesthetic. Do not copy existing platform icons or mascots.",
    "zh-hant": "原創、親切的 AI 夥伴卡通肖像：精緻 2D 向量插畫、圓潤輪廓、乾淨粗線條、簡潔幾何陰影、有神且自然的表情，適合團隊成員頭像。不要模仿任何平台圖示或吉祥物。",
    "zh-hans": "原创、亲切的 AI 伙伴卡通肖像：精致 2D 矢量插画、圆润轮廓、干净粗线条、简洁几何阴影、自然生动的表情，适合团队成员头像。不要模仿任何平台图标或吉祥物。",
  },
  realistic: { en: "Photorealistic professional portrait photography with authentic skin texture, natural expression and studio lighting.", "zh-hant": "寫實專業人像攝影，自然皮膚紋理、真實表情、棚拍光線。", "zh-hans": "写实专业人像摄影，自然皮肤纹理、真实表情、影棚光线。" },
  pencil: { en: "Expressive graphite pencil portrait sketch, subtle crosshatching, off-white paper and careful tonal shading.", "zh-hant": "細膩鉛筆素描人像，石墨筆觸、交叉排線、淡色素描紙及層次明暗。", "zh-hans": "细腻铅笔素描人像，石墨笔触、交叉排线、淡色素描纸和层次明暗。" },
  anime: { en: "Original contemporary anime portrait, clean cel shading, refined line art and expressive eyes, not based on any existing franchise.", "zh-hant": "原創現代動畫風角色肖像，乾淨賽璐璐上色、細緻線條與生動眼神，不參考既有動畫 IP。", "zh-hans": "原创现代动画风人物肖像，干净赛璐璐上色、细致线条和生动眼神，不参考现有动漫 IP。" },
  watercolor: { en: "Soft watercolor painted character portrait, pigment blooms, textured cotton paper, gentle airy color transitions.", "zh-hant": "柔和水彩畫人物肖像，顏料自然暈染、棉紙肌理、輕盈色彩層次。", "zh-hans": "柔和水彩画人物肖像，颜料自然晕染、棉纸纹理、轻盈色彩层次。" },
  threeD: { en: "Original stylized 3D character bust, high-quality soft materials, rounded proportions and warm studio rendering.", "zh-hant": "原創精緻 3D 卡通角色半身像，柔和材質、圓潤比例、溫暖棚拍渲染。", "zh-hans": "原创精致 3D 卡通角色半身像，柔和材质、圆润比例、温暖影棚渲染。" },
  pixel: { en: "Crisp high-quality pixel art character avatar, intentional 16-bit game style, controlled pixel edges and limited palette.", "zh-hant": "精緻像素風角色頭像，16-bit 遊戲美術感、俐落像素邊緣、克制配色。", "zh-hans": "精致像素风角色头像，16-bit 游戏美术感、利落像素边缘、克制配色。" },
};

export class AvatarStyles {
  readonly defaultStyle: AvatarStyle = "cartoon";

  require(style?: string): AvatarStyle {
    const value = style ?? this.defaultStyle;
    if (!(value in styles)) {
      throw new ValidationError(`Unknown avatarStyle: ${value}`);
    }
    return value as AvatarStyle;
  }

  describe(style: AvatarStyle, locale: Locale): string {
    return styles[style][locale];
  }
}
