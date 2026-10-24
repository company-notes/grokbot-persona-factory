import assert from "node:assert/strict";
import { test } from "node:test";
import { WorkerApplication } from "../build/http/WorkerApplication.js";
import { PersonaPackageFactory } from "../build/package/PersonaPackageFactory.js";
import { ZipArchive } from "../build/package/ZipArchive.js";
import { QuotaLedger } from "../build/quota/QuotaLedger.js";
import { DatabaseSync } from "node:sqlite";

const token = "long-test-token-0123456789-abcdef";
const samplePersona = {
  presetId: "workplace",
  values: {
    name: "小晴",
    department: "總經理室",
    role: "總經理特助",
    personality: "ISTJ",
    workStyle: "細心、會找真正的職務負責人",
  },
  locale: "zh-TW",
  includeAvatar: false,
};

class FakeAI {
  calls = [];

  async run(model, input) {
    this.calls.push({ model, input });
    if (model.includes("flux")) {
      // A tiny JPEG signature is sufficient for ZIP-format tests.
      return { image: btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xd9)) };
    }

    const markdown = "# 小晴\\n\\n## 核心定位\\n總經理特助，重視職責和溝通。";
    if (input?.messages?.[0]?.content?.includes("MANDATORY API TRANSPORT FORMAT OVERRIDE")) {
      const user = input.messages[1].content;
      const gender = user.includes("Gender / 性別：male") ? "male" :
        user.includes("Gender / 性別：nonbinary") ? "nonbinary" : "female";
      const age = user.split("Age / 年齡：")[1]?.split(String.fromCharCode(10))[0] || "33";
      return { response: JSON.stringify({
        markdown,
        resolvedIdentity: {
          name:"小晴",gender,age,role:"總經理特助",
          appearance:"短髮，深藍色西裝外套",
          personality:"細心、沉穩，專業",
          visualTone:"calm and confident, approachable",
        },
      }) };
    }
    return { response: markdown };
  }
}

async function avatarPromptFromCall(call) {
  if (typeof call.input.prompt === "string") return call.input.prompt;
  // FLUX.2 Klein receives multipart, not the legacy JSON prompt field.
  const multipart = call.input.multipart;
  assert.ok(multipart?.body);
  const response = new Response(multipart.body, {
    headers: { "Content-Type": multipart.contentType },
  });
  const form = await response.formData();
  return String(form.get("prompt") ?? "");
}

function request(path, body, authorized = false) {
  const headers = { "content-type": "application/json" };
  if (authorized) {
    headers.Authorization = `Bearer ${token}`;
  }

  return new Request(`https://example.test${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function createLedger() {
  const db = new DatabaseSync(":memory:");
  const ledger = new QuotaLedger({ storage: { sql: {
    exec(query, ...params) {
      const statement = db.prepare(query);
      if (query.startsWith("CREATE")) {
        statement.run();
        return { toArray: () => [] };
      }
      return { toArray: () => statement.all(...params) };
    },
  } } });
  return { getByName: () => ({ fetch: (input, init) => ledger.fetch(input instanceof Request ? input : new Request(input, init)) }) };
}

function env(ai) {
  return {
    AI: ai,
    ASSETS: { fetch: async () => new Response("static") },
    PERSONA_API_TOKEN: token,
    ENABLE_PUBLIC_GENERATION: "false",
    PERSONA_RATE_LIMIT: { limit: async () => ({ success: true }) },
    QUOTA_LEDGER: createLedger(),
    PUBLIC_DAILY_CREDITS: "10",
  };
}

function inspectZip(data) {
  const names = [];
  const bytes = new Uint8Array(data);
  const view = new DataView(bytes.buffer);
  let offset = 0;
  while (offset < bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(offset + 30, offset + 30 + nameLength));
    names.push(name);
    offset += 30 + nameLength + extraLength + size;
  }
  return names;
}

test("presets are public and have different required fields", async () => {
  const app = new WorkerApplication();
  const ai = new FakeAI();
  const response = await app.fetch(new Request("https://example.test/api/v1/presets"), env(ai));
  assert.equal(response.status, 200);
  const presets = (await response.json()).presets;
  assert.equal(presets.length, 4);
  assert.notDeepEqual(presets[0].fields.map((f) => f.id), presets[3].fields.map((f) => f.id));
  assert.equal(ai.calls.length, 0);
});

test("prompt-only flow never uses Workers AI", async () => {
  const app = new WorkerApplication();
  const ai = new FakeAI();
  const response = await app.fetch(request("/api/v1/prompts", samplePersona), env(ai));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.match(data.userPrompt, /總經理特助/);
  assert.match(data.systemPrompt, /Markdown/);
  assert.match(data.avatarPrompt, /肖像/);
  assert.equal(ai.calls.length, 0);
});

test("private generation requires token, no surprise paid requests", async () => {
  const app = new WorkerApplication();
  const ai = new FakeAI();
  const response = await app.fetch(request("/api/v1/personas", samplePersona), env(ai));
  assert.equal(response.status, 401);
  assert.equal(ai.calls.length, 0);
});

test("workers AI generation produces persona ZIP", async () => {
  const app = new WorkerApplication();
  const ai = new FakeAI();
  const response = await app.fetch(request("/api/v1/personas", samplePersona, true), env(ai));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/zip");
  assert.deepEqual(inspectZip(await response.arrayBuffer()), ["persona.md", "manifest.json"]);
  assert.equal(ai.calls.length, 1);
});

test("avatar generation creates JPEG entry using image model", async () => {
  const app = new WorkerApplication();
  const ai = new FakeAI();
  const response = await app.fetch(request("/api/v1/personas", { ...samplePersona, includeAvatar: true }, true), env(ai));
  assert.equal(response.status, 200);
  assert.deepEqual(inspectZip(await response.arrayBuffer()), ["persona.md", "manifest.json", "avatar.jpg"]);
  assert.equal(ai.calls.length, 2);
});

test("external-bot package flow does not use AI", async () => {
  const app = new WorkerApplication();
  const ai = new FakeAI();
  const response = await app.fetch(request("/api/v1/packages", {
    persona: samplePersona,
    markdown: "# 自己生成的人設\n有自己的工作方法",
  }, true), env(ai));
  assert.equal(response.status, 200);
  assert.deepEqual(inspectZip(await response.arrayBuffer()), ["persona.md", "manifest.json"]);
  assert.equal(ai.calls.length, 0);
});

test("external package validates avatar magic bytes", async () => {
  const app = new WorkerApplication();
  const response = await app.fetch(request("/api/v1/packages", {
    persona: samplePersona,
    markdown: "# Profile",
    avatarBase64: btoa("hello"),
    avatarMimeType: "image/jpeg",
  }, true), env(new FakeAI()));
  assert.equal(response.status, 400);
});

test("invalid preset and missing required value produce 400", async () => {
  const app = new WorkerApplication();
  const fakeEnv = env(new FakeAI());
  const badPreset = await app.fetch(request("/api/v1/prompts", { presetId: "invalid", values: {} }), fakeEnv);
  const missingName = await app.fetch(request("/api/v1/prompts", { ...samplePersona, values: { role: "研發主管" } }), fakeEnv);
  assert.equal(badPreset.status, 400);
  assert.equal(missingName.status, 400);
});

test("ZIP archive has correct local signatures and central directory", () => {
  const bytes = new ZipArchive().create([{ name: "角色.md", data: new TextEncoder().encode("你好") }]);
  const view = new DataView(bytes.buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint32(bytes.length - 22, true), 0x06054b50);
});

test("public mode is rate-limited before AI inference", async () => {
  const app = new WorkerApplication();
  const ai = new FakeAI();
  const publicEnv = env(ai);
  publicEnv.ENABLE_PUBLIC_GENERATION = "true";
  publicEnv.PERSONA_RATE_LIMIT = { limit: async () => ({ success: false }) };
  const response = await app.fetch(request("/api/v1/personas", samplePersona), publicEnv);
  assert.equal(response.status, 429);
  assert.equal(ai.calls.length, 0);
});

test("missing server secret fails closed", async () => {
  const app = new WorkerApplication();
  const ai = new FakeAI();
  const privateEnv = env(ai);
  delete privateEnv.PERSONA_API_TOKEN;
  const response = await app.fetch(request("/api/v1/personas", samplePersona), privateEnv);
  assert.equal(response.status, 503);
  assert.equal(ai.calls.length, 0);
});


test("all locale catalogs are translated and keep stable field identifiers", async () => {
  const app = new WorkerApplication();
  const fakeEnv = env(new FakeAI());
  const catalogs = [];
  for (const locale of ["en", "zh-hant", "zh-hans"]) {
    const response = await app.fetch(new Request(`https://example.test/api/v1/presets?locale=${locale}`), fakeEnv);
    assert.equal(response.status, 200);
    const presets = (await response.json()).presets;
    assert.equal(presets.length, 4);
    catalogs.push(presets);

    const localeResponse = await app.fetch(new Request(`https://example.test/api/v1/locales/${locale}`), fakeEnv);
    assert.equal(localeResponse.status, 200);
    const dictionary = await localeResponse.json();
    assert.ok(dictionary.messages["hero.title"]);
    assert.ok(dictionary.messages["field.brief.label"]);
  }
  assert.notEqual(catalogs[0][0].label, catalogs[1][0].label);
  assert.notEqual(catalogs[1][0].label, catalogs[2][0].label);
  assert.deepEqual(catalogs[0][0].fields.map((f) => f.id), catalogs[2][0].fields.map((f) => f.id));
  assert.equal(catalogs[0][0].fields.find((f) => f.id === "gender").optionLabels["女性"], "Female");
});

