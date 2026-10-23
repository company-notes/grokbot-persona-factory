export interface Env {
  AI: AiBinding;
  ASSETS: { fetch(request: Request): Promise<Response> };
  PERSONA_API_TOKEN?: string;
  ENABLE_PUBLIC_GENERATION?: string;
  PERSONA_RATE_LIMIT: { limit(input: { key: string }): Promise<{ success: boolean }> };
  PUBLIC_DAILY_CREDITS?: string;
  QUOTA_LEDGER: { getByName(name: string): { fetch(input: string | Request, init?: RequestInit): Promise<Response> } };
}

export interface AiBinding {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}

export interface FieldSpec {
  id: string;
  label: string;
  type: "text" | "textarea" | "select";
  required?: boolean;
  placeholder?: string;
  options?: string[];
  optionLabels?: Record<string, string>;
}

export interface PersonaPreset {
  id: string;
  label: string;
  description: string;
  guidance: string;
  fields: FieldSpec[];
}

export interface PersonaRequest {
  presetId: string;
  values: Record<string, string>;
  locale?: string;
  includeAvatar?: boolean;
  avatarStyle?: string;
  existingMarkdown?: string;
  revisionInstructions?: string;
}

export interface PromptBundle {
  presetId: string;
  presetLabel: string;
  displayName: string;
  systemPrompt: string;
  userPrompt: string;
  avatarPrompt: string;
  grokbotPrompt: string;
}

export interface PackageRequest {
  persona: PersonaRequest;
  markdown: string;
  avatarBase64?: string;
  avatarMimeType?: "image/jpeg" | "image/png" | "image/webp";
}
