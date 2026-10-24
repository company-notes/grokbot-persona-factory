export class HTTPClient {
  async request(path, body, binary = false) {
    const headers = { "content-type": "application/json" };

    const response = await fetch(path, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const result = await response.json();
      const error = new Error(result.error || `HTTP ${response.status}`);
      error.errorCode = result.errorCode;
      throw error;
    }

    return binary ? response.blob() : response.json();
  }

  getQuota() {
    return this._getJSON("/api/v1/quota");
  }

  async getLocale(locale) {
    return this._getJSON(`/api/v1/locales/${encodeURIComponent(locale)}`);
  }

  async listPresets(locale) {
    const result = await this._getJSON(`/api/v1/presets?locale=${encodeURIComponent(locale)}`);
    return result.presets;
  }

  async _getJSON(path) {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  }

  getPrompts(persona) {
    return this.request("/api/v1/prompts", persona);
  }

  draft(persona) {
    return this.request("/api/v1/drafts", persona);
  }

  generate(persona) {
    return this.request("/api/v1/personas", persona, true);
  }

  getAvatarPrompts(persona, markdown, resolvedIdentity) {
    return this.request("/api/v1/avatar-prompts", { persona, markdown, resolvedIdentity });
  }

  package(persona, markdown, avatarBase64, avatarMimeType, resolvedIdentity = null) {
    return this.request("/api/v1/packages", { persona, markdown, avatarBase64, avatarMimeType, ...(resolvedIdentity ? { resolvedIdentity } : {}) }, true);
  }
}
