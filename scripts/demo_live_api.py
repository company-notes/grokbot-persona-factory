"""Live end-to-end API demonstration: prompt-only, avatar generation and packaging.

This is an operator-run example, not the server-side implementation.
No API token is sent to the public Persona Forge site.
"""
import base64
import io
import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "api-demo-output"
PAYLOAD = ROOT / "examples" / "HRAdministrativeManagerRequest.json"
MARKDOWN = ROOT / "examples" / "HRAdministrativeManagerPersona.md"


def json_request(url, data=None, token=None):
    headers = {"Accept": "application/json"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(
        url,
        data=None if data is None else json.dumps(data, ensure_ascii=False).encode("utf-8"),
        headers=headers,
        method="GET" if data is None else "POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=110) as response:
            return response.read(), response.status, response.headers.get("Content-Type", "")
    except urllib.error.HTTPError as exc:
        detail = exc.read()[:2000].decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code} on {req.full_url}: {detail}") from exc


def discover_base_url():
    override = os.environ.get("PERSONA_BASE_URL", "").strip().rstrip("/")
    if override:
        if not override.startswith("https://"):
            raise RuntimeError("PERSONA_BASE_URL must use https")
        return override
    token = os.environ.get("CLOUDFLARE_API_TOKEN", "")
    account = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
    if not token or not account:
        raise RuntimeError("Provide PERSONA_BASE_URL or Cloudflare CI credentials")
    api = f"https://api.cloudflare.com/client/v4/accounts/{account}/workers/subdomain"
    raw, _, _ = json_request(api, token=token)
    result = json.loads(raw)
    if not result.get("success") or not result.get("result", {}).get("subdomain"):
        raise RuntimeError("Cannot resolve account Workers subdomain via Cloudflare API")
    worker_name = os.environ.get("PERSONA_WORKER_NAME", "grokbot-persona-factory")
    return f"https://{worker_name}.{result['result']['subdomain']}.workers.dev"


def save(name, content):
    path = OUT / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    return path


def main():
    base = discover_base_url()
    print("API target:", base)
    persona = json.loads(PAYLOAD.read_text(encoding="utf-8"))
    expected_md = MARKDOWN.read_text(encoding="utf-8")

    quota_raw, _, _ = json_request(base + "/api/v1/quota")
    print("Quota before:", quota_raw.decode("utf-8")[:300])

    prompt_raw, status, _ = json_request(base + "/api/v1/prompts", persona)
    prompts = json.loads(prompt_raw)
    if status != 200 or not prompts.get("grokbotPrompt") or not prompts.get("avatarPrompt"):
        raise RuntimeError("Prompt API returned incomplete result")
    if "寫實" not in prompts["avatarPrompt"] and "photoreal" not in prompts["avatarPrompt"].lower():
        raise RuntimeError("Realistic avatar style not included in prompt")
    save("Grokbot-Prompt.txt", prompts["grokbotPrompt"].encode("utf-8"))
    save("Prompt-Bundle.json", prompt_raw)
    print("Prompt-only API successful; no AI credits charged.")

    raw_zip, status, content_type = json_request(base + "/api/v1/personas", persona)
    if status != 200 or "zip" not in content_type:
        raise RuntimeError("Direct AI-generation API did not return ZIP")
    save("Direct-Worker-AI-Output.zip", raw_zip)
    with zipfile.ZipFile(io.BytesIO(raw_zip)) as archive:
        files = archive.namelist()
        if "avatar.jpg" not in files:
            raise RuntimeError(f"No avatar found in ZIP: {files}")
        avatar = archive.read("avatar.jpg")
        worker_md = archive.read("persona.md").decode("utf-8")
    if not avatar.startswith(b"\xff\xd8\xff"):
        raise RuntimeError("Returned image is not a JPEG")
    print("Worker API generated a real avatar:", len(avatar), "bytes; draft chars:", len(worker_md))

    final_request = {
        "persona": persona,
        "markdown": expected_md,
        "avatarBase64": base64.b64encode(avatar).decode("ascii"),
        "avatarMimeType": "image/jpeg",
    }
    final_zip, status, content_type = json_request(base + "/api/v1/packages", final_request)
    if status != 200 or "zip" not in content_type:
        raise RuntimeError("Packaging API did not return ZIP")
    with zipfile.ZipFile(io.BytesIO(final_zip)) as archive:
        files = archive.namelist()
        assert {"persona.md", "avatar.jpg", "manifest.json"}.issubset(files)
        assert archive.read("persona.md").decode("utf-8") == expected_md
    save("Angela-Su-HR-Administration-Manager.zip", final_zip)
    save("avatar.jpg", avatar)
    save("persona.md", expected_md.encode("utf-8"))
    quota_after, _, _ = json_request(base + "/api/v1/quota")
    print("Quota after:", quota_after.decode("utf-8")[:300])
    print("SUCCESS: Used real API prompt, AI avatar, and ZIP packager")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("LIVE API TEST FAILURE:", type(exc).__name__, str(exc), file=sys.stderr)
        raise
