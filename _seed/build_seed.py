# -*- coding: utf-8 -*-
"""
_seed/articles.json (구름헤럴드에서 받아온 기사) 를 읽어
seed.js (처음 보여줄 지면 자료) 를 만듭니다.

지면 구성을 바꾸고 싶으면 아래 LAYOUT 만 고치고 다시 실행하세요.
    python3 _seed/build_seed.py
"""
import json, os, io

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

arts = {a["id"]: a for a in json.load(open(os.path.join(HERE, "articles.json"), encoding="utf-8"))}


def art(aid, span, size, cols, h, head=None, image=True, boxed=False, imgh=None):
    """head = 지면에 싣는 짧은 제목.
    구름헤럴드 원문 제목은 온라인용이라 길어서, 지면에는 줄인 제목을 답니다.
    (원문 제목은 그대로 남아 있고 '전문 보기'에서 보입니다. 편집 화면에서 고칠 수 있습니다.)"""
    a = arts[aid]
    b = {
        "type": "article",
        "span": span, "size": size, "cols": cols, "h": h,
        "kicker": a["category"],
        "head": head or a["title"],
        "title": a["title"],
        "subtitle": a["excerpt"] or "",
        "body": a["content"],
        "byline": (a["author"] or "") + " 기자",
    }
    if boxed:
        b["boxed"] = True
    if image and a.get("imageUrl"):
        b["image"] = a["imageUrl"]
        b["caption"] = "사진 = 구름헤럴드"
        if imgh:
            b["imgh"] = imgh
    return b


def ad(span, h, label, note):
    return {"type": "ad", "span": span, "h": h, "label": label, "note": note}


A1 = [
    {
        "type": "masthead", "span": 12, "h": 152,
        "title": "구름헤럴드",
        "tagline": "구름 위에서 본 세상, 맑은 시각으로 전하는 뉴스",
        "publisher": "gureumherald.com",
        "adLeft": "제호 왼쪽 광고 자리",  "adLeftNote": "약 300 × 74",
        "adRight": "제호 오른쪽 광고 자리", "adRightNote": "약 300 × 74",
    },
    art(42, 8, "lead",  3, 560, imgh=210,
        head="파주시 3차 추경 2조 6,085억 원"),
    art(41, 4, "minor", 1, 560, image=False,
        head="‘GTX-A’ 타고 커지는 파주 운정"),
    art(40, 8, "major", 3, 380, image=False,
        head="장동혁의 배수진 ‘중진 용퇴론’"),
    art(39, 4, "minor", 1, 380, image=False, boxed=True,
        head="비전공자가 이틀 만에 홈페이지를 만들다"),
    ad(12, 248, "1면 하단 통광고 자리", "약 940 × 250 · 여백으로 비워 둔 칸입니다"),
]

A2 = [
    {"type": "pagehead", "span": 12, "h": 46, "section": "정치 · 오피니언", "paper": "구름헤럴드"},
    art(38, 12, "major", 4, 520, imgh=190,
        head="오세훈 1심 벌금 1000만원… 시장직 상실 위기"),
    art(37, 4, "minor", 1, 460, image=False, boxed=True),
    art(36, 4, "minor", 1, 460, image=False, boxed=True),
    art(35, 4, "minor", 1, 460, image=False,
        head="유시민의 신(新)재건축론, 여권 분열 부르나"),
    ad(12, 314, "2면 하단 통광고 자리", "약 940 × 310 · 여백으로 비워 둔 칸입니다"),
]

data = {
    "meta": {
        "name": "구름헤럴드",
        "tagline": "구름 위에서 본 세상, 맑은 시각으로 전하는 뉴스",
        "site": "https://gureumherald.com/",
    },
    "issues": [
        {
            "date": "2026-09-05",
            "volume": "제 1 호",
            "pages": [
                {"label": "A1", "blocks": A1},
                {"label": "A2", "blocks": A2},
            ],
        }
    ],
}

out = os.path.join(ROOT, "seed.js")
with io.open(out, "w", encoding="utf-8") as f:
    f.write("/* 이 파일은 _seed/build_seed.py 가 만듭니다. 직접 고치지 마세요. */\n")
    f.write("window.PAPER_SEED = ")
    json.dump(data, f, ensure_ascii=False, indent=1)
    f.write(";\n")

print("wrote", out, os.path.getsize(out), "bytes")
