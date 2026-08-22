"""기후에너지환경부 정책자료에서 원문을 찾아 받는다 → ../web/public/docs/
   + 붙일 계획·차수를 적은 ../data/extra-docs.csv 생성.

국토환경정보센터 첨부만으로는 원문이 없는 계획이 많다. 부처 자료실을 계획명으로 검색해
제목이 맞는 글의 첨부를 받아 채운다.

실행: python3 data/fetch-ministry-docs.py            (TARGETS 전부)
      python3 data/fetch-ministry-docs.py EP-141     (일부만)

검색 → 글 열기 → 첨부 링크 추출 → 내려받기 순이고, 제목에 계획명 키워드가 다 들어간
글만 받는다. 엉뚱한 파일이 붙는 것보다 비어 있는 편이 낫다.
"""
import csv
import html
import os
import re
import subprocess
import sys
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
DOCS = os.path.join(HERE, "..", "web", "public", "docs")
OUT = os.path.join(HERE, "extra-docs.csv")
CACHE = os.path.join(HERE, ".mecache")
LIST = "https://www.mcee.go.kr/home/web/policy_data/list.do?menuId=10259&searchKey=title&searchValue="
READ = "https://www.mcee.go.kr/home/web/policy_data/read.do?menuId=10259&seq="
FILE = "https://www.mcee.go.kr/home/file/readDownloadFile.do?"

# 계획코드 → (검색어, 제목에 반드시 있어야 할 낱말들)
# 낱말은 제목 오탐을 막는 장치다. '시행계획'처럼 흔한 말만 쓰면 엉뚱한 글이 걸린다.
TARGETS = {
    "EP-141": ("잔류성오염물질", ["잔류성오염물질", "기본계획"]),
    "EP-151": ("국가생물다양성전략", ["국가생물다양성전략"]),
    "EP-152": ("빛공해", ["빛공해", "종합계획"]),
    "EP-153": ("악취방지종합시책", ["악취방지종합시책"]),
    "EP-154": ("육성계획", ["환경기술", "육성계획"]),
    "EP-155": ("생물자원관", ["생물자원관", "기본계획"]),
    "EP-156": ("폐기물관리 종합계획", ["폐기물관리", "종합계획"]),
    "EP-157": ("건설폐기물", ["건설폐기물", "기본계획"]),
    "EP-115": ("공공폐자원", ["공공폐자원", "기본계획"]),
    "EP-114": ("생태경관보전지역", ["관리기본계획"]),
    "EP-113": ("자연환경보전기본방침", ["자연환경보전기본방침"]),
    "EP-133": ("습지보전기초계획", ["습지보전기초계획"]),
    "EP-123": ("오염총량관리기본방침", ["오염총량", "기본방침"]),
    "EP-136": ("멸종위기 야생생물", ["멸종위기", "보전대책"]),
    "EP-034": ("녹색융합클러스터", ["녹색융합클러스터", "기본계획"]),
    "EP-138": ("순환경제", ["순환경제", "목표"]),
}

# 안내문·현황자료가 아니라 계획 원문을 받으려는 것이다. 이보다 작으면 버린다.
MIN_SIZE = 100_000

os.makedirs(DOCS, exist_ok=True)
os.makedirs(CACHE, exist_ok=True)
only = [a for a in sys.argv[1:] if a.startswith("EP-")]


def get(url, key):
    path = os.path.join(CACHE, re.sub(r"[^\w]", "_", key)[:120] + ".html")
    if not os.path.exists(path):
        subprocess.run(["curl", "-skL", "--max-time", "60", url, "-o", path], check=True)
    return open(path, encoding="utf-8", errors="replace").read()


def strip(t):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", t))).strip()


rows = []
for code, (kw, must) in TARGETS.items():
    if only and code not in only:
        continue
    page = get(LIST + urllib.parse.quote(kw), "list_" + kw)
    posts = re.findall(r'href="([^"]*policy_data/read\.do[^"]*)"[^>]*>(.*?)</a>', page, re.S)

    hit = 0
    for href, title_html in posts:
        title = strip(title_html)
        if not title or not all(w in title for w in must):
            continue
        seq = re.search(r"seq=(\d+)", html.unescape(href))
        if not seq:
            continue
        post = get(READ + seq.group(1), f"read_{seq.group(1)}")
        files = re.findall(
            r'href="([^"]*readDownloadFile\.do[^"]*)"[^>]*>(.*?)</a>', post, re.S
        )
        for fhref, fname_html in files:
            q = html.unescape(fhref).split("?", 1)
            if len(q) < 2:
                continue
            fname = strip(fname_html)
            if not re.search(r"\.(pdf|hwp|hwpx|zip|docx?)$", fname, re.I):
                continue
            fid = re.search(r"fileId=(\d+)", q[1])
            fseq = re.search(r"fileSeq=(\d+)", q[1])
            if not fid:
                continue
            ext = fname.rsplit(".", 1)[-1].lower()
            stored = f"me{fid.group(1)}_{fseq.group(1) if fseq else 1}.{ext}"
            path = os.path.join(DOCS, stored)
            url = FILE + f"fileId={fid.group(1)}&fileSeq={fseq.group(1) if fseq else 1}"
            if not os.path.exists(path) or os.path.getsize(path) == 0:
                subprocess.run(["curl", "-skL", "--max-time", "300", url, "-o", path])
            size = os.path.getsize(path) if os.path.exists(path) else 0
            if size < MIN_SIZE:  # 오류 페이지·안내문·현황표가 내려온 경우
                if os.path.exists(path):
                    os.remove(path)
                continue
            # 파일명이 '2007.hwp' 처럼 의미가 없으면 게시글 제목을 쓴다
            label = fname if re.search(r"[가-힣]{3,}", fname.rsplit(".", 1)[0]) else f"{title}.{ext}"
            rows.append({
                "plan_code": code, "title": label, "file": stored, "ext": ext,
                "size": size, "source_url": url, "post_title": title,
            })
            hit += 1
        if hit:
            break  # 계획당 첫 유효 게시글만 (최신순이라 맨 앞이 최신 차수다)
    print("%s %-22s %d건" % (code, kw[:20], hit))

with open(OUT, "w", encoding="utf-8", newline="") as f:
    w = csv.DictWriter(f, fieldnames=["plan_code", "title", "file", "ext", "size", "source_url", "post_title"])
    w.writeheader()
    w.writerows(rows)

print("총 %d건 · %.2fGB → %s" % (
    len(rows), sum(r["size"] for r in rows) / 1e9, os.path.relpath(OUT, HERE)))