test("prompts and portrait descriptions follow all three requested languages", async () => {
  const app = new WorkerApplication();
  const fakeEnv = env(new FakeAI());
  const expected = [
    ["en", /Write the entire result in English/, /Selected persona set/, /portrait/],
    ["zh-hant", /使用繁體中文/, /選用的人設範本/, /肖像/],
    ["zh-hans", /使用简体中文/, /选用的人设模板/, /肖像/],
  ];
  for (const [locale, system, user, avatar] of expected) {
    const response = await app.fetch(request("/api/v1/prompts", { ...samplePersona, locale }), fakeEnv);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.match(data.systemPrompt, system);
    assert.match(data.userPrompt, user);
    assert.match(data.avatarPrompt, avatar);
  }
  assert.equal(fakeEnv.AI.calls.length, 0);
});

test("brief-only quick creation does not require advanced workplace fields", async () => {
  const app = new WorkerApplication();
  const fakeEnv = env(new FakeAI());
  const response = await app.fetch(request("/api/v1/prompts", {
    presetId: "workplace", locale: "en", includeAvatar: false,
    values: { brief: "Independent HR lead who reports concise risks and recommendations" },
  }), fakeEnv);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.match(data.userPrompt, /Independent HR lead/);
  assert.equal(data.displayName, "Unnamed AI teammate");
  assert.equal(fakeEnv.AI.calls.length, 0);
});

test("draft endpoint returns editable JSON instead of forcing ZIP export", async () => {
  const app = new WorkerApplication();
  const fakeEnv = env(new FakeAI());
  const denied = await app.fetch(request("/api/v1/drafts", samplePersona), fakeEnv);
  assert.equal(denied.status, 401);
  const response = await app.fetch(request("/api/v1/drafts", { ...samplePersona, includeAvatar: true }, true), fakeEnv);
  assert.equal(response.status, 200);
  const draft = await response.json();
  assert.match(draft.markdown, /核心定位/);
  assert.equal(draft.avatarMimeType, "image/jpeg");
  assert.ok(draft.avatarBase64);
  assert.equal(fakeEnv.AI.calls.length, 2);
});

test("refining a draft preserves given facts and does not regenerate avatar", async () => {
  const app = new WorkerApplication();
  const fakeEnv = env(new FakeAI());
  const response = await app.fetch(request("/api/v1/drafts", {
    ...samplePersona,
    includeAvatar: false,
    existingMarkdown: "# 小晴\n原本內容",
    revisionInstructions: "只改寫回報方式，保留年紀與姓名",
  }, true), fakeEnv);
  assert.equal(response.status, 200);
  assert.equal(fakeEnv.AI.calls.length, 1);
  const inputPrompt = fakeEnv.AI.calls[0].input.messages[1].content;
  assert.match(inputPrompt, /原本內容/);
  assert.match(inputPrompt, /只改寫回報方式/);
  assert.match(inputPrompt, /使用者指定資料/);
});

test("unsupported locale and malformed revision requests are rejected", async () => {
  const app = new WorkerApplication();
  const fakeEnv = env(new FakeAI());
  const badLocale = await app.fetch(request("/api/v1/prompts", { ...samplePersona, locale: "de" }), fakeEnv);
  const badRefine = await app.fetch(request("/api/v1/drafts", {
    ...samplePersona, revisionInstructions: "改短一點",
  }, true), fakeEnv);
  assert.equal(badLocale.status, 400);
  assert.equal(badRefine.status, 400);
  assert.equal(fakeEnv.AI.calls.length, 0);
});

test("old zh-TW API callers remain compatible and normalize manifest locale", async () => {
  const app = new WorkerApplication();
  const response = await app.fetch(request("/api/v1/prompts", samplePersona), env(new FakeAI()));
  assert.equal(response.status, 200);
  assert.match((await response.json()).systemPrompt, /繁體中文/);
});


test("public visitor can generate a draft and avatar with no token", async () => {
  const app = new WorkerApplication();
  const fakeEnv = env(new FakeAI());
  fakeEnv.ENABLE_PUBLIC_GENERATION = "true";
  fakeEnv.PUBLIC_DAILY_CREDITS = "3";
  const draft = await app.fetch(request("/api/v1/drafts", { ...samplePersona, includeAvatar: true, avatarStyle: "cartoon" }), fakeEnv);
  assert.equal(draft.status, 200);
  assert.equal(fakeEnv.AI.calls.length, 2);
  const remaining = await app.fetch(new Request("https://example.test/api/v1/quota"), fakeEnv);
  assert.equal((await remaining.json()).remaining, 0);
  const exhausted = await app.fetch(request("/api/v1/drafts", { ...samplePersona, includeAvatar: false }), fakeEnv);
  assert.equal(exhausted.status, 429);
  assert.equal((await exhausted.json()).errorCode, "QUOTA_EXHAUSTED");
  assert.equal(fakeEnv.AI.calls.length, 2);
  const prompt = await app.fetch(request("/api/v1/prompts", samplePersona), fakeEnv);
  assert.equal(prompt.status, 200);
  assert.match((await prompt.json()).grokbotPrompt, /Grokbot/);
});

