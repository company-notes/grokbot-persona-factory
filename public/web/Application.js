import { HTTPClient } from "./HTTPClient.js";
import { LocalizationClient } from "./LocalizationClient.js";
import { MarkdownPreview } from "./MarkdownPreview.js";
import { PersonaForm } from "./PersonaForm.js";

class PersonaApplication {
  constructor() {
    this.http = new HTTPClient();
    this.i18n = new LocalizationClient(this.http);
    this.preview = new MarkdownPreview(document.getElementById("draftPreview"));
    this.form = new PersonaForm(
      document.getElementById("presets"),
      document.getElementById("briefField"),
      document.getElementById("personaFields"),
    );
    this.method = "worker";
    this.draftPersona = null;
    this.draftAvatar = null;
    this.avatarReviewStatus = null;
    this.draftIdentity = null;
    this.draftMarkdownAtAvatar = null;
    this.promptPersona = null;
    this.quota = null;
  }

  async start() {
    this._bindEvents();
    try {
      await this._setLocale(this.i18n.preferredLocale());
      await this._refreshQuota();
    } catch (error) {
      this._statusError(error);
    }
  }

  _bindEvents() {
    for (const option of document.querySelectorAll(".methodOption")) {
      option.addEventListener("click", () => this._selectMethod(option.dataset.method));
    }

    document.getElementById("localeSelect").addEventListener("change", async (event) => {
      try {
        await this._setLocale(event.target.value);
      } catch (error) {
        this._statusError(error);
      }
    });
    document.getElementById("quickMode").addEventListener("click", () => this._setFormMode("quick"));
    document.getElementById("advancedMode").addEventListener("click", () => this._setFormMode("advanced"));
    document.getElementById("includeAvatar").addEventListener("change", () => this._refreshQuotaUI());
    document.getElementById("mainAction").addEventListener("click", () => this._perform());
    document.getElementById("copyPrompt").addEventListener("click", () => this._copyPrompt());
    document.getElementById("packageButton").addEventListener("click", () => this._packageExternal());
    document.getElementById("draftEditTab").addEventListener("click", () => this._showDraftView("edit"));
    document.getElementById("draftPreviewTab").addEventListener("click", () => this._showDraftView("preview"));
    document.getElementById("refineDraft").addEventListener("click", () => this._refine());
    document.getElementById("downloadDraft").addEventListener("click", () => this._downloadDraft());
    document.getElementById("personaForm").addEventListener("reset", (event) => {
      event.preventDefault();
      this.form.reset();
    });
  }

  async _setLocale(locale) {
    const wasInitialized = Boolean(this.form.selectedPreset);
    const previousLocale = this.i18n.locale;
    await this.i18n.load(locale);
    const presets = await this.http.listPresets(this.i18n.locale);
    this.form.initialize(presets);
    document.getElementById("localeSelect").value = this.i18n.locale;
    this._setFormMode(this.form.mode);
    this._selectMethod(this.method);
    this._refreshQuotaUI();
    if (wasInitialized && previousLocale !== this.i18n.locale && (this.draftPersona || this.promptPersona)) {
      this._status(this.i18n.text("status.languageHint"));
    }
  }

  _setFormMode(mode) {
    this.form.setMode(mode);
    const key = mode === "quick" ? "form.quickHint" : "form.advancedHint";
    document.getElementById("formModeHint").textContent = this.i18n.text(key);
    this._status("");
  }

  _selectMethod(method) {
    this.method = method;
    document.querySelectorAll(".methodOption").forEach((option) => {
      const selected = option.dataset.method === method;
      option.classList.toggle("active", selected);
      option.setAttribute("aria-pressed", String(selected));
    });
    document.getElementById("mainActionLabel").textContent = this.i18n.text(
      method === "worker" ? "action.draft" : "action.prompt",
    );
    document.getElementById("actionDescription").textContent = this.i18n.text(
      method === "worker" ? "action.draftHelp" : "action.promptHelp",
    );
    document.getElementById("promptResult").classList.toggle("hidden", method !== "prompt");
    document.getElementById("draftResult").classList.toggle("hidden", method !== "worker" || !this.draftPersona);
    this._refreshQuotaUI();
    this._status("");
  }

  async _refreshQuota() {
    try {
      this.quota = await this.http.getQuota();
      this._refreshQuotaUI();
    } catch (error) {
      // Quota visibility is informative; the server rejects requests if storage is unavailable.
      this.quota = null;
      document.getElementById("quotaText").textContent = this.i18n.text("quota.unavailable");
    }
  }

