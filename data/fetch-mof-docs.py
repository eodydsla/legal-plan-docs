"""해양수산부 자료실에서 해양환경 계획 원문을 받는다 → ../web/public/docs/ + extra-docs.csv 에 이어 쓴다.

실행: python3 data/fetch-mof-docs.py

해양환경 계획 5건은 국토환경정보센터 범위 밖이라 첨부가 없다. 해수부 정책자료 글번호를
직접 지정해 첨부를 받는다 — 검색 인터페이스가 계획명을 잘 못 잡아 글번호를 박아 두는 편이 낫다.
글이 옮겨져 404가 나면 mof.go.kr 에서 계획명으로 찾아 docSeq 만 고치면 된다.
"""
import csv
import html
import os
import re
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
DOCS = os.path.join(HERE, "..", "web", "public", "docs")
OUT = os.path.join(HERE, "extra-docs.csv")
DOC = "https://www.mof.go.kr/doc/ko/selectDoc.do?menuSeq=1067&bbsSeq=81&docSeq="
FILE = "https://www.mof.go.kr/jfile/readDownloadFile.do?fileType=MOF_ARTICLE&fileTypeSeq=%s&fileNum=%s"
MIN_SIZE = 100_000

# 계획코드 → (해수부 docSeq, 제목에 있어야 할 낱말)
TARGETS = {
    "EP-159": (36312, "해양환경종합계획"),
    "EP-160": (36321, "해양생태계"),
    "EP-161": (36318, "해양폐기물"),
    "EP-163": (36323, "갯벌"),
}

os.makedirs(DOCS, exist_ok=True)
rows = []

for code, (seq, must) in TARGETS.items():
    page = subprocess.run(
        ["curl", "-skL", "--max-time", "60", DOC + str(seq)], capture_output=True, text=True
    ).stdout
    title = re.sub(r"\s+", " ", html.unescape(
        (re.search(r"<title>(.*?)</title>", page, re.S) or ["", ""])[1])).strip()
    if must not in title:
        print("%s docSeq=%d 제목 불일치 → 건너뜀 (%s)" % (code, seq, title[:40]))
        continue

    hit = 0
    for href, label in re.findall(r'href="([^"]*readDownloadFile\.do[^"]*)"[^>]*>(.*?)</a>', page, re.S):
        href = html.unescape(href)
        num = re.search(r"fileNum=(\d+)", href)
        if not num:
            continue
        name = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", label))).strip()
        name = re.sub(r"^(pdf|hwp|zip)파일", "", name)  # 아이콘 대체텍스트가 앞에 붙는다
        if not re.search(r"\.(pdf|hwp|hwpx|zip)$", name, re.I):
            continue
        ext = name.rsplit(".", 1)[-1].lower()
        stored = "mof%d_%s.%s" % (seq, num.group(1), ext)
        path = os.path.join(DOCS, stored)
        url = FILE % (seq, num.group(1))
        if not os.path.exists(path) or os.path.getsize(path) == 0:
            subprocess.run(["curl", "-skL", "--max-time", "300", url, "-o", path])
        size = os.path.getsize(path) if os.path.exists(path) else 0
        if size < MIN_SIZE:
            if os.path.exists(path):
                os.remove(path)
            continue
        rows.append({
            "plan_code": code, "title": name, "file": stored, "ext": ext,
            "size": size, "source_url": url, "post_title": title[:80],
        })
        hit += 1
    print("%s docSeq=%d  %d건" % (code, seq, hit))

# 부처 자료실 결과에 이어 붙인다 (같은 파일은 한 번만)
fields = ["plan_code", "title", "file", "ext", "size", "source_url", "post_title"]
old = list(csv.DictReader(open(OUT, encoding="utf-8"))) if os.path.exists(OUT) else []
seen = {r["file"] for r in old}
merged = old + [r for r in rows if r["file"] not in seen]
with open(OUT, "w", encoding="utf-8", newline="") as f:
    w = csv.DictWriter(f, fieldnames=fields)
    w.writeheader()
    w.writerows(merged)

print("추가 %d건 · 누적 %d건 → %s" % (len(merged) - len(old), len(merged), os.path.relpath(OUT, HERE)))