test("free public package endpoint works after daily quota runs out", async () => {
  const app = new WorkerApplication();
  const fakeEnv = env(new FakeAI());
  fakeEnv.ENABLE_PUBLIC_GENERATION = "true";
  fakeEnv.PUBLIC_DAILY_CREDITS = "0";
  const response = await app.fetch(request("/api/v1/packages", {
    persona: samplePersona, markdown: "# A persona with no AI request",
  }), fakeEnv);
  assert.equal(response.status, 200);
  assert.equal(fakeEnv.AI.calls.length, 0);
});

test("avatar style choice flows to model prompt in all languages", async () => {
  const app = new WorkerApplication();
  const styles = ["cartoon", "realistic", "pencil", "anime", "watercolor", "threeD", "pixel"];
  for (const locale of ["zh-hant", "zh-hans", "en"]) {
    for (const style of styles) {
      const result = await app.fetch(request("/api/v1/prompts", { ...samplePersona, locale, avatarStyle: style }), env(new FakeAI()));
      assert.equal(result.status, 200);
      const prompts = await result.json();
      assert.ok(prompts.avatarPrompt.length > 60);
      assert.ok(prompts.grokbotPrompt.length > 100);
    }
  }
  const invalid = await app.fetch(request("/api/v1/prompts", { ...samplePersona, avatarStyle: "fake" }), env(new FakeAI()));
  assert.equal(invalid.status, 400);
});

test("realistic avatar uses an English model prompt while Grokbot API stays localized", async () => {
  const app = new WorkerApplication();
  for (const [locale, localizedStyle] of [
    ["zh-hant", /寫實專業人像攝影/],
    ["zh-hans", /写实专业人像摄影/],
    ["en", /Photorealistic professional portrait/],
  ]) {
    const persona = {
      ...samplePersona, locale, avatarStyle: "realistic", includeAvatar: true,
      values: {
        ...samplePersona.values, gender: "女性", age: "48",
        appearance: "深棕色及肩頭髮，深藍色西裝外套",
      },
    };
    const testEnv = env(new FakeAI());

    const api = await app.fetch(request("/api/v1/prompts", persona), testEnv);
    assert.equal(api.status, 200);
    const prompts = await api.json();
    assert.match(prompts.avatarPrompt, localizedStyle);
    assert.equal(testEnv.AI.calls.length, 0, "Prompt-only must never call AI");

    const result = await app.fetch(request("/api/v1/drafts", persona, true), testEnv);
    assert.equal(result.status, 200);
    const imageCall = testEnv.AI.calls.find((call) => call.model.includes("flux"));
    assert.ok(imageCall, "Image model should be invoked");
    const modelPrompt = await avatarPromptFromCall(imageCall);
    assert.match(modelPrompt, /Photorealistic professional portrait/);
    assert.match(modelPrompt, /Exactly ONE adult WOMAN/);
    assert.match(modelPrompt, /one face, centered square composition/);
    assert.match(modelPrompt, /No text, lettering, logo, watermark, or stamp/);
    assert.match(modelPrompt, /Gender presentation: female/);
    assert.match(modelPrompt, /Apparent age: 48/);
    assert.match(modelPrompt, /深棕色及肩頭髮/);
    assert.doesNotMatch(modelPrompt, /\uFFFD/);
  }
});

test("pencil image-model prompt stays in English without affecting returned Chinese prompt", async () => {
  const app = new WorkerApplication();
  const ai = new FakeAI();
  const persona = { ...samplePersona, locale: "zh-hant", avatarStyle: "pencil", includeAvatar: true };
  const api = await app.fetch(request("/api/v1/prompts", persona), env(ai));
  assert.match((await api.json()).avatarPrompt, /鉛筆素描/);
  const response = await app.fetch(request("/api/v1/drafts", persona, true), env(ai));
  assert.equal(response.status, 200);
  const modelPrompt = await avatarPromptFromCall(ai.calls.find((call) => call.model.includes("flux")));
  assert.match(modelPrompt, /Expressive graphite pencil portrait sketch/);
  assert.doesNotMatch(modelPrompt, /Photorealistic professional portrait/);
});

test("UTF-8 JSON fixture preserves Traditional Chinese values end-to-end without shell pipes", async () => {
  // Regression: piping a Chinese PowerShell here-string into `node -` had
  // replaced characters with '?'. Read exact UTF-8 bytes from disk instead.
  const { readFile } = await import("node:fs/promises");
  const jsonBytes = await readFile(new URL("./fixtures/YvonneLin.zh-hant.json", import.meta.url));
  const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(jsonBytes));
  assert.equal(parsed.values.gender, "女性");
  assert.equal(parsed.values.name, "林雅雯");

  const ai = new FakeAI();
  const app = new WorkerApplication();
  const response = await app.fetch(new Request("https://example.test/api/v1/prompts", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: jsonBytes,
  }), env(ai));

  assert.equal(response.status, 200, "Valid Chinese gender must not be rejected");
  const result = await response.json();
  assert.match(result.systemPrompt, /使用繁體中文（臺灣）/);
  assert.match(result.avatarPrompt, /林雅雯/);
  assert.match(result.avatarPrompt, /寫實/);
  assert.match(result.avatarPrompt, /臺灣女性/);
  assert.match(result.avatarPrompt, /深藍色西裝外套/);
  assert.doesNotMatch(result.avatarPrompt, /\uFFFD/);
  assert.equal(ai.calls.length, 0, "Prompt-only must never invoke AI");
});

test("photoreal avatar explicitly excludes illustration, anime and fantasy costume", async () => {
  const app = new WorkerApplication();
  const ai = new FakeAI();
  const { readFile } = await import("node:fs/promises");
  const persona = JSON.parse(await readFile(new URL("./fixtures/YvonneLin.zh-hant.json", import.meta.url), "utf8"));
  const response = await app.fetch(request("/api/v1/drafts", persona, true), env(ai));
  assert.equal(response.status, 200);
  const prompt = await avatarPromptFromCall(ai.calls.find((call) => call.model.includes("flux")));
  assert.match(prompt, /Photorealistic corporate headshot/);
  assert.match(prompt, /No illustration/);
  assert.match(prompt, /No anime/);
  assert.match(prompt, /No fantasy costume/);
  assert.match(prompt, /No other people/);
  assert.match(prompt, /No text, lettering, logo, watermark, or stamp/);
  assert.match(prompt, /Apparent age: 52/);
  assert.match(prompt, /Gender presentation: female/);
});


