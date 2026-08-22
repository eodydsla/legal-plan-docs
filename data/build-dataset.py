"""환경분야 법정계획 데이터셋 빌드 — web/sheets/*.csv 생성.

입력
  raw/legal-plan-list.json    국토환경정보센터 /kei/legalPlan/list.json 응답 (150건)
  raw/legal-plan-files.json   계획별 첨부 보고서 목록 (235건)
  verified.py                 차수 이력 검증 결과 (기본계획·종합계획 58건 + 누락 8 + 해양 5)

출력
  ../web/sheets/plans.csv     계획 — 한 계획이 한 행. code 가 공통번호다.
  ../web/sheets/editions.csv  차수 — 한 차수가 한 행. plan_code 로 계획에 붙는다.

실행: python3 data/build-dataset.py

설계 메모
  같은 계획의 여러 차수를 한 덩어리로 다루기 위해 계획(EnvPlan)과 차수(EnvPlanEdition)를
  나눴다. 화면·CSV·ZIP 어디서든 `code`(EP-001 형식)가 같으면 같은 계획이고,
  차수는 `EP-001-1` 처럼 code 뒤에 순번을 붙여 식별한다.
  차수가 없는 계획(지자체 개별 수립 등)도 행 하나짜리 차수를 만들어 두어
  "차수 없음"이 데이터 구멍이 아니라 명시적인 값이 되게 한다.
"""
import csv
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "web", "sheets")
sys.path.insert(0, HERE)

import verified as V  # noqa: E402

BASE = "https://data.neins.go.kr"

# 계획부문 → 정렬 가중치. 기본·종합계획이 위로 오게 한다.
CATEGORY_ORDER = {
    "종합계획": 0, "기본계획": 1, "관리계획": 2, "시행계획": 3,
    "실시계획": 4, "세부계획": 5, "실천계획": 6, "기타": 7,
}


def article_of(url):
    """조문 링크 마지막 조각에서 근거조문을 뽑는다 (…/제14조 → 제14조)"""
    if not url:
        return ""
    seg = url.rstrip("/").split("/")[-1]
    return seg if re.match(r"^제.+조", seg) else ""


# 계획수립자 원문은 조문 표현이라 종류가 50가지가 넘는다. 그대로 두면 부처 필터가 못 쓰게 되므로
# 필터용으로만 묶고, 원문은 planner 컬럼에 그대로 남긴다.
LOCAL_HINTS = ("시ㆍ도지사", "시·도지사", "시장", "군수", "구청장", "도지사",
               "지방자치단체", "시·도", "시·군·구", "17개 시·도")
ENV_AGENCY_HINTS = ("유역환경청", "지방환경관서", "지방환경청")


def ministry_of(planner, fallback=""):
    """계획수립자 원문에서 소관부처를 추린다. 검증된 값(fallback)이 있으면 그걸 쓴다."""
    if fallback:
        return fallback
    p = (planner or "").strip()
    if not p:
        return "미지정"
    if "기후에너지환경부" in p or "환경부" in p:
        return "기후에너지환경부"
    if any(h in p for h in ENV_AGENCY_HINTS):
        return "기후에너지환경부 소속기관"
    if p in ("정부", "국무총리") or "중앙행정기관" in p:
        return "정부(관계부처 합동)"
    if any(h in p for h in LOCAL_HINTS):
        return "지방자치단체"
    if "산림청" in p:
        return "산림청"
    if "해양수산부" in p:
        return "해양수산부"
    # 사업시행자·관리청·위원회 등 — 부처가 아니라 집행 주체다
    return "기타 수립주체"


# 조문에 수립자가 안 적혀 있어 규칙으로 못 가르는 것만 손으로 지정한다
LEVEL_OVERRIDE = {
    "국가탄소중립녹색성장전략": "국가",          # 법 제7조 — 정부가 수립
    "계획 및 대책": "광역(시·도)",              # 환경정책기본법 제38조제2항 — 시·도지사가 수립
    # 물환경보전법 제49조 — 시행자가 세우고 장관이 승인하는 구조라 국가계획이 아니다.
    # neins 의 수립자 표기(기후에너지환경부장관)는 승인권자를 적은 것으로 보인다.
    "공공폐수처리시설 기본계획": "개별시설·사업",
}


