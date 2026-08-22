"""기본계획·종합계획 차수별 목록 마크다운 생성 → ../환경분야_법정계획_기본계획_종합계획.md

실행: python3 data/build-editions-doc.py

차수 이력은 verified.py 에 있다. 묶음 표기(제1~3차)는 쓰지 않는다 — 차수는 반드시 한 행씩이다.
"""
import collections
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import verified as V  # noqa: E402

H, MISSING, MARINE = V.H, V.MISSING, V.MARINE
NAME_FIX, NAME_RAW, sel, files = V.NAME_FIX, V.NAME_RAW, V.sel, V.files

def esc(s): return (s or '').replace('|', '\\|').strip()
def artof(url):
    if not url: return ''
    seg = url.rstrip('/').split('/')[-1]
    return seg if re.match(r'^제.+조', seg) else ''
def mdlink(t, url):
    if not url: return esc(t)
    u = url.replace('%','%25').replace(' ','%20').replace('(','%28').replace(')','%29')
    return '[%s](%s)' % (esc(t), u)

plans = []
for i, d in enumerate(sel, 1):
    cyc, buche, hist, bigo = H[i]
    plans.append(dict(no=i, plan=NAME_FIX.get(i, d['plan'].strip()), plan_url=d.get('plan_url',''),
        stt=d['stt_nm'].strip(), stt_url=d.get('stt_url',''), art=artof(d.get('plan_url')),
        rmrk=d['rmrk'], cyc=cyc if cyc is not None else (d.get('plan_cycle') or '미규정'),
        buche=buche, hist=hist, bigo=bigo, won='O' if files.get(d['idx']) else ''))

allrows = [(p, h) for p in plans for h in p['hist']]
c_sin = collections.Counter(h[2] for _, h in allrows)
c_rmrk = collections.Counter(p['rmrk'] for p in plans)
n_cha = sum(1 for _, h in allrows if h[0] and '~' not in h[0])

o=[]; w=o.append
w('# 환경분야 법정계획 — 기본계획·종합계획 차수별 목록 (58개 계획 / %d개 차수)' % len(allrows))
w('')
w('출처(1차): 국토환경정보센터 자료제공서비스 [환경관련 법정계획](https://data.neins.go.kr/bbs/legalPlan) (한국환경연구원) 중 계획부문이 **기본계획·종합계획**인 58건')
w('검증(2차): 기후에너지환경부 정책자료·보도자료, 산림청·해양수산부·국가물관리위원회·국가기록원 공표자료, 국가법령정보센터 조문 · 검증일 2026-08-22')
w('')
w('**계획별 최신차수만이 아니라 제1차부터 현행 차수까지 전부 적었다.** 한 계획이 여러 행으로 나뉘며, 같은 `연번`은 같은 계획이다.')
w('')
w('- 58개 계획 — 기본계획 %d · 종합계획 %d' % (c_rmrk['기본계획'], c_rmrk['종합계획']))
w('- 차수 행 %d개 — 신뢰도: %s' % (len(allrows), ' · '.join('%s %d' % kv for kv in c_sin.most_common())))
w('- 출처 사이트에 **누락된 환경분야 기본·종합계획 %d건**을 추가로 찾아 별도 표로 정리했다' % len(MISSING))
w('')
w('**신뢰도 판정 기준** (차수 단위로 부여)')
w('')
w('| 값 | 의미 |')
w('|---|---|')
w('| 확인 | 소관부처 공표자료(정책자료·보도자료·고시)에서 해당 차수의 계획기간을 직접 확인 |')
w('| 참고 | 2차 출처(언론·연구보고서·국가기록원 설명)로만 확인 |')
w('| 미확인 | 차수 존재는 확인되나 계획기간을 특정하지 못함 |')
w('| 해당없음 | 지자체·시설·하천 등 단위별로 개별 수립되어 국가 단위 차수 개념이 없음 |')
w('')
w('**차수는 반드시 한 행씩 적는다.** 계획기간을 특정하지 못한 과거 차수도 묶지 않고 각각 한 행으로 두고, 신뢰도를 `미확인`으로 표시했다.')
w('`원문` = 국토환경정보센터에 보고서 첨부가 있는 계획(계획 단위 표기). 소관부처는 2026년 정부조직 개편에 따라 **기후에너지환경부**(구 환경부)로 적었다.')
w('')
w('원 데이터의 계획명이 모호하거나(연번 19·54·57) 오타인 경우(연번 30) 보정했다: ' +
  ' · '.join('연번 %d `%s` → **%s**' % (k, NAME_RAW[k], NAME_FIX[k]) for k in sorted(NAME_FIX)))
w('')
w('---')
w('')
w('## 전체 목록 (차수별)')
w('')
w('| 연번 | 계획명 | 근거법률 | 근거조문 | 차수 | 계획기간 | 갱신주기 | 소관부처 | 신뢰도 | 원문 |')
w('|---:|---|---|---|---|---|---|---|---|:-:|')
for p in plans:
    for k, (cha, per, sin) in enumerate(p['hist']):
        w('| %d | %s | %s | %s | %s | %s | %s | %s | %s | %s |' % (
            p['no'],
            mdlink(p['plan'], p['plan_url']) if k == 0 else esc(p['plan']),
            mdlink('「%s」'%p['stt'], p['stt_url']) if k == 0 else esc('「%s」'%p['stt']),
            esc(p['art']), esc(cha), esc(per), esc(p['cyc']), esc(p['buche']), sin,
            p['won'] if k == 0 else ''))