test("prompt-only Grokbot text includes system rules and job-specific quality guidance", async () => {
  const app = new WorkerApplication();
  const ai = new FakeAI();
  const response = await app.fetch(request("/api/v1/prompts", { ...samplePersona,
    locale: "zh-hant", values: { ...samplePersona.values, role: "人事行政主管" }
  }), env(ai));
  assert.equal(response.status, 200);
  const prompts = await response.json();
  assert.ok(prompts.grokbotPrompt.includes(prompts.systemPrompt));
  assert.ok(prompts.grokbotPrompt.includes(prompts.userPrompt));
  assert.match(prompts.grokbotPrompt, /例行任務/);
  assert.match(prompts.grokbotPrompt, /標準：1100/);
  assert.equal(ai.calls.length, 0);
});

test("detail level is validated and all three locales generate preset-specific guidance", async () => {
  const app = new WorkerApplication();
  for (const locale of ["en", "zh-hant", "zh-hans"]) {
    for (const detailLevel of ["concise", "standard", "full"]) {
      const response = await app.fetch(request("/api/v1/prompts", { ...samplePersona, locale, detailLevel }), env(new FakeAI()));
      assert.equal(response.status, 200);
      const p = await response.json();
      assert.ok(p.grokbotPrompt.includes(p.systemPrompt));
      assert.match(p.userPrompt, /owner/i);
      const a = await app.fetch(request("/api/v1/prompts", { presetId: "assistant", locale, detailLevel, values: { brief: "A personal assistant" } }), env(new FakeAI()));
      assert.equal(a.status, 200);
      assert.doesNotMatch((await a.json()).userPrompt, /每項重要職責|每项重要职责|For every important duty/);
    }
  }
  const invalid = await app.fetch(request("/api/v1/prompts", { ...samplePersona, detailLevel: "unknown" }), env(new FakeAI()));
  assert.equal(invalid.status, 400);
});

test("Workers AI respects the requested detail and workplace generation stability", async () => {
  const app = new WorkerApplication();
  for (const [detailLevel, tokens] of [["concise", 2600], ["standard", 4500], ["full", 5900]]) {
    const ai = new FakeAI();
    const res = await app.fetch(request("/api/v1/personas", { ...samplePersona, detailLevel }, true), env(ai));
    assert.equal(res.status, 200);
    assert.equal(ai.calls[0].input.max_tokens, tokens);
    assert.equal(ai.calls[0].input.temperature, 0.55);
    assert.match(ai.calls[0].input.messages[1].content, /Owner/);
  }
});


test("Yvonne regression: prompt uses operational contract, preserves given identity and rejects generic biography", async () => {
  const { readFile } = await import("node:fs/promises");
  const persona = JSON.parse(await readFile(new URL("./fixtures/YvonneLin.zh-hant.json", import.meta.url), "utf8"));
  const ai = new FakeAI();
  const response = await new WorkerApplication().fetch(request("/api/v1/prompts", persona), env(ai));
  assert.equal(response.status, 200);
  const result = await response.json();
  const full = result.grokbotPrompt;
  assert.ok(full.includes(result.systemPrompt));
  assert.ok(full.includes(result.userPrompt));
  assert.match(full, /林雅雯/);
  assert.match(full, /Yvonne Lin/);
  assert.match(full, /52/);
  assert.match(full, /謹慎細心/);
  assert.match(full, /幽默風趣/);
  assert.match(full, /核心職責與可驗證成果/);
  assert.match(full, /決策權限與責任分工/);
  assert.match(full, /三種實際工作情境/);
  assert.match(full, /例行任務/);
  assert.match(full, /資訊不足／跨部門爭議/);
  assert.match(full, /錯誤／風險事件/);
  assert.match(full, /薪資.*核算/);
  assert.match(full, /制度設計/);
  assert.match(full, /提交前內部驗收/);
  assert.doesNotMatch(full, /身分與定位、目標與職責、判斷與決策方式/);
  assert.equal(ai.calls.length, 0);
});

test("HR-specific hints never leak into unrelated workplace personas or invented ages", async () => {
  const app = new WorkerApplication();
  const ai = new FakeAI();
  await app.fetch(request("/api/v1/prompts", {
    presetId: "workplace", locale: "zh-hant",
    values: { brief: "人事行政主管", department: "人事行政部", role: "主管" },
  }), env(ai));
  const response = await app.fetch(request("/api/v1/prompts", {
    presetId: "workplace", locale: "zh-hant",
    values: { brief: "採購主管", department: "採購部", role: "主管" },
  }), env(ai));
  assert.equal(response.status, 200);
  const prompt = (await response.json()).grokbotPrompt;
  assert.doesNotMatch(prompt, /人事行政專業示例|薪資核算|招募制度|52 歲/);
  assert.match(prompt, /三種實際工作情境/);
  assert.equal(ai.calls.length, 0);
});

test("preset output contracts differ by role and locale; revisions preserve original structure", async () => {
  const app = new WorkerApplication();
  for (const [locale, marker] of [
    ["en", /Three concrete working scenarios/],
    ["zh-hant", /三種實際工作情境/],
    ["zh-hans", /三种具体工作场景/],
  ]) {
    const result = await app.fetch(request("/api/v1/prompts", { ...samplePersona, locale }), env(new FakeAI()));
    assert.equal(result.status, 200);
    assert.match((await result.json()).userPrompt, marker);

    const assistant = await app.fetch(request("/api/v1/prompts", {
      presetId: "assistant", locale, values: { brief: "A useful scheduling assistant" },
    }), env(new FakeAI()));
    assert.equal(assistant.status, 200);
    const assistantPrompt = (await assistant.json()).userPrompt;
    assert.doesNotMatch(assistantPrompt, marker);
    assert.doesNotMatch(assistantPrompt, /薪資核算|招募制度/);
  }
  const revised = await app.fetch(request("/api/v1/prompts", {
    ...samplePersona, existingMarkdown: "# 小晴\\n原來設定", revisionInstructions: "只修改說話方式",
  }), env(new FakeAI()));
  assert.equal(revised.status, 200);
  const text = (await revised.json()).userPrompt;
  assert.match(text, /原來設定/);
  assert.doesNotMatch(text, /三種實際工作情境/);
});


test("new default model selection uses Qwen3 and FLUX.2 Klein with multipart", async () => {
  const app = new WorkerApplication();
  const ai = new FakeAI();
  const response = await app.fetch(request("/api/v1/drafts", {
    ...samplePersona, avatarStyle: "realistic", includeAvatar: true,
  }, true), env(ai));
  assert.equal(response.status, 200);
  assert.equal(ai.calls[0].model, "@cf/qwen/qwen3-30b-a3b-fp8");
  assert.equal(ai.calls[0].input.max_tokens, 4500);
  assert.equal(ai.calls.length, 2);
  assert.equal(ai.calls[1].model, "@cf/black-forest-labs/flux-2-klein-4b");
  assert.match(ai.calls[1].input.multipart.contentType, /^multipart\/form-data; boundary=/);
  assert.ok(ai.calls[1].input.multipart.body);
  assert.equal((await response.json()).avatarMimeType, "image/jpeg");
});