  _refreshQuotaUI() {
    const includeAvatar = document.getElementById("includeAvatar").checked;
    document.getElementById("avatarStylePanel").classList.toggle("hidden", !includeAvatar);
    const text = document.getElementById("quotaText");
    const hint = document.getElementById("quotaHint");
    const fill = document.getElementById("quotaFill");
    if (!this.quota) {
      return;
    }
    const { remaining, limit, enabled } = this.quota;
    const cost = (this.quota?.creditsPerText ?? 1) + (includeAvatar ? (this.quota?.creditsPerAvatar ?? 2) : 0);
    const exhausted = remaining < 1 || !enabled;
    const avatarInsufficient = !exhausted && remaining < cost;
    text.textContent = exhausted
      ? this.i18n.text("quota.exhausted")
      : avatarInsufficient
        ? this.i18n.text("quota.avatarTooExpensive")
        : this.i18n.text("quota.available").replace("{remaining}", remaining).replace("{limit}", limit);
    hint.textContent = this.i18n.text("quota.cost");
    fill.style.width = `${limit ? Math.min(100, (remaining / limit) * 100) : 0}%`;
    document.getElementById("quotaBanner").classList.toggle("exhausted", exhausted || avatarInsufficient);
    // In the prompt workflow no AI quota is needed.
    document.getElementById("mainAction").disabled = (exhausted || avatarInsufficient) && this.method === "worker";
    const refine = document.getElementById("refineDraft");
    if (refine) {
      refine.disabled = exhausted;
    }
  }

  _collect() {
    const persona = this.form.collect(
      document.getElementById("includeAvatar").checked,
      this.i18n.locale,
    );
    if (persona) {
      persona.avatarStyle = document.getElementById("avatarStyle").value;
      persona.detailLevel = document.getElementById("detailLevel").value;

    }
    if (!persona) {
      this._status(this.i18n.text("status.required"), true);
    }
    return persona;
  }

  async _perform() {
    const persona = this._collect();
    if (!persona) {
      return;
    }

    const button = document.getElementById("mainAction");
    button.disabled = true;
    this._status(this.i18n.text(this.method === "worker" ? "status.loadingDraft" : "status.loadingPrompt"));
    try {
      if (this.method === "worker") {
        const draft = await this.http.draft(persona);
        this.draftPersona = persona;
        this.avatarReviewStatus = draft.avatarReviewStatus || null;
        this.draftIdentity = draft.resolvedIdentity || null;
        this.draftMarkdownAtAvatar = draft.avatarBase64 ? draft.markdown : null;
        this.draftAvatar = draft.avatarBase64 && draft.avatarMimeType
          ? { base64: draft.avatarBase64, mimeType: draft.avatarMimeType }
          : null;
        document.getElementById("draftMarkdown").value = draft.markdown;
        document.getElementById("refineInstructions").value = "";
        document.getElementById("draftAvatarUpload").value = "";
        document.getElementById("draftResult").classList.remove("hidden");
        this._showDraftView("preview");
        this._updateAvatarStatus();
        await this._refreshQuota();
        this._status(this.i18n.text("status.draftReady"));
      } else {
        const prompts = await this.http.getPrompts(persona);
        this.promptPersona = persona;
        document.getElementById("promptOutput").value = prompts.grokbotPrompt;
        this._status(this.i18n.text("status.promptReady"));
      }
    } catch (error) {
      if (error.errorCode === "QUOTA_EXHAUSTED") {
        await this._refreshQuota();
        this._selectMethod("prompt");
        const prompts = await this.http.getPrompts(persona);
        this.promptPersona = persona;
        document.getElementById("promptOutput").value = prompts.grokbotPrompt;
        this._status(this.i18n.text("quota.exhausted"), true);
      } else {
        this._statusError(error);
      }
    } finally {
      button.disabled = false;
      this._refreshQuotaUI();
    }
  }

  async _refine() {
    const markdown = document.getElementById("draftMarkdown").value;
    const instructions = document.getElementById("refineInstructions").value.trim();
    if (!this.draftPersona || !markdown.trim()) {
      this._status(this.i18n.text("status.draftRequired"), true);
      return;
    }
    if (!instructions) {
      document.getElementById("refineInstructions").focus();
      return;
    }

    const button = document.getElementById("refineDraft");
    button.disabled = true;
    this._status(this.i18n.text("status.loadingRefine"));
    try {
      const persona = {
        ...this.draftPersona,
        locale: this.i18n.locale,
        includeAvatar: false,
        existingMarkdown: markdown,
        revisionInstructions: instructions,
      };
      const revised = await this.http.draft(persona);
      document.getElementById("draftMarkdown").value = revised.markdown;
      this._showDraftView("preview");
      document.getElementById("refineInstructions").value = "";
      this.draftPersona = { ...this.draftPersona, locale: this.i18n.locale };
      await this._refreshQuota();
      this._status(this.i18n.text("status.draftReady"));
    } catch (error) {
      await this._refreshQuota();
      this._statusError(error);
    } finally {
      button.disabled = false;
    }
  }

