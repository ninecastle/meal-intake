# NEIS 교육정보 개방 포털 시험 호출(인증키 없이). 사용자 정보는 넣지 않는다. 사용법: python -I neis_call.py <서비스> key=value ...
import json, sys, urllib.parse, urllib.request
svc = sys.argv[1]
params = {"Type": "json", "pIndex": "1", "pSize": "5"}
for kv in sys.argv[2:]:
    k, v = kv.split("=", 1)
    params[k] = v
url = f"https://open.neis.go.kr/hub/{svc}?" + urllib.parse.urlencode(params, encoding="utf-8")
req = urllib.request.Request(url, headers={"Origin": "https://meal-intake-2026.web.app"})
with urllib.request.urlopen(req, timeout=20) as r:
    hdr = {k: v for k, v in r.headers.items() if k.lower().startswith(("access-control", "content-type"))}
    body = r.read().decode("utf-8")
print("HEADERS", hdr)
d = json.loads(body)
out = json.dumps(d, ensure_ascii=False, indent=1)
open(f"{svc}.json", "w", encoding="utf-8").write(out)
print(out[:2500])