test("FLUX.2 PNG image is correctly reported and packaged with PNG extension", async () => {
  class PngAI extends FakeAI {
    async run(model, input) {
      if (model.includes("flux-2-klein")) {
        this.calls.push({ model, input });
        return { image: btoa(String.fromCharCode(137,80,78,71,13,10,26,10,0,0,0,0)) };
      }
      return super.run(model, input);
    }
  }
  const app = new WorkerApplication();
  const ai = new PngAI();
  const input = { ...samplePersona, includeAvatar: true, avatarStyle: "realistic" };
  const draft = await app.fetch(request("/api/v1/drafts", input, true), env(ai));
  assert.equal(draft.status, 200);
  assert.equal((await draft.json()).avatarMimeType, "image/png");
  const zip = await app.fetch(request("/api/v1/personas", input, true), env(ai));
  assert.equal(zip.status, 200);
  assert.ok(inspectZip(await zip.arrayBuffer()).includes("avatar.png"));
});

test("new models failing fall back safely to legacy text and image models", async () => {
  class UnavailableAI extends FakeAI {
    async run(model, input) {
      if (model.includes("qwen3-30b") || model.includes("flux-2-klein")) {
        this.calls.push({ model, input });
        throw Error("Model unavailable");
      }
      return super.run(model, input);
    }
  }
  const ai = new UnavailableAI();
  const result = await new WorkerApplication().fetch(request("/api/v1/drafts", {
    ...samplePersona, includeAvatar: true,
  }, true), env(ai));
  assert.equal(result.status, 200);
  assert.deepEqual(ai.calls[1].input.chat_template_kwargs, { enable_thinking: false });
  assert.deepEqual(ai.calls.map(x => x.model), [
    "@cf/qwen/qwen3-30b-a3b-fp8",
    "@cf/google/gemma-4-26b-a4b-it",
    "@cf/black-forest-labs/flux-2-klein-4b",
    "@cf/black-forest-labs/flux-1-schnell",
  ]);
});

test("workplace contract explicitly rejects unsupported personal traits and invented company facts", async () => {
  const app = new WorkerApplication();
  const ai = new FakeAI();
  const {readFile} = await import("node:fs/promises");
  const persona = JSON.parse(await readFile(new URL("./fixtures/YvonneLin.zh-hant.json", import.meta.url), "utf8"));
  const result = await app.fetch(request("/api/v1/prompts", persona), env(ai));
  assert.equal(result.status, 200);
  const prompt = (await result.json()).grokbotPrompt;
  assert.match(prompt, /不可擅自補上未指定的 MBTI/);
  assert.match(prompt, /員工人數/);
  assert.match(prompt, /假設案例/);
  assert.equal(ai.calls.length, 0);
});

test("Yvonne prompt balances HR operational independence with policy authorization", async () => {
  const { readFile } = await import("node:fs/promises");
  const payload = JSON.parse(await readFile(new URL("./fixtures/YvonneLin.zh-hant.json", import.meta.url), "utf8"));
  const ai = new FakeAI();
  const res = await new WorkerApplication().fetch(request("/api/v1/prompts", payload), env(ai));
  assert.equal(res.status, 200);
  const p = await res.json();
  assert.ok(p.grokbotPrompt.includes(p.userPrompt));
  assert.match(p.grokbotPrompt, /林雅雯/);
  assert.match(p.grokbotPrompt, /52/);
  assert.match(p.userPrompt, /薪資／獎金核算及覆核/);
  assert.match(p.userPrompt, /勞健保與福利行政/);
  assert.match(p.userPrompt, /到離職行政/);
  assert.match(p.userPrompt, /覆核部屬成果/);
  assert.match(p.userPrompt, /已核定制度下的薪資/);
  assert.match(p.userPrompt, /謹慎不代表事事升級/);
  assert.match(p.userPrompt, /假設案例／非公司現況/);
  assert.match(p.userPrompt, /佔位符/);
  assert.equal(ai.calls.length, 0);
});

test("non-HR managers receive autonomy and hypothetical-label standards but not HR duties", async () => {
  const ai = new FakeAI();
  const result = await new WorkerApplication().fetch(request("/api/v1/prompts", {
    presetId: "workplace", locale: "zh-hant",
    values: { name: "小明", department: "產品研發部", role: "研發主管" },
    includeAvatar: false,
  }), env(ai));
  assert.equal(result.status, 200);
  const p = (await result.json()).userPrompt;
  assert.match(p, /自主完成的例行本業/);
  assert.match(p, /假設案例／非公司現況/);
  assert.doesNotMatch(p, /人事行政專業示例|薪資／獎金核算及覆核|勞健保與福利行政/);
  assert.equal(ai.calls.length, 0);
});

test("autonomy and hypothetical reporting guidance stay localized in all workplace prompts", async () => {
  const app = new WorkerApplication();
  const prompts = [
    ["en", /Hypothetical example \/ not company data/, /completed independently/],
    ["zh-hant", /假設案例／非公司現況/, /自主完成/],
    ["zh-hans", /假设案例／非公司现况/, /独立完成/],
  ];
  for (const [locale, examples, autonomy] of prompts) {
    const ai = new FakeAI();
    const result = await app.fetch(request("/api/v1/prompts", { ...samplePersona, locale }), env(ai));
    assert.equal(result.status, 200);
    const p = (await result.json()).userPrompt;
    assert.match(p, examples);
    assert.match(p, autonomy);
    assert.equal(ai.calls.length, 0);
  }
});

test("zh-hant portrait uses a Taiwanese visual default without inventing nationality", async () => {
  const ai = new FakeAI();
  const app = new WorkerApplication();
  const input = {
    presetId: "workplace", locale: "zh-hant",
    avatarStyle: "realistic", includeAvatar: true,
    values: { name: "林婉婷", englishName: "Lynn", age: "28", gender: "女性",
      department: "行政部", role: "助理", appearance: "俐落短髮，合身職業裝" },
  };
  const promptsRes = await app.fetch(request("/api/v1/prompts", input), env(ai));
  assert.equal(promptsRes.status, 200);
  const prompts = await promptsRes.json();
  assert.match(prompts.avatarPrompt, /當代臺灣職場人物/);
  assert.match(prompts.avatarPrompt, /不表示人物已確認具有臺灣國籍/);
  assert.match(prompts.grokbotPrompt, /僅供圖像使用/);
  assert.doesNotMatch(prompts.userPrompt, /臺灣國籍/);
  assert.equal(ai.calls.length, 0);
  const draft = await app.fetch(request("/api/v1/drafts", input, true), env(ai));
  assert.equal(draft.status, 200);
  const imagePrompt = await avatarPromptFromCall(ai.calls.find(call => call.model.includes("flux")));
  assert.match(imagePrompt, /contemporary Taiwanese professional/);
  assert.match(imagePrompt, /natural East Asian facial features/);
  assert.match(imagePrompt, /Apparent age: 28/);
  assert.match(imagePrompt, /No anime/);
});

test("zh-hans defaults to mainland visual context, English assumes no country", async () => {
  const app = new WorkerApplication();
  for (const [locale, output, visual] of [
    ["zh-hans", /中国大陆职场人物/, /mainland Chinese professional/],
    ["en", /does not specify nationality/, /No nationality, ethnicity, or specific country should be inferred/],
  ]) {
    const ai = new FakeAI();
    const person = { ...samplePersona, locale, includeAvatar: true, avatarStyle: "realistic" };
    const res = await app.fetch(request("/api/v1/prompts", person), env(ai));
    assert.equal(res.status, 200);
    assert.match((await res.json()).avatarPrompt, output);
    const draft = await app.fetch(request("/api/v1/drafts", person, true), env(ai));
    assert.equal(draft.status, 200);
    const imagePrompt = await avatarPromptFromCall(ai.calls.find(call => call.model.includes("flux")));
    assert.match(imagePrompt, visual);
  }
});

