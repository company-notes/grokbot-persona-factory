export class LocalizationClient {
  constructor(http) {
    this.http = http;
    this.locale = "zh-hant";
    this.messages = {};
  }

  preferredLocale() {
    const stored = localStorage.getItem("personaForgeLocale");
    if (["en", "zh-hant", "zh-hans"].includes(stored)) {
      return stored;
    }
    const browserLanguage = navigator.language.toLowerCase();
    if (browserLanguage.startsWith("zh-cn") || browserLanguage.startsWith("zh-sg") || browserLanguage.startsWith("zh-hans")) {
      return "zh-hans";
    }
    if (browserLanguage.startsWith("en")) {
      return "en";
    }
    return "zh-hant";
  }

  async load(locale) {
    const result = await this.http.getLocale(locale);
    this.locale = result.locale;
    this.messages = result.messages;
    localStorage.setItem("personaForgeLocale", result.locale);
    document.documentElement.lang = { en: "en", "zh-hant": "zh-Hant", "zh-hans": "zh-Hans" }[this.locale];
    document.title = this.text("page.title");
    document.querySelector('meta[name="description"]').content = this.text("page.description");
    this.apply();
  }

  text(key) {
    return this.messages[key] ?? key;
  }

  apply() {
    document.querySelectorAll("[data-i18n]").forEach((node) => {
      node.textContent = this.text(node.dataset.i18n);
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
      node.placeholder = this.text(node.dataset.i18nPlaceholder);
    });
  }
}
