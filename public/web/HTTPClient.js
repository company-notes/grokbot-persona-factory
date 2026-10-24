export class HTTPClient {
  async request(path, body, binary = false, options = {}) {
    const headers = { "content-type": "application/json" };
    const timeoutMs = options.timeoutMs ?? 0;
    const controller = new AbortController();
    let timedOut = false;
    const abortRequest = () => controller.abort();
    options.signal?.addEventListener("abort", abortRequest, { once: true });
    if (options.signal?.aborted) controller.abort();
    const timer = timeoutMs > 0 ? setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs) : null;
    try {
      const response = await fetch(path, {
        method: "POST", headers, body: JSON.stringify(body), signal: controller.signal,
      });
      if (!response.ok) {
        const result = await response.json();
        const error = new Error(result.error || `HTTP ${response.status}`);
        error.errorCode = result.errorCode;
        throw error;
      }
      return binary ? response.blob() : response.json();
    } catch (error) {
      if (timedOut) {
        const failure = new Error("The AI request exceeded the waiting limit.");
        failure.errorCode = "GENERATION_TIMEOUT";
        throw failure;
      }
      throw error;
    } finally {
      if (timer !== null) clearTimeout(timer);
      options.signal?.removeEventListener("abort", abortRequest);
    }
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

  draft(persona, signal) {
    return this.request("/api/v1/drafts", persona, false, { timeoutMs: 155000, signal });
  }

  generate(persona, signal) {
    return this.request("/api/v1/personas", persona, true, { timeoutMs: 155000, signal });
  }

  getAvatarPrompts(persona, markdown, resolvedIdentity) {
    return this.request("/api/v1/avatar-prompts", { persona, markdown, resolvedIdentity });
  }

  package(persona, markdown, avatarBase64, avatarMimeType, resolvedIdentity = null) {
    return this.request("/api/v1/packages", { persona, markdown, avatarBase64, avatarMimeType, ...(resolvedIdentity ? { resolvedIdentity } : {}) }, true);
  }
}
