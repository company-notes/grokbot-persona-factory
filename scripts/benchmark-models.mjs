import { readFile, mkdir, writeFile } from "node:fs/promises";
import { PersonaValidator } from "../build/persona/PersonaValidator.js";
import { PromptComposer } from "../build/persona/PromptComposer.js";
import { PresetCatalog } from "../build/catalog/PresetCatalog.js";
const account=process.env.CLOUDFLARE_ACCOUNT_ID, token=process.env.CLOUDFLARE_API_TOKEN;
const local=process.env.MODEL_BENCH_LOCAL;
if(!local && (!account || !token)) throw new Error("Missing Cloudflare credentials");
const fixture=JSON.parse(await readFile(new URL("../tests/fixtures/YvonneLin.zh-hant.json",import.meta.url),"utf8"));
const preset=new PresetCatalog().require(fixture.presetId,fixture.locale);
const persona=new PersonaValidator().validate(fixture,preset);
const prompts=new PromptComposer().compose(persona,preset);
await mkdir("model-benchmark-results",{recursive:true});
const auth={Authorization:`Bearer ${token}`};
const url=model=>`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`;
async function call(model,payload,asForm=false){
  const endpoint=local ?? url(model);
  const body=local
    ? JSON.stringify(asForm ? {model,imagePrompt:typeof payload.get === "function" ? payload.get("prompt") : payload.prompt} : {model,input:payload})
    : asForm ? payload : JSON.stringify(payload);
  const response=await fetch(endpoint,{
    method:"POST",headers:local?{"Content-Type":"application/json"}:asForm?auth:{...auth,"Content-Type":"application/json"},
    body,
    signal:AbortSignal.timeout(115000)
  });
  const raw=await response.text();
  let data;try{data=JSON.parse(raw)}catch{data={raw:raw.slice(0,180)}}
  if(!response.ok || data.success===false)throw Error(`HTTP ${response.status} ${JSON.stringify(data.errors??data.raw??data).slice(0,350)}`);
  return data.result??data;
}
const models=[
 "@cf/qwen/qwen3-30b-a3b-fp8",
 "@cf/google/gemma-4-26b-a4b-it",
 "@cf/zai-org/glm-4.7-flash",
 "@cf/openai/gpt-oss-120b"
];
let any=false;
for(const model of models){
  const started=Date.now();const slug=model.split("/").at(-1);
  try{
    const res=await call(model,{
      messages:[{role:"system",content:prompts.systemPrompt},{role:"user",content:prompts.userPrompt}],
      max_tokens:2700,temperature:0.45
    });
    const output=(res.response??res.choices?.[0]?.message?.content??"").trim();
    const quality={
      age:output.includes("52"),name:output.includes("林雅雯"),
      scenario:output.includes("例行")&&output.includes("風險"),
      clearResponsibility:output.includes("薪資")||output.includes("出勤"),
      approval:output.includes("核定")||output.includes("核准"),
      dialog:output.includes("「")||output.includes("："),
    };
    await writeFile(`model-benchmark-results/${slug}.md`,output,"utf8");
    console.log(JSON.stringify({model,ms:Date.now()-started,chars:output.length,
     checked:quality,usage:res.usage??{},keys:Object.keys(res).slice(0,8)}));
    any=any||output.length>0;
  }catch(error){console.log(JSON.stringify({model,failed:String(error)}))}
}
const imagePrompt="Photorealistic corporate headshot. Exactly ONE Taiwanese woman about 52 years old, shoulder-length dark brown hair, navy business jacket, warm natural smile, realistic skin texture, clean studio background, centered square head-and-shoulders portrait. No other people. No illustration. No anime. No fantasy costume. No text, lettering, logo, watermark, or stamp.";
for(const model of ["@cf/black-forest-labs/flux-1-schnell","@cf/black-forest-labs/flux-2-klein-4b"]){
  const slug=model.split("/").at(-1);const start=Date.now();
  try{
    const isKlein=model.includes("klein");
    const form=new FormData();
    form.set("prompt",imagePrompt);form.set("width","512");form.set("height","512");
    const imageRes=await call(model,isKlein?form:{prompt:imagePrompt,steps:4},true);
    const base64=imageRes.image??"";
    const bytes=Buffer.from(base64,"base64");
    const mime=bytes[0]===0xff?"jpeg":bytes[0]===0x89?"png":"unknown";
    if(bytes.length>1000 && mime!=="unknown")await writeFile(`model-benchmark-results/${slug}.${mime==="png"?"png":"jpg"}`,bytes);
    console.log(JSON.stringify({model,ms:Date.now()-start,imageBytes:bytes.length,mime}));
  }catch(error){console.log(JSON.stringify({model,failed:String(error)}))}
}
if(!any) throw Error("No text model was accessible with this CI token. Require Workers AI Read permission for live benchmarking.");
