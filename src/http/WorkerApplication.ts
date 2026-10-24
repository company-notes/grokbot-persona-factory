import { PresetCatalog } from "../catalog/PresetCatalog.js";
import { PersonaPackageFactory } from "../package/PersonaPackageFactory.js";
import { PersonaService } from "../persona/PersonaService.js";
import { PersonaValidator } from "../persona/PersonaValidator.js";
import { PromptComposer } from "../persona/PromptComposer.js";
import { QuotaService } from "../quota/QuotaService.js";
import { RequestAuthorizer } from "../security/RequestAuthorizer.js";
import type { Env, PackageRequest, PersonaRequest } from "../Types.js";
import { HTTPError } from "./HTTPError.js";
import { AIUnavailableError, ValidationError } from "../Errors.js";
import { Localization } from "../i18n/Localization.js";

export class WorkerApplication {
  private readonly service = new PersonaService(
    new PresetCatalog(),
    new PersonaValidator(),
    new PromptComposer(),
    new PersonaPackageFactory(),
  );
  private readonly authorizer = new RequestAuthorizer();
  private readonly i18n = new Localization();
  private readonly quota = new QuotaService();

  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (!path.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    try {
      return await this._api(request, env, path);
    } catch (error) {
      if (error instanceof HTTPError) {
        return this._json({ error: error.message, errorCode: error.errorCode }, error.status);
      }
      if (error instanceof ValidationError) {
        return this._json({ error: error.message, errorCode: "VALIDATION_ERROR" }, 400);
      }
      if (error instanceof AIUnavailableError) {
        console.warn("AI generation failed", error.cause ?? error);
        return this._json({ error: error.message, errorCode: "AI_UNAVAILABLE" }, 503);
      }
      console.error("Unhandled request error", error);
      return this._json({ error: "Internal server error", errorCode: "INTERNAL_ERROR" }, 500);
    }
  }

  private async _api(request: Request, env: Env, path: string): Promise<Response> {
    if (path === "/api/v1/presets" && request.method === "GET") {
      const locale = new URL(request.url).searchParams.get("locale") ?? undefined;
      return this._json({ presets: this.service.getPresets(locale) });
    }
    if (path.startsWith("/api/v1/locales/") && request.method === "GET") {
      const locale = this.i18n.normalize(path.substring("/api/v1/locales/".length));
      return this._json({ locale, messages: this.i18n.messages(locale) });
    }
    if (path === "/api/v1/quota" && request.method === "GET") {
      return this._json(await this.quota.status(env));
    }
    if (path === "/api/v1/prompts" && request.method === "POST") {
      const persona = await this._readJSON<PersonaRequest>(request, 40_000);
      return this._json(this.service.getPrompts(persona).prompts);
    }
    if (path === "/api/v1/drafts" && request.method === "POST") {
      await this.authorizer.authorize(request, env, path);
      const persona = await this._readJSON<PersonaRequest>(request, 70_000);
      await this._reserveForPersona(env, persona);
      const draft = await this.service.draft(persona, env);
      const avatarBase64 = draft.avatarBytes ? this._base64(draft.avatarBytes) : undefined;
      return this._json({ markdown: draft.markdown, avatarBase64, avatarMimeType: draft.avatarMimeType, avatarReviewStatus: draft.avatarReviewStatus });
    }
    if (path === "/api/v1/personas" && request.method === "POST") {
      await this.authorizer.authorize(request, env, path);
      const persona = await this._readJSON<PersonaRequest>(request, 40_000);
      await this._reserveForPersona(env, persona);
      const zip = await this.service.generate(persona, env);
      return this._zip(zip);
    }
    if (path === "/api/v1/packages" && request.method === "POST") {
      await this.authorizer.authorize(request, env, path);
      const input = await this._readJSON<PackageRequest>(request, 7_100_000);
      const zip = this.service.package(input);
      return this._zip(zip);
    }

    return this._json({ error: "Resource not found", errorCode: "NOT_FOUND" }, 404);
  }

  private async _reserveForPersona(env: Env, input: PersonaRequest): Promise<void> {
    // Validate before reserving. A failed AI call is still billed as an attempted request.
    const { persona } = this.service.getPrompts(input);
    if (env.ENABLE_PUBLIC_GENERATION !== "false") {
      await this.quota.reserve(env, this.quota.cost(persona));
    }
  }

  private async _readJSON<T>(request: Request, maxBytes: number): Promise<T> {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      throw new ValidationError("Content-Type must be application/json");
    }
    const reader = request.body?.getReader();
    if (!reader) {
      throw new ValidationError("Request body is required");
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new ValidationError("Request body is too large");
      }
      chunks.push(value);
    }

    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const body = new TextDecoder().decode(bytes);
    if (!body.trim()) {
      throw new ValidationError("Invalid or oversized request body");
    }
    try {
      return JSON.parse(body) as T;
    } catch {
      throw new ValidationError("Invalid JSON body");
    }
  }

  private _base64(bytes: Uint8Array): string {
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    }
    return btoa(binary);
  }

  private _json(body: unknown, status = 200): Response {
    return Response.json(body, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  }

  private _zip(data: Uint8Array): Response {
    return new Response(data as BodyInit, {
      headers: {
        "content-type": "application/zip",
        "content-disposition": 'attachment; filename="persona.zip"',
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  }
}
