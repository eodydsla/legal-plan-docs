"""국토환경정보센터 첨부 원문 235건 내려받기 → ../web/public/docs/

실행: python3 data/fetch-docs.py                 국가계획 원문만 (기본, 약 1.7GB / 165건)
      python3 data/fetch-docs.py --all           전 층위 (약 8.1GB / 232건)
      python3 data/fetch-docs.py --level 광역     특정 층위만
      python3 data/fetch-docs.py --force         이미 받은 것도 다시 받는다

전체는 8.1GB다. 지자체 계획 첨부가 시·군을 통째로 묶은 ZIP이라 큰데,
하수도정비기본계획 하나가 3.4GB다. 저장소에는 넣지 않는다(.gitignore 로 web/public/docs/* 제외).

파일명은 `{attFilePath}.{ext}` 로 저장한다 — 원 파일명이 한글이라 경로 문제가 나기 쉽고,
같은 이름의 보고서가 여러 계획에 붙어 있어 충돌하기 때문이다.
사람이 읽을 이름(attFileName)은 DB의 title 로 들어가고, ZIP 으로 묶을 때 그 이름을 쓴다.
"""
import concurrent.futures as cf
import csv
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DOCS = os.path.join(HERE, "..", "web", "public", "docs")
BASE = "https://data.neins.go.kr/kei/legalPlan/file/"
FORCE = "--force" in sys.argv
ALL = "--all" in sys.argv
LEVEL = None
if "--level" in sys.argv:
    LEVEL = sys.argv[sys.argv.index("--level") + 1]
elif not ALL:
    LEVEL = "국가"

os.makedirs(DOCS, exist_ok=True)
files = json.load(open(os.path.join(HERE, "raw", "legal-plan-files.json"), encoding="utf-8"))

# 첨부의 neins idx → 계획코드 → 수립 층위. build-dataset.py 가 list.json 순서대로 코드를 매겼다.
lst = json.load(open(os.path.join(HERE, "raw", "legal-plan-list.json"), encoding="utf-8"))
idx2code = {str(d["idx"]): "EP-%03d" % (i + 1) for i, d in enumerate(lst["response"]["data"])}
sheet = os.path.join(HERE, "..", "web", "sheets", "plans.csv")
level_of_code = {r["code"]: r["level"] for r in csv.DictReader(open(sheet, encoding="utf-8"))}

atts = []
for k, v in files.items():
    lv = level_of_code.get(idx2code.get(k, ""), "")
    if LEVEL and lv != LEVEL:
        continue
    atts.extend(v)
if LEVEL:
    print("층위 '%s' 계획의 첨부만 받는다" % LEVEL)
seen, uniq = set(), []
for a in atts:
    if a["attFilePath"] in seen:
        continue
    seen.add(a["attFilePath"])
    uniq.append(a)

print("첨부 %d건 (고유 %d건) → %s" % (len(atts), len(uniq), os.path.relpath(DOCS, HERE)))


def fetch(a):
    name = "%s.%s" % (a["attFilePath"], a.get("ext") or "pdf")
    path = os.path.join(DOCS, name)
    if not FORCE and os.path.exists(path) and os.path.getsize(path) > 0:
        return name, os.path.getsize(path), "skip"
    r = subprocess.run(
        ["curl", "-sk", "--max-time", "600", "--retry", "2", BASE + a["attFilePath"], "-o", path],
        capture_output=True,
    )
    if r.returncode != 0 or not os.path.exists(path) or os.path.getsize(path) == 0:
        if os.path.exists(path):
            os.remove(path)
        return name, 0, "fail"
    return name, os.path.getsize(path), "ok"


done = tot = fails = 0
with cf.ThreadPoolExecutor(6) as ex:
    for name, size, how in ex.map(fetch, uniq):
        done += 1
        tot += size
        if how == "fail":
            fails += 1
            print("  ! 실패 %s" % name)
        if done % 20 == 0:
            print("  %d/%d  누적 %.1fGB" % (done, len(uniq), tot / 1e9))

print("완료 %d건 · %.2fGB · 실패 %d건" % (done - fails, tot / 1e9, fails))
