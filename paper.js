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

  /* 주소 안전 검사.
     esc() 는 따옴표를 &#39; 로 바꾸지만 브라우저가 속성값을 풀 때 되돌아옵니다.
     그래서 CSS url() 안에 들어가는 주소는 글자 escape 만으로 부족합니다.
     http(s) 나 같은 폴더 안의 파일만 받고, 나머지(javascript: 등)는 버립니다. */
  function safeUrl(u) {
    u = String(u == null ? "" : u).trim();
    if (!u) return "";
    return /^(https?:\/\/|\/|\.\/|[\w.-]+\/)[^\s'"()<>\\]*$/i.test(u) ? u : "";
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

  /* 블록을 12단 격자에 순서대로 앉히면서 '줄(row)' 로 묶습니다.
     지면은 줄을 위에서 아래로 쌓은 것이고, 줄 높이는 글 분량만큼 자랍니다.
     fill 이 붙은 칸이 있는 줄은 남는 높이를 전부 받습니다. */
  function place(blocks) {
    var rows = [], cur = [], col = 0;
    function close() {
      if (!cur.length) return;
      cur[cur.length - 1].last = true;
      rows.push({ items: cur, fill: cur.some(function (it) { return !!it.b.fill; }) });
      cur = []; col = 0;
    }
    blocks.forEach(function (b) {
      var span = Math.max(1, Math.min(12, +b.span || 12));
      if (col + span > 12) close();
      cur.push({ b: b, span: span, first: col === 0, last: false });
      col += span;
      if (col >= 12) close();
    });
    close();
    return rows;
  }

  function articleHTML(b) {
    var h = "";
    /* 머리 — 눈썹·제목, 그리고 칼럼이면 필자 사진을 제목 옆에 놓습니다.
       (.art 가 flex 라 float 은 먹지 않습니다. 가로로 나란히 놓아야 합니다.) */
    var head = "";
    if (b.kicker) head += '<div class="art__kicker">' + esc(b.kicker) + "</div>";
    head += '<h2 class="art__title">' + esc(b.head || b.title) + "</h2>";

    if (b.portrait) {
      var pu = safeUrl(b.portrait.image);
      h += '<div class="art__head">' +
        '<div class="art__head-main">' + head + "</div>" +
        '<div class="art__portrait">' +
          (pu ? '<img src="' + esc(pu) + '" alt="">'
              : '<div class="art__portrait-empty">필자<br>사진</div>') +
          '<div class="art__portrait-name">' + esc(b.portrait.name || "") + "</div>" +
        "</div></div>";
    } else {
      h += head;
    }

    /* 부제 — 줄이 둘 이상일 때만 신문처럼 가운뎃점을 답니다.
       한 줄짜리는 그냥 한 문장이므로 점을 붙이면 어색합니다. */
    var sub = lines(b.subtitle);
    if (sub.length) {
      h += '<div class="art__sub' + (sub.length > 1 ? " art__sub--list" : "") + '">' +
        sub.map(function (t) { return "<p>" + esc(t) + "</p>"; }).join("") +
        "</div>";
    }
    if (b.image) {
      h += '<figure class="art__fig"><img src="' + esc(b.image) + '" alt=""' +
        (b.imgh ? ' style="height:' + (+b.imgh) + 'px"' : "") + ">" +
        (b.caption ? "<figcaption>" + esc(b.caption) + "</figcaption>" : "") +
        "</figure>";
    }
    /* 본문 — 칸에 맞춰 줄인 글이라 잘리지 않습니다.
       verse 는 행을 나눠 쓴 글(시·수필). 들여쓰기 없이 줄을 그대로 살립니다.

       ⚠️ 단(段) 사이에 세로줄을 긋지 않습니다.
       신문에서 세로 괘선은 '서로 다른 기사'를 가르는 선입니다. 한 기사의 본문은
       첫 단 아래에서 다음 단 위로 이어지는 하나의 글이므로, 그 사이에 선을 그으면
       한 기사가 여러 토막으로 갈라져 보입니다. 기사끼리의 경계는 .blk 의
       왼쪽 테두리가 이미 맡고 있습니다. */
    var cols = Math.max(1, +b.cols || 1);
    h += '<div class="art__body' + (b.verse ? " art__body--verse" : "") +
      '" style="column-count:' + cols +
      ';column-gap:15px">' +
      paras(b.body).map(function (t) { return "<p>" + esc(t) + "</p>"; }).join("") +
      "</div>";

    h += '<div class="art__foot">';
    if (b.byline) h += "<span>" + esc(b.byline) + "</span>";
    if (b.link) h += '<span class="art__more">구름헤럴드에서 전문 ▸</span>';
    h += "</div>";
    return h;
  }

  function adHTML(b) {
    /* 높이를 따로 정하지 않은 광고 칸은 억지로 키우지 않습니다.
       남는 자리를 받는 칸(fill)에 최소 높이를 박아 두면 지면이 넘칩니다. */
    var mh = b.height ? "min-height:" + (+b.height) + "px;" : "";

    /* ① 사진 광고 — 만들어 둔 이미지를 그대로 붙입니다 */
    if (b.image) {
      return '<div class="adslot filled" style="' + mh + '"><img src="' + esc(safeUrl(b.image)) +
        '" alt="' + esc(b.label || "광고") + '"></div>';
    }

    /* ② 글자 광고 — 신문 하단 통광고 모양을 HTML 로 짭니다.
       한글이 또렷하게 나오고 어느 크기에서도 깨지지 않습니다.
       (AI 로 만든 그림에 한글을 넣으면 글자가 뭉개집니다) */
    if (b.adStyle === "text") {
      var bgi = safeUrl(b.bgImage);
      var fg = b.fg || (bgi ? "#16130f" : "#ffffff");
      var ac = b.accent || (bgi ? "#9b1c1c" : "#ffd400");
      var pts = lines(b.points);
      /* 배경 사진이 있으면 그 위에 옅은 막을 한 겹 깔아 글자가 묻히지 않게 합니다 */
      var box = bgi
        ? "background-image:linear-gradient(" + (b.scrim || "rgba(250,247,240,.26)") + "," +
          (b.scrim || "rgba(250,247,240,.26)") + "),url('" + bgi +
          "');background-size:cover;background-position:center 30%;"
        : "background:" + esc(b.bg || "#0b3f8f") + ";";
      return '<div class="adbox" style="' + box + "color:" + esc(fg) + ";" + mh + '">' +
        (b.eyebrow ? '<div class="adbox__eyebrow" style="background:' + esc(ac) +
          '">' + esc(b.eyebrow) + "</div>" : "") +
        '<div class="adbox__title">' + esc(b.title || "") + "</div>" +
        (pts.length ? '<div class="adbox__points">' + pts.map(function (t) {
          return '<span style="border-color:' + esc(ac) + '">' + esc(t) + "</span>";
        }).join("") + "</div>" : "") +
        (b.phone ? '<div class="adbox__phone" style="color:' + esc(ac) + '">' +
          esc(b.phone) + "</div>" : "") +
        (b.fine ? '<div class="adbox__fine">' + esc(b.fine) + "</div>" : "") +
        "</div>";
    }

    /* ③ 아무것도 안 넣은 칸 — 여백으로 비워 둡니다 */
    return '<div class="adslot" style="' + mh + '">' +
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
        "<span>" + esc(b.founded || "") + "</span>" +
        "<span>" + esc(b.publisher || "") + "</span>" +
      "</div>" +
      (b.strip ? '<div class="masthead__strip">' + esc(b.strip) + "</div>" : "");
  }

  function pageheadHTML(b, issue, page) {
    return '<span class="pagehead__no">' + esc(page.label || "") + "</span>" +
      '<span class="pagehead__sec">' + esc(b.section || "") + "</span>" +
      '<span class="pagehead__date">' + esc(fmtDate(issue.date)) + " · " +
      esc(b.paper || "구름헤럴드") + "</span>";
  }

  /* 표 — 신문 통계표. 첫 칸은 왼쪽, 나머지 숫자 칸은 오른쪽으로 맞춥니다. */
  function tableHTML(b) {
    var head = b.head || [], rows = b.rows || [];
    var cell = function (v, i, tag) {
      return "<" + tag + (i === 0 ? "" : ' class="num"') + ">" +
        esc(v) + "</" + tag + ">";
    };
    return (b.title ? '<div class="tbl__t">' + esc(b.title) + "</div>" : "") +
      (b.note ? '<div class="tbl__note">' + esc(b.note) + "</div>" : "") +
      "<table><thead><tr>" +
        head.map(function (v, i) { return cell(v, i, "th"); }).join("") +
      "</tr></thead><tbody>" +
        rows.map(function (r) {
          return "<tr>" + r.map(function (v, i) { return cell(v, i, "td"); }).join("") + "</tr>";
        }).join("") +
      "</tbody></table>" +
      (b.source ? '<div class="tbl__src">' + esc(b.source) + "</div>" : "");
  }

  /* 그래프 — 가로 막대. 한글 항목 이름이 길어도 깨지지 않게 SVG 대신 글자로 그립니다.
     기준선은 막대 칸 안쪽에 그립니다. 바깥에 두면 칸 너비 계산이 어긋나 선이 사라집니다. */
  function chartHTML(b) {
    var rows = b.rows || [];
    var vals = rows.map(function (r) { return +r[1] || 0; });
    var max = +b.max || Math.max.apply(null, vals.concat([1]));
    var base = b.baseline == null ? null : +b.baseline;
    var bstyle = base != null ? ";--b:" + (base / max * 100) + "%" : "";
    return (b.title ? '<div class="tbl__t">' + esc(b.title) + "</div>" : "") +
      (b.note ? '<div class="tbl__note">' + esc(b.note) + "</div>" : "") +
      '<div class="chart' + (base != null ? " chart--base" : "") + '">' +
        rows.map(function (r, i) {
          var v = +r[1] || 0;
          var lo = base != null && v < base;
          return '<div class="chart__row">' +
            '<span class="chart__lab">' + esc(r[0]) + "</span>" +
            '<span class="chart__track" style="width:100%' + bstyle + '">' +
              '<i class="' + (lo ? "lo" : "") + '" style="width:' +
                Math.max(0, Math.min(100, v / max * 100)) + '%"></i>' +
              (i === 0 && base != null
                ? '<em class="chart__baselab">' + esc(b.baselineLabel || base) + "</em>" : "") +
            "</span>" +
            '<span class="chart__val">' + esc(r[2] != null ? r[2] : v) + "</span>" +
            "</div>";
        }).join("") +
      "</div>" +
      (b.source ? '<div class="tbl__src">' + esc(b.source) + "</div>" : "");
  }

  /* 인용 — 발언을 크게 뽑아 싣습니다. */
  function quoteHTML(b) {
    return '<div class="quote__mark">\u201C</div>' +
      '<div class="quote__body">' +
        paras(b.text).map(function (t) { return "<p>" + esc(t) + "</p>"; }).join("") +
      "</div>" +
      (b.who ? '<div class="quote__who">' + esc(b.who) + "</div>" : "");
  }

  function noteboxHTML(b) {
    return '<div class="notebox__t">' + esc(b.title || "알림") + "</div>" +
      '<div class="notebox__b">' +
      paras(b.body).map(function (t) { return "<p>" + esc(t) + "</p>"; }).join("") +
      "</div>";
  }

  /* 지면 한 장 → HTML */
  function renderPage(issue, page) {
    var rows = place(page.blocks || []);
    var idx = 0;
    var body = rows.map(function (row, ri) {
      var inner = row.items.map(function (it) {
        var b = it.b, i = idx++;
        var cls = ["blk"];
        if (it.first) cls.push("no-left");
        if (it.last) cls.push("is-last-col");

        var html = "", extra = "";
        if (b.type === "masthead")      { cls.push("masthead"); html = mastheadHTML(b, issue); }
        else if (b.type === "pagehead") { cls.push("pagehead"); html = pageheadHTML(b, issue, page); }
        else if (b.type === "ad")       { html = adHTML(b); }
        else if (b.type === "notebox")  { cls.push("notebox"); html = noteboxHTML(b); }
        else if (b.type === "table")    { cls.push("tbl");     html = tableHTML(b); }
        else if (b.type === "chart")    { cls.push("tbl");     html = chartHTML(b); }
        else if (b.type === "quote")    { cls.push("quote");   html = quoteHTML(b); }
        else {
          cls.push("art", "art--" + (b.size || "minor"));
          if (b.boxed) cls.push("art--boxed");
          html = articleHTML(b);
          extra = ' data-read="' + i + '"';
        }
        var st = "grid-column:span " + it.span;
        if (b.h) st += ";min-height:" + (+b.h) + "px";
        return '<div class="' + cls.join(" ") + '" style="' + st + '"' + extra + ">" + html + "</div>";
      }).join("");
      return '<div class="row' + (row.fill ? " row--fill" : "") +
        (ri > 0 ? " row--rule" : "") + '">' + inner + "</div>";
    }).join("");

    return '<div class="page"><div class="grid">' + body + "</div></div>";
  }

  return {
    esc: esc, safeUrl: safeUrl, paras: paras, lines: lines, clone: clone,
    fmtDate: fmtDate, fmtDateShort: fmtDateShort,
    load: load, readDraft: readDraft, writeDraft: writeDraft, clearDraft: clearDraft,
    renderPage: renderPage, place: place,
    DRAFT_KEY: DRAFT_KEY
  };
})();