test("explicit background and appearance override locale visual suggestions", async () => {
  const app = new WorkerApplication();
  const inputs = [
    { values: { ...samplePersona.values, origin: "巴西" }, expected: /User-specified nationality or cultural background: 巴西/, absent: /contemporary Taiwanese professional/ },
    { values: { ...samplePersona.values, appearance: "歐洲白人，金色短髮" }, expected: /Follow those explicit details/, absent: /contemporary Taiwanese professional/ },
    { values: { ...samplePersona.values, origin: "日裔美國人", appearance: "銀色長髮" }, expected: /日裔美國人/, absent: /contemporary Taiwanese professional/ },
  ];
  for (const item of inputs) {
    const ai = new FakeAI();
    const person = { ...samplePersona, locale: "zh-hant", includeAvatar: true, avatarStyle: "realistic", values: item.values };
    const promptsResponse = await app.fetch(request("/api/v1/prompts", person), env(ai));
    assert.equal(promptsResponse.status, 200);
    const prompts = await promptsResponse.json();
    assert.match(prompts.avatarPrompt, item.values.origin ? /國籍／地域文化背景/ : /外貌已有明確地域或族裔線索/);
    const draft = await app.fetch(request("/api/v1/drafts", person, true), env(ai));
    assert.equal(draft.status, 200);
    const prompt = await avatarPromptFromCall(ai.calls.find(call => call.model.includes("flux")));
    assert.match(prompt, item.expected);
    assert.doesNotMatch(prompt, item.absent);
  }
});

test("new origin field is optional in all presets and localized across all languages", async () => {
  const app = new WorkerApplication();
  for (const [locale, expected] of [
    ["en", /Nationality \/ regional background/],
    ["zh-hant", /人物國籍／地域背景/],
    ["zh-hans", /人物国籍／地域背景/],
  ]) {
    const result = await app.fetch(new Request("https://example.test/api/v1/presets?locale=" + locale), env(new FakeAI()));
    assert.equal(result.status, 200);
    const data = await result.json();
    for (const preset of data.presets) {
      const field = preset.fields.find(x => x.id === "origin");
      assert.ok(field, "origin must be supported in " + preset.id);
      assert.equal(field.required, undefined);
      assert.match(field.label, expected);
    }
  }
});

test("photographic avatar and Markdown share exactly the same identity facts", async () => {
  const app = new WorkerApplication();
  const ai = new FakeAI();
  const persona = {
    presetId: "workplace", locale: "zh-hant", avatarStyle: "realistic",
    includeAvatar: true,
    values: {
      name: "林語安", gender: "女性", age: "34", department: "客戶服務部",
      role: "客服主管", appearance: "短髮，深藍色西裝外套",
      personality: "細心、沉穩，語氣親切，不亂答應客戶",
    },
  };
  const response = await app.fetch(request("/api/v1/prompts", persona), env(ai));
  assert.equal(response.status, 200);
  const prompts = await response.json();
  assert.match(prompts.userPrompt, /使用者明確指定的角色事實/);
  assert.ok(prompts.userPrompt.includes("Gender / 性別：female / 女性"));
  assert.ok(prompts.userPrompt.includes("Age / 年齡：34"));
  assert.match(prompts.userPrompt, /深藍色西裝外套/);
  assert.match(prompts.userPrompt, /客服主管/);
  assert.match(prompts.avatarPrompt, /只有一位成年女性，不可畫成男性/);
  assert.match(prompts.avatarPrompt, /34 歲/);
  assert.match(prompts.avatarPrompt, /客服主管/);
  assert.match(prompts.grokbotPrompt, /只有一位成年女性/);
  const res = await app.fetch(request("/api/v1/drafts", persona, true), env(ai));
  assert.equal(res.status, 200);
  const imagePrompt = await avatarPromptFromCall(ai.calls.find(c => c.model.includes("flux")));
  assert.match(imagePrompt, /Exactly ONE adult WOMAN/);
  assert.match(imagePrompt, /Never depict a man/);
  assert.match(imagePrompt, /appears 34 years old/);
  assert.match(imagePrompt, /客戶服務部/);
  assert.match(imagePrompt, /short|短髮/);
  assert.match(imagePrompt, /深藍色西裝外套/);
  assert.match(imagePrompt, /calm and confident/);
});

test("model interprets natural-language gender after text generation; no fixed-word parser needed", async () => {
  const app = new WorkerApplication();
  for (const [brief, gender, age] of [
    ["大美女，一個暗戀總經理的秘書", "female", "29"],
    ["40 歲男工程師，認真", "male", "40"],
    ["An amazing professional without gender cues", "female", "35"],
  ]) {
    class SemanticAI extends FakeAI {
      async run(model, input) {
        if (!model.includes("flux") && input?.messages?.[0]?.content?.includes("MANDATORY API TRANSPORT FORMAT OVERRIDE")) {
          this.calls.push({model,input});
          return {response:JSON.stringify({
            markdown:`# 虛構角色\\n\\n此人設定為${gender === "female" ? "女性" : "男性"}，${age} 歲。`,
            resolvedIdentity:{gender,age,appearance:"短髮，職場穿著",role:"秘書",visualTone:"confident and playful"},
          })};
        }
        return super.run(model,input);
      }
    }
    const ai=new SemanticAI();
    const persona={presetId:"workplace",locale:"zh-hant",avatarStyle:"realistic",includeAvatar:true,values:{brief}};
    const before = await app.fetch(request("/api/v1/prompts",persona),env(ai));
    assert.equal(before.status,200);
    assert.match((await before.json()).avatarPrompt,/畫面只有一位成年人物/);
    assert.equal(ai.calls.length,0);
    const result=await app.fetch(request("/api/v1/drafts",persona,true),env(ai));
    assert.equal(result.status,200);
    const data=await result.json();
    assert.equal(data.resolvedIdentity.gender,gender);
    assert.equal(data.resolvedIdentity.age,age);
    const imagePrompt=await avatarPromptFromCall(ai.calls.find(c=>c.model.includes("flux")));
    assert.match(imagePrompt,gender === "female" ? /Exactly ONE adult WOMAN/ : /Exactly ONE adult MAN/);
    assert.match(imagePrompt,new RegExp("appears "+age+" years old"));
    assert.equal(ai.calls.length,2);
  }
});

