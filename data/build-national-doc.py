"""국가계획만 추린 마크다운 생성 → ../환경분야_법정계획_국가계획.md

실행: python3 data/build-national-doc.py   (build-dataset.py 를 먼저 돌려 CSV를 만들어 둔다)

'국가계획'의 판정은 build-dataset.py 의 level_of() 가 한다. 조문에 적힌 계획수립자를 보고
중앙행정기관의 장·정부·국가위원회가 세우는 것만 국가로 본다. 공간범위(neins의 unit)는
절반 넘게 비어 있어 쓰지 않았다.
"""
import csv
import collections
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SHEETS = os.path.join(HERE, "..", "web", "sheets")
OUT = os.path.join(HERE, "..", "환경분야_법정계획_국가계획.md")

plans = list(csv.DictReader(open(os.path.join(SHEETS, "plans.csv"), encoding="utf-8")))
eds = list(csv.DictReader(open(os.path.join(SHEETS, "editions.csv"), encoding="utf-8")))

by_plan = collections.defaultdict(list)
for e in eds:
    by_plan[e["plan_code"]].append(e)

nat = [p for p in plans if p["level"] == "국가"]
nat.sort(key=lambda p: int(p["order"]))

CAT_ORDER = ["종합계획", "기본계획", "관리계획", "시행계획", "기타"]
SOURCE_LABEL = {"neins": "", "added": "누락 발굴", "marine": "해양수산부 소관"}


def esc(s):
    return (s or "").replace("|", "\\|").strip()


def link(text, url):
    if not url:
        return esc(text)
    u = url.replace("%", "%25").replace(" ", "%20").replace("(", "%28").replace(")", "%29")
    return "[%s](%s)" % (esc(text), u)


def cnt(c):
    return " · ".join("%s %d" % kv for kv in c.most_common())


nat_eds = [e for p in nat for e in by_plan[p["code"]]]
c_cat = collections.Counter(p["category"] for p in nat)
c_min = collections.Counter(p["ministry"] for p in nat)
c_conf = collections.Counter(e["confidence"] for e in nat_eds)
c_cyc = collections.Counter(p["cycle"] for p in nat)
multi = [p for p in nat if len(by_plan[p["code"]]) > 1]
verified = [p for p in nat if p["verified"]]

o = []
w = o.append
w("# 환경분야 법정계획 — 국가계획 (%d개 계획 / %d개 차수)" % (len(nat), len(nat_eds)))
w("")
w("전체 %d개 계획 중 **중앙행정기관의 장·정부·국가위원회가 수립하는 계획**만 추렸다." % len(plans))
w("지자체·유역·개별시설이 세우는 계획은 뺐다 (아래 «제외한 것» 참조).")
w("")
w("출처(1차): 국토환경정보센터 [환경관련 법정계획](https://data.neins.go.kr/bbs/legalPlan) · "
  "검증(2차): 소관부처 공표자료 · 기준일 2026-08-22")
w("")
w("- 계획부문: %s" % cnt(c_cat))
w("- 갱신주기: %s" % cnt(c_cyc))
w("- 차수 %d개 — 신뢰도 %s" % (len(nat_eds), cnt(c_conf)))
w("- 차수가 둘 이상인 계획 **%d건** · 차수 이력을 검증한 계획 **%d건**" % (len(multi), len(verified)))
w("")
w("## 국가계획을 가른 기준")
w("")
w("공간범위 항목은 원 데이터의 절반 넘게 비어 있어 쓸 수 없다. **조문에 적힌 계획수립자**로 갈랐다.")
w("")
w("| 층위 | 수립자 | 계획 수 | 이 문서 |")
w("|---|---|---:|:-:|")
lv = collections.Counter(p["level"] for p in plans)
for k, desc in [
    ("국가", "중앙행정기관의 장 · 정부 · 국가위원회"),
    ("유역·권역", "유역환경청장 · 지방환경관서의 장 · 유역물관리위원회"),
    ("광역(시·도)", "시·도지사"),
    ("광역·기초", "시·도지사와 시장·군수·구청장이 각각 수립"),
    ("기초(시·군·구)", "시장·군수·구청장"),
    ("개별시설·사업", "사업시행자 · 시설 설치자 · 관리청 · 국민신탁법인"),
]:
    w("| %s | %s | %d | %s |" % (k, desc, lv.get(k, 0), "**포함**" if k == "국가" else "제외"))
