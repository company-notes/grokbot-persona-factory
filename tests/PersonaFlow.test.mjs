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
    const modelPrompt = imageCall.input.prompt;
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
  const modelPrompt = ai.calls.find((call) => call.model.includes("flux")).input.prompt;
  assert.match(modelPrompt, /Expressive graphite pencil portrait sketch/);
  assert.doesNotMatch(modelPrompt, /Photorealistic professional portrait/);
});