def level_of(planner, ministry, name):
    """계획을 수립 층위로 가른다 — 국가 / 유역·권역 / 광역 / 기초 / 개별시설·사업.

    공간범위(neins의 unit)는 절반 넘게 비어 있어 쓸 수 없다. 조문에 적힌 계획수립자를 본다.
    유역환경청장·지방환경관서의 장은 환경부 소속기관이지만 관할이 유역이라 국가와 나눴다.
    """
    if name in LEVEL_OVERRIDE:
        return LEVEL_OVERRIDE[name]

    p = (planner or "").strip()
    m = (ministry or "").strip()

    # 소속기관·집행주체가 먼저 걸러져야 한다 ('청장'이 국가 규칙에 잡히기 전에)
    if any(h in p for h in ("유역환경청", "지방환경관서", "지방환경청")) or "유역물관리위원회" in p:
        return "유역·권역"
    if any(h in p for h in ("사업시행자", "설치자", "관리자", "관리청", "법인", "취약기관", "운영자")):
        return "개별시설·사업"

    if "지방자치단체의 장" in p or "지방위원회" in p:
        return "광역·기초"

    has_wide = any(h in p for h in ("시ㆍ도지사", "시·도지사", "특별시장", "광역시장", "도지사"))
    has_basic = any(h in p for h in ("시장ㆍ군수", "시장·군수", "구청장", "군수"))
    if has_wide and has_basic:
        return "광역·기초"
    if has_wide:
        return "광역(시·도)"
    if has_basic:
        return "기초(시·군·구)"

    if p in ("정부", "국가", "국무총리") or "장관" in p or "중앙행정기관" in p or "위원회" in p or "청장" in p:
        return "국가"
    # 수립자 표기가 없으면 검증에서 잡은 소관부처로 판단한다
    if m and m not in ("미지정", "기타 수립주체", "지방자치단체"):
        return "국가"
    if not p and not m:
        return "미상"
    return "미상"


def split_period(period):
    """'2026~2030' → (2026, 2030). '2021~' 처럼 열린 구간도 받는다."""
    if not period:
        return "", ""
    m = re.match(r"\s*(\d{4})\s*~\s*(\d{4})?\s*$", period)
    if not m:
        return "", ""
    return m.group(1), m.group(2) or ""


# ── 계획 조립 ────────────────────────────────────────────────
# neins 150건이 기준이고, 검증된 58건에는 차수 이력을 붙인다.
# 누락분·해양환경은 source 로 구분해 뒤에 이어 붙인다.

verified_by_idx = {}
for i, d in enumerate(V.sel, 1):
    cyc, ministry, hist, note = V.H[i]
    verified_by_idx[d["idx"]] = dict(no=i, cycle=cyc, ministry=ministry, hist=hist, note=note)

plans, editions = [], []
n = 0