w("")
w("경계에 있어 손으로 판단한 것 세 건은 이렇다.")
w("")
w("- **국가탄소중립녹색성장전략** — 조문에 수립자 표기가 없으나 법 제7조상 정부가 세운다 → 국가")
w("- **계획 및 대책**(환경정책기본법 제38조제2항) — 시·도지사가 특별종합대책 시행을 위해 세운다 → 광역")
w("- **공공폐수처리시설 기본계획**(물환경보전법 제49조) — 시행자가 세우고 장관이 승인하는 구조다 → 개별시설")
w("  (원 데이터의 수립자 표기 `기후에너지환경부장관`은 승인권자를 적은 것으로 보인다)")
w("")
w("---")
w("")
w("## 전체 목록 (차수별)")
w("")
w("같은 계획은 `공통번호`가 같다. 차수번호는 공통번호 뒤에 순번을 붙인 것이다.")
w("")
w("| 공통번호 | 계획명 | 계획부문 | 근거법률 | 근거조문 | 차수 | 계획기간 | 갱신주기 | 소관부처 | 신뢰도 |")
w("|---|---|---|---|---|---|---|---|---|---|")
for p in nat:
    rows = by_plan[p["code"]]
    for k, e in enumerate(rows):
        tag = SOURCE_LABEL.get(p["source"], "")
        name = esc(p["name"]) + (f" ({tag})" if tag and k == 0 else "")
        w("| %s | %s | %s | %s | %s | %s | %s | %s | %s | %s |" % (
            e["code"],
            link(name, p["article_url"]) if k == 0 else name,
            esc(p["category"]) if k == 0 else "",
            (link("「%s」" % p["law"], p["law_url"]) if k == 0 else ""),
            esc(p["article"]) if k == 0 else "",
            esc(e["label"]) or "—",
            esc(e["period"]) or "—",
            esc(p["cycle"]) if k == 0 else "",
            esc(p["ministry"]) if k == 0 else "",
            esc(e["confidence"]) or "—",
        ))
w("")
w("---")
w("")
w("## 계획부문별")
w("")
for cat in CAT_ORDER:
    rows = [p for p in nat if p["category"] == cat]
    if not rows:
        continue
    w("### %s (%d건)" % (cat, len(rows)))
    w("")
    w("| 공통번호 | 계획명 | 근거법률 | 조문 | 현행 차수 | 계획기간 | 소관부처 |")
    w("|---|---|---|---|---|---|---|")
    for p in rows:
        es = by_plan[p["code"]]
        cur = next((e for e in es if e["is_current"]), es[-1])
        w("| %s | %s | 「%s」 | %s | %s | %s | %s |" % (
            p["code"], esc(p["name"]), esc(p["law"]), esc(p["article"]),
            esc(cur["label"]) or "—", esc(cur["period"]) or "—", esc(p["ministry"]),
        ))
    w("")
w("---")
w("")
w("## 소관부처별")
w("")
w("| 소관부처 | 계획 수 | 계획명 |")
w("|---|---:|---|")
for m, n in c_min.most_common():
    names = " · ".join(esc(p["name"]) for p in nat if p["ministry"] == m)
    w("| %s | %d | %s |" % (esc(m), n, names))
w("")
w("---")
w("")
w("## 차수가 둘 이상인 국가계획 (%d건)" % len(multi))
w("")
w("계획 하나가 여러 차수로 이어져 온 것들이다. 이 계보가 이 자료의 핵심이다.")
w("")
w("| 공통번호 | 계획명 | 차수별 계획기간 |")
w("|---|---|---|")
for p in sorted(multi, key=lambda x: -len(by_plan[x["code"]])):
    es = by_plan[p["code"]]
    chain = " → ".join(
        "%s %s" % (e["label"] or "차수없음", e["period"] or "?") for e in es
    )
    w("| %s | %s | %s |" % (p["code"], esc(p["name"]), chain))
w("")
w("---")
w("")
w("## 제외한 것 (%d건)" % (len(plans) - len(nat)))
w("")
w("국가계획이 아니라서 뺐다. 층위별로 어떤 계획이 빠졌는지 남겨 둔다.")
w("")
for k in ["유역·권역", "광역(시·도)", "광역·기초", "기초(시·군·구)", "개별시설·사업"]:
    rows = [p for p in plans if p["level"] == k]
    if not rows:
        continue
    w("### %s (%d건)" % (k, len(rows)))
    w("")
    w("| 계획명 | 근거법률 | 계획수립자 |")
    w("|---|---|---|")
    for p in sorted(rows, key=lambda x: int(x["order"])):
        w("| %s | 「%s」 %s | %s |" % (
            esc(p["name"]), esc(p["law"]), esc(p["article"]), esc(p["planner"]) or "—"))
    w("")
w("---")
w("")
w("## 한계")
w("")
w("- **차수 이력을 검증한 것은 %d건**이다. 나머지 %d건은 원 데이터에 차수 항목이 없어 "
  "첨부 보고서 파일명에서 최신 차수만 추정했고, 계획기간은 비어 있다(신뢰도 `미확인`)."
  % (len(verified), len(nat) - len(verified)))
w("- 검증은 기본계획·종합계획을 대상으로 했다. 시행계획·관리계획·기타는 차수 조사를 하지 않았다.")
w("- 해양수산부 소관 5건은 국토환경정보센터 범위 밖이라 별도로 찾아 넣은 것이고, 현행 차수만 확인했다.")
w("- 자세한 차수 이력과 출처는 [환경분야_법정계획_기본계획_종합계획.md](환경분야_법정계획_기본계획_종합계획.md) 참조.")

open(OUT, "w", encoding="utf-8").write("\n".join(o) + "\n")
print("국가계획 %d건 / 차수 %d개 → %s" % (len(nat), len(nat_eds), os.path.relpath(OUT, HERE)))
