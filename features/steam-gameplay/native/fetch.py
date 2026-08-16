import json
import sys

try:
    from curl_cffi import requests
except Exception as err:
    json.dump({"ok": False, "error": f"curl_cffi import failed: {err}"}, sys.stdout)
    sys.exit(1)


def main():
    req = json.load(sys.stdin)
    url = req.get("url")
    if not url:
        json.dump({"ok": False, "error": "missing url"}, sys.stdout)
        return

    headers = dict(req.get("headers") or {})
    headers.setdefault("Origin", "https://www.youtube.com")
    headers.setdefault("Referer", "https://www.youtube.com/")

    body = req.get("body")
    if isinstance(body, dict):
        body = json.dumps(body)

    res = requests.request(
        req.get("method") or "GET",
        url,
        headers=headers,
        data=body,
        impersonate=req.get("impersonate") or "chrome",
        timeout=req.get("timeout") or 15,
        allow_redirects=True,
    )
    text = res.text or ""
    if len(text) > 900_000:
        text = text[:900_000]
    json.dump({"ok": True, "status": res.status_code, "text": text}, sys.stdout)


if __name__ == "__main__":
    try:
        main()
    except Exception as err:
        json.dump({"ok": False, "error": str(err)}, sys.stdout)
        sys.exit(1)