for d in V.data:
    n += 1
    code = "EP-%03d" % n
    idx = d["idx"]
    ver = verified_by_idx.get(idx)
    name = V.NAME_FIX.get(ver["no"], d["plan"].strip()) if ver else d["plan"].strip()
    atts = V.files.get(idx, [])

    plans.append({
        "code": code,
        "seq": n,
        "name": name,
        "category": d["rmrk"],
        "law": d["stt_nm"].strip(),
        "law_url": d.get("stt_url", ""),
        "article": article_of(d.get("plan_url")),
        "article_url": d.get("plan_url", ""),
        # 검증에서 주기를 바로잡은 경우만 덮어쓰고, 아니면 원 데이터를 쓴다
        "cycle": ((ver and ver["cycle"]) or d.get("plan_cycle") or "미규정"),
        "ministry": ministry_of(d.get("plan_dsgnr"), ver["ministry"] if ver else ""),
        "planner": (d.get("plan_dsgnr") or "").strip(),
        "scope": (d.get("unit") or "").strip(),
        "level": level_of(d.get("plan_dsgnr"), ver["ministry"] if ver else "", name),
        "verified": "1" if ver else "",
        "source": "neins",
        "note": ver["note"] if ver else "",
        "order": (CATEGORY_ORDER.get(d["rmrk"], 9) * 1000) + n,
    })

    if ver:
        hist = ver["hist"]
    else:
        # 미검증 계획 — 첨부 보고서 파일명에서 최신 차수만 추정해 한 행 넣는다
        best = None
        for a in atts:
            m = re.search(r"제\s*(\d+)\s*차", a["attFileName"])
            if m and (best is None or int(m.group(1)) > best):
                best = int(m.group(1))
        # 차수를 못 잡아도 빈칸으로 두지 않고 '미확인' 한 행을 만든다 — 데이터 구멍과 구분한다
        hist = [("제%d차" % best if best else "", "", "미확인")]

    for k, (label, period, conf) in enumerate(hist, 1):
        ys, ye = split_period(period)
        editions.append({
            "code": "%s-%d" % (code, k),
            "plan_code": code,
            "seq": k,
            "label": label,
            "period": period,
            "year_from": ys,
            "year_to": ye,
            "confidence": conf,
            "is_current": "1" if k == len(hist) else "",
            "doc_file": "",
            "doc_size": "",
            "source_url": "",
            "note": "",
        })

    # 첨부 보고서는 차수에 붙이지 않고 계획 단위 참고자료로 남긴다
    # (파일명 차수와 검증된 차수가 어긋나는 경우가 있어 억지로 매칭하지 않는다)
    for a in atts:
        plans[-1].setdefault("_atts", []).append(a)


def add_extra(rows, source):
    """사이트 누락분·해양환경 계획을 이어 붙인다"""
    global n
    for name, law, article, cycle, ministry, hist, note in rows:
        n += 1
        code = "EP-%03d" % n
        plans.append({
            "code": code, "seq": n, "name": name,
            "category": "종합계획" if "종합" in name else "기본계획",
            "law": law.strip("「」"), "law_url": "", "article": article, "article_url": "",
            "cycle": cycle, "ministry": ministry, "planner": "", "scope": "",
            "level": "국가",
            "verified": "1", "source": source, "note": note,
            "order": (CATEGORY_ORDER.get("기본계획", 9) * 1000) + n,
        })
        for k, (label, period, conf) in enumerate(hist, 1):
            ys, ye = split_period(period)
            editions.append({
                "code": "%s-%d" % (code, k), "plan_code": code, "seq": k,
                "label": label, "period": period, "year_from": ys, "year_to": ye,
                "confidence": conf, "is_current": "1" if k == len(hist) else "",
                "doc_file": "", "doc_size": "", "source_url": "", "note": "",
            })


add_extra([(p, l, a, cy, b, hist, note) for p, l, a, cy, b, hist, note in V.MISSING], "added")
add_extra([(p, l, a, cy, b, [(cha, per, "참고")], "출처 사이트 범위 밖 — 해양수산부 소관")
           for p, l, a, cy, b, cha, per in V.MARINE], "marine")

for p in plans:
    p.pop("_atts", None)

os.makedirs(OUT, exist_ok=True)
for fname, rows in (("plans.csv", plans), ("editions.csv", editions)):
    path = os.path.join(OUT, fname)
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print("%-14s %4d행  %s" % (fname, len(rows), os.path.relpath(path, HERE)))

byc = {}
for p in plans:
    byc[p["category"]] = byc.get(p["category"], 0) + 1
print("계획부문:", " · ".join("%s %d" % kv for kv in sorted(byc.items(), key=lambda x: -x[1])))
print("검증:", sum(1 for p in plans if p["verified"]), "/ 출처:",
      " · ".join("%s %d" % (s, sum(1 for p in plans if p["source"] == s))
                 for s in ("neins", "added", "marine")))
