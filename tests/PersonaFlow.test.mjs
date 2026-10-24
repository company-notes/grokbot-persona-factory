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

    return { response: "# 小晴\n\n## 核心定位\n總經理特助，重視職責和溝通。" };
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
    assert.match(modelPrompt, /Exactly ONE original character/);
    assert.match(modelPrompt, /No extra people, no groups, no duplicate faces/);
    assert.match(modelPrompt, /no text, no lettering/);
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
  for (const [detailLevel, tokens] of [["concise", 1900], ["standard", 3400], ["full", 4200]]) {
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
  assert.equal(ai.calls[0].input.max_tokens, 3400);
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
  assert.match(prompts.avatarPrompt, /這不表示人物已確認具有臺灣國籍/);
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
