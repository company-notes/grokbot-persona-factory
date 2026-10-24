import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { QuotaLedger } from "../build/quota/QuotaLedger.js";
import { DatabaseSync } from "node:sqlite";
import { WorkerApplication } from "../build/http/WorkerApplication.js";

const app = new WorkerApplication();
const db = new DatabaseSync(":memory:");
const quota = new QuotaLedger({ storage: { sql: {
  exec(query, ...params) {
    const stmt = db.prepare(query);
    if (query.startsWith("CREATE")) {
      stmt.run();
      return { toArray: () => [] };
    }
    return { toArray: () => stmt.all(...params) };
  },
} } });
const webRoot = path.resolve("public/web");

const env = {
  AI: {
    async run(model, input) {
      if (model.includes("flux")) {
        return { image: btoa(String.fromCharCode(255, 216, 255, 217)) };
      }
      const markdown="# 模擬人設\\n\\n## 工作方式\\n目標、Owner、結果。";
      if(input?.messages?.[0]?.content?.includes("MANDATORY API TRANSPORT FORMAT OVERRIDE")){
        return {response:JSON.stringify({markdown,resolvedIdentity:{
          gender:"female",age:"29",role:"秘書",appearance:"短髮、正式職場裝束",
          personality:"自信、幽默",visualTone:"confident and composed"
        }})};
      }
      return {response:markdown};
    },
  },
  ASSETS: {
    async fetch(request) {
      const pathname = new URL(request.url).pathname;
      const filename = pathname === "/" ? "index.html" : pathname.substring(1);
      const resource = path.resolve(webRoot, filename);
      if (!resource.startsWith(webRoot + path.sep) && resource !== path.join(webRoot, "index.html")) {
        return new Response("Forbidden", { status: 403 });
      }
      const contents = await readFile(resource);
      const type = resource.endsWith(".js") ? "application/javascript" : resource.endsWith(".css") ? "text/css" : "text/html";
      return new Response(contents, { headers: { "content-type": type } });
    },
  },
  PERSONA_API_TOKEN: "long-test-token-0123456789-abcdef",
  ENABLE_PUBLIC_GENERATION: "true",
  PUBLIC_DAILY_CREDITS: "150",
  QUOTA_LEDGER: { getByName: () => ({ fetch: (input, init) => quota.fetch(input instanceof Request ? input : new Request(input, init)) }) },
  PERSONA_RATE_LIMIT: { limit: async () => ({ success: true }) },
};

const server = http.createServer(async (incoming, outgoing) => {
  try {
    const request = new Request(`http://localhost:8788${incoming.url}`, {
      method: incoming.method,
      headers: incoming.headers,
      body: ["GET", "HEAD"].includes(incoming.method) ? undefined : incoming,
      duplex: "half",
    });
    const response = await app.fetch(request, env);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error(error);
    outgoing.writeHead(500);
    outgoing.end("Server error");
  }
});

server.listen(8788, "127.0.0.1", () => {
  console.log("Test server on http://127.0.0.1:8788");
});
