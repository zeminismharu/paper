/* ============================================================
   구름헤럴드 지면 — 공통 로직
     · Paper.load()    발행된 지면 데이터를 읽어 옵니다
     · Paper.draft     관리자가 편집 중인 원고 (이 브라우저에만 저장)
     · Paper.renderPage()  지면 한 장을 HTML 로 그립니다
   ============================================================ */

window.Paper = (function () {
  "use strict";

  var DRAFT_KEY = "gureumherald.paper.draft.v1";
  var DATA_URL = "data/paper.json";

  /* ---------- 글자 안전 처리 ----------
     기사·광고 문구는 사람이 적는 글입니다.
     화면에 넣을 때는 반드시 글자로만 다룹니다. (코드로 실행되지 않게) */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* 빈 줄로 나뉜 덩어리를 문단으로 */
  function paras(text) {
    return String(text || "")
      .split(/\n\s*\n|\r\n\s*\r\n/)
      .map(function (t) { return t.trim(); })
      .filter(Boolean);
  }
  /* 한 줄씩 (부제용) */
  function lines(text) {
    return String(text || "").split(/\r?\n/)
      .map(function (t) { return t.trim(); }).filter(Boolean);
  }

  function fmtDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
    if (!m) return String(iso || "");
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    var w = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
    return m[1] + "년 " + (+m[2]) + "월 " + (+m[3]) + "일 " + w + "요일";
  }
  function fmtDateShort(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
    if (!m) return String(iso || "");
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    var w = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
    return (+m[2]) + "월 " + (+m[3]) + "일 (" + w + ")";
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------- 저장소 ---------- */

  function readDraft() {
    try {
      var raw = localStorage.getItem(DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function writeDraft(data) {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
      return true;
    } catch (e) { return false; }
  }
  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
  }

  /* 발행본을 읽습니다.
     ① data/paper.json (저장소에 올린 최종본)
     ② 없으면 seed.js 에 들어 있는 처음 자료
     파일을 그냥 더블클릭해서 열면 ①은 브라우저가 막으므로 ②로 갑니다. */
  function load(opts) {
    opts = opts || {};
    if (opts.draft) {
      var d = readDraft();
      if (d) return Promise.resolve(d);
    }
    return fetch(DATA_URL, { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("no file"); return r.json(); })
      .catch(function () { return clone(window.PAPER_SEED); });
  }

  /* ---------- 지면 그리기 ---------- */

  /* 블록을 12단 격자에 순서대로 앉히면서
     "이 블록이 줄의 첫 칸인지 / 둘째 줄 이후인지" 를 미리 계산합니다.
     세로 괘선과 가로 괘선을 신문처럼 넣기 위해서입니다. */
  function place(blocks) {
    var col = 0, row = 0, out = [];
    blocks.forEach(function (b) {
      var span = Math.max(1, Math.min(12, +b.span || 12));
      if (col + span > 12) { col = 0; row++; }
      out.push({ b: b, span: span, first: col === 0, row: row, last: col + span >= 12 });
      col += span;
      if (col >= 12) { col = 0; row++; }
    });
    return out;
  }

  function articleHTML(b, sizeClass) {
    var h = "";
    if (b.kicker) h += '<div class="art__kicker">' + esc(b.kicker) + "</div>";
    /* head = 지면에 싣는 짧은 제목. 없으면 원래 제목을 씁니다. */
    h += '<h2 class="art__title">' + esc(b.head || b.title) + "</h2>";

    var sub = lines(b.subtitle);
    if (sub.length) {
      h += '<div class="art__sub">' +
        sub.map(function (t) { return "<p>" + esc(t) + "</p>"; }).join("") +
        "</div>";
    }
    if (b.image) {
      h += '<figure class="art__fig"' +
        (b.imgh ? ' style="--imgh:' + (+b.imgh) + 'px"' : "") +
        '><img src="' + esc(b.image) + '" alt=""' +
        (b.imgh ? ' style="height:' + (+b.imgh) + 'px"' : "") + ">" +
        (b.caption ? "<figcaption>" + esc(b.caption) + "</figcaption>" : "") +
        "</figure>";
    }
    var cols = Math.max(1, +b.cols || 1);
    h += '<div class="art__body clip" style="column-count:' + cols +
      ';column-gap:13px;column-rule:1px solid var(--hair)">' +
      paras(b.body).map(function (t) { return "<p>" + esc(t) + "</p>"; }).join("") +
      "</div>";
    h += '<div class="more">전문 보기 ▸</div>';
    if (b.byline) h += '<div class="art__byline">' + esc(b.byline) + "</div>";
    return h;
  }

  function adHTML(b) {
    if (b.image) {
      return '<div class="adslot filled" style="min-height:' + (+b.height || 150) +
        'px"><img src="' + esc(b.image) + '" alt="' + esc(b.label || "광고") + '"></div>';
    }
    return '<div class="adslot" style="min-height:' + (+b.height || 150) + 'px">' +
      '<div class="adslot__label">' + esc(b.label || "광고 자리") + "</div>" +
      (b.note ? '<div class="adslot__size">' + esc(b.note) + "</div>" : "") +
      "</div>";
  }

  function mastheadHTML(b, issue) {
    return '<div class="masthead__row">' +
        '<div>' + adHTML({ label: b.adLeft || "제호 왼쪽 광고", height: 74, image: b.adLeftImage, note: b.adLeftNote }) + "</div>" +
        "<div>" +
          '<h1 class="masthead__title">' + esc(b.title || "구름헤럴드") + "</h1>" +
          '<div class="masthead__tag">' + esc(b.tagline || "") + "</div>" +
        "</div>" +
        '<div>' + adHTML({ label: b.adRight || "제호 오른쪽 광고", height: 74, image: b.adRightImage, note: b.adRightNote }) + "</div>" +
      "</div>" +
      '<div class="masthead__bar">' +
        "<span>" + esc(fmtDate(issue.date)) + "</span>" +
        "<span>" + esc(issue.volume || "") + "</span>" +
        "<span>" + esc(b.publisher || "") + "</span>" +
      "</div>";
  }

  function pageheadHTML(b, issue, page) {
    return '<span class="pagehead__no">' + esc(page.label || "") + "</span>" +
      '<span class="pagehead__sec">' + esc(b.section || "") + "</span>" +
      '<span class="pagehead__date">' + esc(fmtDate(issue.date)) + " · " +
      esc(b.paper || "구름헤럴드") + "</span>";
  }

  function noteboxHTML(b) {
    return '<div class="notebox__t">' + esc(b.title || "알림") + "</div>" +
      '<div class="notebox__b">' +
      paras(b.body).map(function (t) { return "<p>" + esc(t) + "</p>"; }).join("") +
      "</div>";
  }

  /* 지면 한 장 → HTML */
  function renderPage(issue, page) {
    var items = place(page.blocks || []);
    var body = items.map(function (it, i) {
      var b = it.b;
      var cls = ["blk"];
      if (it.first) cls.push("no-left");
      if (it.row > 0) cls.push("has-top");
      if (it.last) cls.push("is-last-col");

      var inner = "", extra = "";
      if (b.type === "masthead")      { cls.push("masthead"); inner = mastheadHTML(b, issue); }
      else if (b.type === "pagehead") { cls.push("pagehead"); inner = pageheadHTML(b, issue, page); }
      else if (b.type === "ad")       { inner = adHTML(b); }
      else if (b.type === "notebox")  { cls.push("notebox"); inner = noteboxHTML(b); }
      else {
        cls.push("art", "art--" + (b.size || "minor"));
        if (b.boxed) cls.push("art--boxed");
        inner = articleHTML(b);
        extra = ' data-read="' + i + '"';
      }
      var st = "grid-column:span " + it.span;
      if (b.h) st += ";height:" + (+b.h) + "px";
      return '<div class="' + cls.join(" ") + '" style="' + st + '"' +
        extra + ">" + inner + "</div>";
    }).join("");

    return '<div class="page"><div class="grid">' + body + "</div></div>";
  }

  return {
    esc: esc, paras: paras, lines: lines, clone: clone,
    fmtDate: fmtDate, fmtDateShort: fmtDateShort,
    load: load, readDraft: readDraft, writeDraft: writeDraft, clearDraft: clearDraft,
    renderPage: renderPage, place: place,
    DRAFT_KEY: DRAFT_KEY
  };
})();