  async _downloadDraft() {
    const markdown = document.getElementById("draftMarkdown").value;
    if (!this.draftPersona || !markdown.trim()) {
      this._status(this.i18n.text("status.markdownRequired"), true);
      return;
    }
    const uploadedAvatar = document.getElementById("draftAvatarUpload").files[0];
    const isStale = !uploadedAvatar && this.draftAvatar && this.draftMarkdownAtAvatar !== markdown;
    const avatar = uploadedAvatar ? await this._readAvatar(uploadedAvatar) : isStale ? null : this.draftAvatar;
    if (isStale) this._status(this.i18n.text("result.avatarStale"), true);
    await this._downloadPackage(this.draftPersona, markdown, avatar, "downloadDraft", isStale ? null : this.draftIdentity);
  }

  async _packageExternal() {
    const markdown = document.getElementById("generatedMarkdown").value;
    const persona = this.promptPersona ?? this._collect();
    if (!persona) {
      return;
    }
    if (!markdown.trim()) {
      this._status(this.i18n.text("status.markdownRequired"), true);
      return;
    }

    const button = document.getElementById("packageButton");
    button.disabled = true;
    try {
      const file = document.getElementById("avatarUpload").files[0];
      const avatar = file ? await this._readAvatar(file) : null;
      await this._downloadPackage(persona, markdown, avatar, null);
    } catch (error) {
      this._statusError(error);
    } finally {
      button.disabled = false;
    }
  }

  async _downloadPackage(persona, markdown, avatar, buttonId, resolvedIdentity = null) {
    const button = buttonId ? document.getElementById(buttonId) : null;
    if (button) {
      button.disabled = true;
    }
    this._status(this.i18n.text("status.packaging"));
    try {
      const zip = await this.http.package(persona, markdown, avatar?.base64, avatar?.mimeType, resolvedIdentity);
      this._download(zip);
      this._status(this.i18n.text("status.packageReady"));
    } catch (error) {
      this._statusError(error);
    } finally {
      if (button) {
        button.disabled = false;
      }
    }
  }

  async _readAvatar(file) {
    if (file.size > 5_000_000 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      throw new Error(this.i18n.text("status.avatarInvalid"));
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    }
    return { base64: btoa(binary), mimeType: file.type };
  }

  _showDraftView(mode) {
    const previewMode = mode === "preview";
    document.getElementById("draftMarkdown").classList.toggle("hidden", previewMode);
    document.getElementById("draftPreview").classList.toggle("hidden", !previewMode);
    if (previewMode) {
      this.preview.render(document.getElementById("draftMarkdown").value);
    }
    for (const item of ["edit", "preview"]) {
      const button = document.getElementById(item === "edit" ? "draftEditTab" : "draftPreviewTab");
      const selected = item === mode;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-selected", String(selected));
    }
  }

  _updateAvatarStatus() {
    const image = document.getElementById("draftAvatarPreview");
    if (this.draftAvatar) {
      image.src = `data:${this.draftAvatar.mimeType};base64,${this.draftAvatar.base64}`;
      image.classList.remove("hidden");
    } else {
      image.removeAttribute("src");
      image.classList.add("hidden");
    }
    const detailKeys = { checked: "result.avatarChecked", revised: "result.avatarRevised", unverified: "result.avatarUnverified", rejected: "result.avatarRejected" };
    const key = detailKeys[this.avatarReviewStatus] || (this.draftAvatar ? "result.avatarReady" : "result.noAvatar");
    document.getElementById("draftAvatarStatus").textContent = this.i18n.text(key);
  }

  async _copyPrompt() {
    const prompt = document.getElementById("promptOutput").value;
    if (!prompt) {
      this._status(this.i18n.text("status.copyRequired"), true);
      return;
    }
    try {
      await navigator.clipboard.writeText(prompt);
      this._status(this.i18n.text("status.copied"));
    } catch {
      this._status(this.i18n.text("status.copyFailed"), true);
    }
  }

  _download(blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "persona.zip";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  _statusError(error) {
    const key = `error.${error.errorCode}`;
    const localized = this.i18n.messages[key];
    this._status(localized || error.message || this.i18n.text("status.networkError"), true);
  }

  _status(message, isError = false) {
    const node = document.getElementById("status");
    node.textContent = message;
    node.classList.toggle("error", isError);
  }
}

new PersonaApplication().start();
