import type { Env, PackageRequest, PersonaRequest } from "../Types.js";
import { WorkerAIService, type GeneratedPersona } from "../ai/WorkerAIService.js";
import { AvatarPromptComposer } from "../avatar/AvatarPromptComposer.js";
import { Localization } from "../i18n/Localization.js";
import { PresetCatalog } from "../catalog/PresetCatalog.js";
import { ValidationError } from "../Errors.js";
import { PersonaPackageFactory } from "../package/PersonaPackageFactory.js";
import { PersonaValidator } from "./PersonaValidator.js";
import { PromptComposer } from "./PromptComposer.js";

export class PersonaService {
  constructor(
    private readonly catalog: PresetCatalog,
    private readonly validator: PersonaValidator,
    private readonly composer: PromptComposer,
    private readonly packages: PersonaPackageFactory,
  ) {}

  private readonly i18n = new Localization();
  private readonly avatarPrompts = new AvatarPromptComposer();

  getPresets(locale?: string) {
    return this.catalog.list(this.i18n.normalize(locale));
  }

  getPrompts(input: PersonaRequest) {
    if (!input || typeof input.presetId !== "string") {
      throw new ValidationError("presetId is required");
    }
    const preset = this.catalog.require(input.presetId, this.i18n.normalize(input.locale));
    const persona = this.validator.validate(input, preset);
    return { persona, prompts: this.composer.compose(persona, preset) };
  }

  async draft(input: PersonaRequest, env: Env): Promise<GeneratedPersona> {
    const { persona, prompts } = this.getPrompts(input);
    return new WorkerAIService(env.AI).generate(prompts, persona.includeAvatar === true, this.avatarPrompts.compose(persona), persona, env.AVATAR_VISUAL_REVIEW === "true");
  }

  async generate(input: PersonaRequest, env: Env): Promise<Uint8Array> {
    const { persona, prompts } = this.getPrompts(input);
    const generated = await new WorkerAIService(env.AI).generate(prompts, persona.includeAvatar === true, this.avatarPrompts.compose(persona), persona, env.AVATAR_VISUAL_REVIEW === "true");
    const avatar = generated.avatarBytes && generated.avatarMimeType
      ? { bytes: generated.avatarBytes, mimeType: generated.avatarMimeType }
      : undefined;

    return this.packages.create(persona, prompts, generated.markdown, avatar);
  }

  package(input: PackageRequest): Uint8Array {
    if (!input?.persona) {
      throw new ValidationError("persona is required");
    }
    const { persona, prompts } = this.getPrompts(input.persona);
    this.validator.validatePackage(input);
    const avatar = input.avatarBase64 && input.avatarMimeType
      ? this.packages.fromBase64(input.avatarBase64, input.avatarMimeType)
      : undefined;

    return this.packages.create(persona, prompts, input.markdown, avatar);
  }
}