test("review flags an inconsistent woman portrait, regenerates it once and reports revision", async () => {
  class ReviewAI extends FakeAI {
    reports = ["FAIL", "PASS"];
    async run(model, input) {
      if (model.includes("moondream")) {
        this.calls.push({ model, input });
        return { answer: this.reports.shift() };
      }
      return super.run(model, input);
    }
  }
  const ai = new ReviewAI();
  const settings = env(ai);
  settings.AVATAR_VISUAL_REVIEW = "true";
  const resp = await new WorkerApplication().fetch(request("/api/v1/drafts", {
    presetId:"workplace",locale:"zh-hant",includeAvatar:true,avatarStyle:"realistic",
    values:{name:"林語安",gender:"女性",age:"34",department:"客服部",role:"主管"},
  }, true), settings);
  assert.equal(resp.status, 200);
  const data = await resp.json();
  assert.equal(data.avatarReviewStatus, "revised");
  assert.equal(data.avatarMimeType, "image/jpeg");
  assert.equal(ai.calls.filter(c=>c.model.includes("moondream")).length, 2);
  assert.equal(ai.calls.filter(c=>c.model.includes("flux")).length, 2);
  assert.match(ai.calls.find(c=>c.model.includes("moondream")).input.question, /one adult woman/);
});

test("repeated visual mismatch withholds the avatar rather than handing out a contradictory image", async () => {
  class ReviewAI extends FakeAI {
    async run(model, input) {
      if (model.includes("moondream")) {
        this.calls.push({ model, input });
        return { answer:"FAIL" };
      }
      return super.run(model, input);
    }
  }
  const ai=new ReviewAI(), settings=env(ai);
  settings.AVATAR_VISUAL_REVIEW="true";
  const resp=await new WorkerApplication().fetch(request("/api/v1/drafts", {
    presetId:"workplace",locale:"zh-hant",includeAvatar:true,avatarStyle:"realistic",
    values:{name:"林語安",gender:"女性",age:"34",department:"客服部",role:"主管"},
  },true),settings);
  assert.equal(resp.status,200);
  const json=await resp.json();
  assert.equal(json.avatarReviewStatus,"rejected");
  assert.equal(json.avatarBase64,undefined);
  assert.equal(ai.calls.filter(c=>c.model.includes("flux")).length,2);
});

test("vision review unavailable yields unverified rather than claiming an avatar passed", async () => {
  class ReviewAI extends FakeAI {
    async run(model, input) {
      if (model.includes("moondream")) {
        this.calls.push({ model, input });
        throw Error("vision unavailable");
      }
      return super.run(model,input);
    }
  }
  const ai=new ReviewAI(), settings=env(ai);
  settings.AVATAR_VISUAL_REVIEW="true";
  const res=await new WorkerApplication().fetch(request("/api/v1/drafts",{
    presetId:"workplace",locale:"zh-hant",includeAvatar:true,avatarStyle:"realistic",
    values:{name:"林語安",gender:"女性",age:"34",department:"客服部",role:"主管"}
  },true),settings);
  assert.equal(res.status,200);
  const data=await res.json();
  assert.equal(data.avatarReviewStatus,"unverified");
  assert.ok(data.avatarBase64);
  assert.equal(ai.calls.filter(c=>c.model.includes("flux")).length,1);
});

test("external Grokbot resolves a persona and obtains its FINAL avatar prompt at zero AI cost", async () => {
  const app=new WorkerApplication(), ai=new FakeAI();
  const persona={presetId:"workplace",locale:"zh-hant",includeAvatar:true,avatarStyle:"realistic",
    values:{brief:"大美女，能力很強的總經理秘書，說話有趣"}};
  const preview=await app.fetch(request("/api/v1/prompts",persona),env(ai));
  assert.equal(preview.status,200);
  assert.match((await preview.json()).grokbotPrompt,/api\/v1\/avatar-prompts/);
  const identity={gender:"female",age:"29",appearance:"深棕色短髮，正式職場穿著",
    role:"總經理秘書",personality:"專業又幽默",visualTone:"confident, friendly with a playful smile"};
  const response=await app.fetch(request("/api/v1/avatar-prompts",{
    persona,markdown:"# 新秘書\\n\\n女性，29 歲。",resolvedIdentity:identity
  }),env(ai));
  assert.equal(response.status,200);
  const p=await response.json();
  assert.equal(p.resolvedIdentity.gender,"female");
  assert.match(p.avatarPrompt,/只有一位成年女性/);
  assert.match(p.imageModelPrompt,/Exactly ONE adult WOMAN/);
  assert.match(p.imageModelPrompt,/appears 29 years old/);
  assert.match(p.imageModelPrompt,/confident, friendly with a playful smile/);
  assert.equal(ai.calls.length,0);
});

test("avatar-prompts rejects missing, malformed or conflicting identity without AI cost",async()=>{
  const app=new WorkerApplication(), ai=new FakeAI();
  const persona={...samplePersona,values:{...samplePersona.values,gender:"女性"}};
  for(const data of [
    {persona,markdown:"# 女主管"},
    {persona,markdown:"# 女主管",resolvedIdentity:{gender:"male"}},
    {persona,markdown:"# 女主管",resolvedIdentity:{gender:"female",age:123}},
    {persona,markdown:"",resolvedIdentity:{gender:"female"}},
  ]){
    const result=await app.fetch(request("/api/v1/avatar-prompts",data),env(ai));
    assert.equal(result.status,400);
  }
  assert.equal(ai.calls.length,0);
});

test("Workers AI resolves identity before generating FLUX imagery in one text call",async()=>{
  const app=new WorkerApplication(),ai=new FakeAI();
  const resp=await app.fetch(request("/api/v1/drafts",{
    ...samplePersona,includeAvatar:true,avatarStyle:"realistic",values:{brief:"有才華的秘書"}
  },true),env(ai));
  assert.equal(resp.status,200);
  const data=await resp.json();
  assert.equal(data.resolvedIdentity.gender,"female");
  assert.match(data.markdown,/核心定位/);
  assert.deepEqual(ai.calls.map(x=>x.model),["@cf/qwen/qwen3-30b-a3b-fp8","@cf/black-forest-labs/flux-2-klein-4b"]);
  assert.match(ai.calls[0].input.messages[0].content,/MANDATORY API TRANSPORT FORMAT OVERRIDE/);
  const prompt=await avatarPromptFromCall(ai.calls[1]);
  assert.match(prompt,/Exactly ONE adult WOMAN/);
});

test("incomplete AI identity fails closed before any image request",async()=>{
  class IncompleteAI extends FakeAI {
    async run(model,input){
      if(model.includes("flux"))throw Error("Unexpected image request");
      this.calls.push({model,input});
      return {response:JSON.stringify({markdown:"# Unresolved",resolvedIdentity:{gender:"unspecified"}})};
    }
  }
  const ai=new IncompleteAI();
  const resp=await new WorkerApplication().fetch(request("/api/v1/drafts",{
    ...samplePersona,includeAvatar:true
  },true),env(ai));
  assert.equal(resp.status,503);
  assert.equal((await resp.json()).errorCode,"AI_UNAVAILABLE");
  assert.equal(ai.calls.filter(x=>x.model.includes("flux")).length,0);
});

test("existing Markdown-only generators remain compatible with text-only revisions",async()=>{
  const ai=new FakeAI();
  const resp=await new WorkerApplication().fetch(request("/api/v1/drafts",{
    ...samplePersona,includeAvatar:false,existingMarkdown:"# 小晴",revisionInstructions:"修改說話方式"
  },true),env(ai));
  assert.equal(resp.status,200);
  assert.match((await resp.json()).markdown,/核心定位/);
  assert.equal(ai.calls.length,1);
});