w('')
w('### 비고')
w('')
w('| 연번 | 계획명 | 비고 |')
w('|---:|---|---|')
for p in plans:
    if p['bigo']:
        w('| %d | %s | %s |' % (p['no'], esc(p['plan']), esc(p['bigo'])))
w('')
w('---')
w('')
w('## 출처 사이트 누락분 — 추가 발굴 (%d건, 차수별)' % len(MISSING))
w('')
w('국토환경정보센터 목록에 없으나 현행 법률상 수립 의무가 있는 환경분야 기본·종합계획이다.')
w('')
w('| 연번 | 계획명 | 근거법률 | 근거조문 | 차수 | 계획기간 | 갱신주기 | 소관부처 | 신뢰도 |')
w('|---:|---|---|---|---|---|---|---|---|')
for i, (p, l, a, cy, b, hist, note) in enumerate(MISSING, 1):
    for k, (cha, per, sin) in enumerate(hist):
        w('| %d | %s | %s | %s | %s | %s | %s | %s | %s |' % (
            i, esc(p), esc(l) if k == 0 else '', esc(a) if k == 0 else '',
            esc(cha), esc(per), esc(cy) if k == 0 else '', esc(b) if k == 0 else '', sin))
w('')
w('| 연번 | 계획명 | 비고 |')
w('|---:|---|---|')
for i, (p, l, a, cy, b, hist, note) in enumerate(MISSING, 1):
    if note: w('| %d | %s | %s |' % (i, esc(p), esc(note)))
w('')
w('---')
w('')
w('## 참고 — 해양수산부 소관 해양환경 기본·종합계획 (%d건)' % len(MARINE))
w('')
w('출처 사이트는 육상 환경이 범위라 해양환경 계획을 담고 있지 않다. 과거 차수까지는 검증하지 않았고 현행 차수만 적었다.')
w('')
w('| 연번 | 계획명 | 근거법률 | 근거조문 | 차수 | 계획기간 | 갱신주기 | 소관부처 | 신뢰도 |')
w('|---:|---|---|---|---|---|---|---|---|')
for i, (p, l, a, cy, b, cha, per) in enumerate(MARINE, 1):
    w('| %d | %s | %s | %s | %s | %s | %s | %s | 참고 |' % (i, esc(p), esc(l), esc(a), esc(cha), esc(per), esc(cy), esc(b)))
w('')
w('---')
w('')
w('## 경계 항목 (기본계획·종합계획으로 분류하지 않은 것)')
w('')
w('출처 사이트가 「기타」·「대책」으로 분류하지만 성격상 최상위 계획에 준하는 것들이다. 요청 범위에서는 제외했다.')
w('')
w('| 계획명 | 근거법률 | 근거조문 | 차수 | 계획기간 |')
w('|---|---|---|---|---|')
for x in [
 ('국가 기후위기 적응대책','「기후위기 대응을 위한 탄소중립·녹색성장 기본법」','제38조','제1차','2011~2015'),
 ('국가 기후위기 적응대책','「기후위기 대응을 위한 탄소중립·녹색성장 기본법」','제38조','제2차','2016~2020'),
 ('국가 기후위기 적응대책','「기후위기 대응을 위한 탄소중립·녹색성장 기본법」','제38조','제3차','2021~2025 (+ 2023.6 적응 강화대책)'),
 ('국가 기후위기 적응대책','「기후위기 대응을 위한 탄소중립·녹색성장 기본법」','제38조','제4차','2026~2030 (「국가 기후위기 적극 대응 대책」)'),
 ('국가비전 및 국가전략 / 국가탄소중립녹색성장전략','「기후위기 대응을 위한 탄소중립·녹색성장 기본법」','제7조','제1차','2023~2042'),
 ('중장기 국가 온실가스 감축목표(NDC)','「기후위기 대응을 위한 탄소중립·녹색성장 기본법」','제8조','-','2035 NDC 확정(2025.11)'),
 ('자연환경보전기본방침','「자연환경보전법」','제6조','-','-'),
 ('오염총량관리기본방침','「물환경보전법」','제4조의2','-','-'),
 ('장거리이동대기오염물질피해방지 종합대책','「대기환경보전법」','제13조','제1차','2018~2022'),
]:
    w('| %s | %s | %s | %s | %s |' % tuple(esc(v) for v in x))
w('')
w('---')
w('')
w('## 검증에 쓴 출처')
w('')
for s in [
 '[기후에너지환경부 정책자료](https://www.mcee.go.kr/home/web/policy_data/list.do?menuId=10259) — 계획 공표본 제목(차수·기간) 전수 대조',
 '[기후에너지환경부 보도·설명자료](https://www.me.go.kr/home/web/board/list.do?menuId=10525)',
 '[대한민국 정책브리핑 정책DB](https://www.korea.kr/archive/) — 과거 차수 원문',
 '[국가기록원 국정분야 주제별 검색](https://www.archives.go.kr/) — 1990~2000년대 차수 연혁',
 '[국가물관리위원회](https://www.water.go.kr/) — 국가물관리기본계획·유역물관리종합계획',
 '[산림청](https://www.forest.go.kr/) — 백두대간보호 기본계획',
 '[해양수산부](https://www.mof.go.kr/) — 남극연구활동진흥기본계획',
 '[국가법령정보센터](https://www.law.go.kr/) — 근거조문·수립주기',
]:
    w('- ' + s)
w('')

open(os.path.join(HERE, '..', '환경분야_법정계획_기본계획_종합계획.md'), 'w', encoding='utf-8').write('\n'.join(o))
print('plans',len(plans),'rows',len(allrows),'lines',len(o))
