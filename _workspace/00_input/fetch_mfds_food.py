"""공공데이터포털 '전국통합식품영양성분정보(음식)표준데이터'(publicDataPk=15100070)를 내려받는다.

사이트의 JSON 다운로드 버튼과 같은 순서로 공개 엔드포인트를 호출한다:
  1) /download/columList.json  → 컬럼·전체 건수·테이블 이름
  2) /download/standard.json   → 10,000건씩 페이지 단위 데이터
결과는 사이트 JSON 다운로드와 같은 형태 {fields:[{id}], records:[{한글 컬럼명: 값}]}로 저장한다.

사용법: python -I fetch_mfds_food.py <출력 폴더>
"""
import json
import math
import sys
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

PK = "15100070"
BASE = "https://www.data.go.kr"
PAGE_URL = f"{BASE}/data/{PK}/standard.do"
UA = {"User-Agent": "Mozilla/5.0", "Referer": PAGE_URL, "X-Requested-With": "XMLHttpRequest"}


def get_json(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode("utf-8"))


def main(out_dir):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    header = get_json(f"{BASE}/download/columList.json?pk={PK}&ext=JSON")
    cols = header["columList"]
    head_kr = [c["columNm"] for c in cols]
    head_en = [c["columCode"] for c in cols]
    total = int(header["totalCount"])
    table = header["tableVO"]["svcTableNm"]
    col_nm_list = header["tableVO"]["colNmList"]
    if isinstance(col_nm_list, str):
        col_nm_list = [col_nm_list]
    per_page = 10000
    pages = math.ceil(total / per_page)
    print(f"file={header.get('fileName')} total={total} pages={pages} cols={len(cols)}")

    records = []
    for page in range(1, pages + 1):
        params = [("publicDataPk", PK), ("totalCount", total), ("svcTableNm", table),
                  ("perPage", per_page), ("page", page)]
        params += [("colNmList", c) for c in col_nm_list]
        rows = get_json(f"{BASE}/download/standard.json?{urllib.parse.urlencode(params)}")
        for row in rows:
            records.append({kr: row.get(en) for kr, en in zip(head_kr, head_en)})
        print(f"page {page}/{pages}: +{len(rows)} (누계 {len(records)})")
        time.sleep(1)

    data = {"fields": [{"id": h} for h in head_kr], "records": records}
    raw = out / "mfds_food_std_raw.json"
    raw.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    meta = {
        "dataset": "전국통합식품영양성분정보(음식)표준데이터",
        "publicDataPk": PK,
        "source_page": PAGE_URL,
        "provider": "식품의약품안전처",
        "downloaded": date.today().isoformat(),
        "file_name_on_site": header.get("fileName"),
        "total_count_reported": total,
        "records_saved": len(records),
        "columns": head_kr,
    }
    (out / "SOURCE.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"saved {raw} ({raw.stat().st_size:,} bytes), records={len(records)}")


if __name__ == "__main__":
    main(sys.argv[1])