test("external persona ZIP stores a supplied resolvedIdentity without calling AI",async()=>{
  const ai=new FakeAI();
  const card={gender:"female",age:"29",role:"秘書",visualTone:"confident",source:"ai"};
  const resp=await new WorkerApplication().fetch(request("/api/v1/packages",{
    persona:{...samplePersona,includeAvatar:false},
    markdown:"# 小晴\\n\\n29 歲女性秘書",resolvedIdentity:card
  },true),env(ai));
  assert.equal(resp.status,200);
  const bytes=new Uint8Array(await resp.arrayBuffer()),view=new DataView(bytes.buffer);
  let pos=0,manifest=null;
  while(pos<bytes.byteLength && view.getUint32(pos,true)===0x04034b50){
    const len=view.getUint32(pos+18,true),nameLen=view.getUint16(pos+26,true),extraLen=view.getUint16(pos+28,true);
    const name=new TextDecoder().decode(bytes.subarray(pos+30,pos+30+nameLen));
    if(name==="manifest.json")manifest=JSON.parse(new TextDecoder().decode(bytes.subarray(pos+30+nameLen+extraLen,pos+30+nameLen+extraLen+len)));
    pos+=30+nameLen+extraLen+len;
  }
  assert.equal(manifest.resolvedIdentity.gender,"female");
  assert.equal(ai.calls.length,0);
});

test("explicit age in persona has priority and mismatching model cards are rejected",async()=>{
  const ai=new FakeAI(),app=new WorkerApplication();
  const persona={...samplePersona,values:{...samplePersona.values,age:"52",gender:"女性"}};
  const result=await app.fetch(request("/api/v1/avatar-prompts",{
    persona,markdown:"# 林雅雯\\n\\n52 歲",
    resolvedIdentity:{gender:"female",age:"35",appearance:"深棕色短髮"}
  }),env(ai));
  assert.equal(result.status,400);
  assert.equal(ai.calls.length,0);
});

test("a text model returning plain Markdown can recover its identity with an extra AI extraction call",async()=>{
  class RepairingAI extends FakeAI {
    async run(model,input){
      if(model.includes("flux"))return super.run(model,input);
      this.calls.push({model,input});
      if(input.messages?.[0]?.content?.startsWith("MANDATORY API TRANSPORT FORMAT OVERRIDE")){
        return {response:JSON.stringify({
          markdown:"# 新秘書\\n\\n女性，29 歲，專業幽默。",
          resolvedIdentity:{gender:"female",age:"29",role:"秘書",visualTone:"composed"}
        })};
      }
      return {response:"# 新秘書\\n\\n女性，29 歲，專業幽默。"};
    }
  }
  const ai=new RepairingAI();
  const response=await new WorkerApplication().fetch(request("/api/v1/drafts",{
    presetId:"workplace",locale:"zh-hant",includeAvatar:true,avatarStyle:"realistic",
    values:{brief:"很有魅力的秘書"}
  },true),env(ai));
  assert.equal(response.status,200);
  assert.equal((await response.json()).resolvedIdentity.gender,"female");
  assert.equal(ai.calls.filter(c=>!c.model.includes("flux")).length,2);
  assert.equal(ai.calls.filter(c=>c.model.includes("flux")).length,1);
});

test("quick fictional persona without specified age uses the ONE AI chosen age for Markdown and image",async()=>{
  class AgeChoosingAI extends FakeAI {
    async run(model,input){
      if(!model.includes("flux") && input.messages?.[0]?.content?.includes("MANDATORY API TRANSPORT FORMAT OVERRIDE")){
        this.calls.push({model,input});
        return {response:JSON.stringify({
          markdown:"# 林映真 Iris Lin\n\n## 固定身分與人格行為\n風趣認真的總經理秘書。",
          resolvedIdentity:{name:"林映真",gender:"female",age:"31",appearance:"大波浪捲髮，商務套裝",role:"總經理秘書",
            visualTone:"confident, professional, playful"}
        })};
      }
      return super.run(model,input);
    }
  }
  const ai=new AgeChoosingAI(),app=new WorkerApplication();
  const persona={presetId:"workplace",locale:"zh-hant",avatarStyle:"realistic",includeAvatar:true,
    values:{brief:"大美女、暗戀總經理的秘書，說話風趣、做事認真，大波浪捲"}};
  const response=await app.fetch(request("/api/v1/drafts",persona,true),env(ai));
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.resolvedIdentity.age,"31");
  assert.match(data.markdown,/年齡：31 歲（AI 建議設定）/);
  assert.match(data.markdown,/林映真/);
  const imagePrompt=await avatarPromptFromCall(ai.calls.find(x=>x.model.includes("flux")));
  assert.match(imagePrompt,/appears 31 years old/);
  assert.match(imagePrompt,/大波浪捲髮/);
  assert.equal(ai.calls.filter(x=>!x.model.includes("flux")).length,1);
});

test("generated Markdown and AI identity card cannot disagree about age",async()=>{
  class ConflictingAgeAI extends FakeAI {
    async run(model,input){
      if(model.includes("flux"))throw Error("Image must not use inconsistent ages");
      this.calls.push({model,input});
      return {response:JSON.stringify({markdown:"# 秘書\n\n現年 42 歲的女性秘書。",
        resolvedIdentity:{gender:"female",age:"28",appearance:"捲髮"}})};
    }
  }
  const ai=new ConflictingAgeAI();
  const result=await new WorkerApplication().fetch(request("/api/v1/drafts",{
    presetId:"workplace",locale:"zh-hant",includeAvatar:true,values:{brief:"一個風趣秘書"}
  },true),env(ai));
  assert.equal(result.status,503);
  assert.equal(ai.calls.filter(x=>x.model.includes("flux")).length,0);
});

test("missing AI-chosen age fails safely instead of producing an ageless portrait",async()=>{
  class AgeMissingAI extends FakeAI {
    async run(model,input){
      if(model.includes("flux"))throw Error("Never generate image without age");
      this.calls.push({model,input});
      return {response:JSON.stringify({markdown:"# 秘書\n\n風趣專業。",
        resolvedIdentity:{gender:"female",age:"",role:"秘書"}})};
    }
  }
  const ai=new AgeMissingAI();
  const result=await new WorkerApplication().fetch(request("/api/v1/drafts",{
    presetId:"workplace",locale:"zh-hant",includeAvatar:true,values:{brief:"一個風趣秘書"}
  },true),env(ai));
  assert.equal(result.status,503);
  assert.equal(ai.calls.filter(x=>x.model.includes("flux")).length,0);
});

test("Grokbot prompt asks the local AI to settle age in both Markdown and card",async()=>{
  const ai=new FakeAI(),app=new WorkerApplication();
  const response=await app.fetch(request("/api/v1/prompts",{
    presetId:"workplace",locale:"zh-hant",includeAvatar:true,values:{brief:"一個很漂亮的秘書"}
  }),env(ai));
  assert.equal(response.status,200);
  const prompt=(await response.json()).grokbotPrompt;
  assert.match(prompt,/年齡要由本地 AI 選定具體數字/);
  assert.match(prompt,/resolvedIdentity/);
  assert.equal(ai.calls.length,0);
});
