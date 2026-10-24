const allowedText = new Set([
  "@cf/qwen/qwen3-30b-a3b-fp8",
  "@cf/google/gemma-4-26b-a4b-it",
  "@cf/zai-org/glm-4.7-flash",
  "@cf/openai/gpt-oss-120b",
]);
const allowedImage = new Set([
  "@cf/black-forest-labs/flux-1-schnell",
  "@cf/black-forest-labs/flux-2-klein-4b",
]);
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/benchmark" || request.method !== "POST") {
      return new Response("Not found", {status:404});
    }
    const {model, input, imagePrompt} = await request.json();
    if (allowedText.has(model)) {
      const runInput = {
        ...input,
        ...(model.includes("gemma-4") ? {chat_template_kwargs:{enable_thinking:false}} : {}),
      };
      return Response.json(await env.AI.run(model,runInput));
    }
    if (allowedImage.has(model)) {
      let result;
      if (model.includes("klein")) {
        const form = new FormData();
        form.append("prompt",imagePrompt);
        form.append("width","512");
        form.append("height","512");
        const body = new Response(form);
        result=await env.AI.run(model,{multipart:{
          body:body.body,contentType:body.headers.get("content-type")
        }});
      } else {
        result=await env.AI.run(model,{prompt:imagePrompt,steps:4});
      }
      return Response.json(result);
    }
    return new Response("Model not allowlisted",{status:400});
  }
};
