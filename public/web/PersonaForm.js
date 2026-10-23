export class PersonaForm {
  constructor(presetContainer, briefContainer, fieldsContainer) {
    this.presetContainer = presetContainer;
    this.briefContainer = briefContainer;
    this.fieldsContainer = fieldsContainer;
    this.presets = [];
    this.selectedPreset = null;
    this.mode = "quick";
    this.valuesByPreset = new Map();
  }

  initialize(presets) {
    const selectedId = this.selectedPreset?.id ?? presets[0]?.id;
    if (this.selectedPreset) {
      this._saveCurrent();
    }
    this.presets = presets;
    this._renderPresets();
    this.selectPreset(selectedId);
  }

  selectPreset(id) {
    if (this.selectedPreset && this.selectedPreset.id !== id) {
      this._saveCurrent();
    }
    this.selectedPreset = this.presets.find((preset) => preset.id === id);
    if (!this.selectedPreset) {
      throw new Error(`Unknown preset ${id}`);
    }
    this.presetContainer.querySelectorAll(".presetCard").forEach((button) => {
      const selected = button.dataset.presetId === id;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    this.renderFields();
  }

  setMode(mode) {
    this.mode = mode;
    document.getElementById("advancedFields").classList.toggle("hidden", mode !== "advanced");
    for (const key of ["quick", "advanced"]) {
      const button = document.getElementById(`${key}Mode`);
      const active = mode === key;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    }
  }

  renderFields() {
    const saved = this.valuesByPreset.get(this.selectedPreset.id) ?? {};
    this.briefContainer.replaceChildren();
    this.fieldsContainer.replaceChildren();
    for (const field of this.selectedPreset.fields) {
      const outer = document.createElement("div");
      outer.className = `field${field.type === "textarea" ? " wide" : ""}`;
      const label = document.createElement("label");
      label.htmlFor = `field-${field.id}`;
      label.textContent = field.label;
      if (field.required) {
        const required = document.createElement("span");
        required.className = "required";
        required.textContent = "*";
        label.append(required);
      }

      let control;
      if (field.type === "textarea") {
        control = document.createElement("textarea");
        control.rows = field.id === "brief" ? 3 : 2;
      } else if (field.type === "select") {
        control = document.createElement("select");
        for (const optionValue of field.options ?? []) {
          const option = document.createElement("option");
          option.value = optionValue;
          option.textContent = field.optionLabels?.[optionValue] ?? optionValue;
          control.append(option);
        }
      } else {
        control = document.createElement("input");
        control.type = "text";
      }
      control.id = `field-${field.id}`;
      control.name = field.id;
      control.placeholder = field.placeholder ?? "";
      control.maxLength = 2000;
      control.value = saved[field.id] ?? "";
      outer.append(label, control);
      (field.id === "brief" ? this.briefContainer : this.fieldsContainer).append(outer);
    }
  }

  collect(includeAvatar, locale) {
    const values = this._readValues();
    if (this.mode === "quick" && !values.brief) {
      document.getElementById("field-brief").focus();
      return null;
    }
    if (!values.brief && this.selectedPreset.fields.some((field) => field.required && !values[field.id])) {
      return null;
    }
    this.valuesByPreset.set(this.selectedPreset.id, values);
    return { presetId: this.selectedPreset.id, values, locale, includeAvatar };
  }

  reset() {
    this.valuesByPreset.delete(this.selectedPreset.id);
    this.renderFields();
  }

  _saveCurrent() {
    this.valuesByPreset.set(this.selectedPreset.id, this._readValues());
  }

  _readValues() {
    const values = {};
    for (const control of [...this.briefContainer.querySelectorAll("[name]"), ...this.fieldsContainer.querySelectorAll("[name]")]) {
      if (control.value.trim()) {
        values[control.name] = control.value.trim();
      }
    }
    return values;
  }

  _renderPresets() {
    this.presetContainer.replaceChildren();
    for (const preset of this.presets) {
      const button = document.createElement("button");
      button.className = "presetCard";
      button.type = "button";
      button.innerHTML = '<div class="presetHeader"><span></span><i></i></div><p></p>';
      button.querySelector(".presetHeader span").textContent = preset.label;
      button.querySelector("p").textContent = preset.description;
      button.dataset.presetId = preset.id;
      button.addEventListener("click", () => this.selectPreset(preset.id));
      this.presetContainer.append(button);
    }
  }
}
