/* logic.js — lõi thuần của app biên bản họp.
   Không đụng DOM/trình duyệt → test được bằng Node, đồng thời nhúng vào HTML. */
(function (root) {
  "use strict";

  function fmtTime(sec) {
    sec = Math.floor(Number(sec) || 0);
    if (sec < 0) sec = 0;
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return (h > 0 ? p(h) + ":" : "") + p(m) + ":" + p(s);
  }

  function dmy(iso) {
    if (!iso || typeof iso !== "string") return "";
    var p = iso.split("-");
    if (p.length !== 3) return iso;
    return "ngày " + p[2] + " tháng " + p[1] + " năm " + p[0];
  }

  function esc(s) {
    if (s === null || s === undefined) return "";
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function appendText(cur, chunk) {
    var c = (chunk || "").trim();
    if (!c) return cur || "";
    if (!cur) return c;
    return cur.replace(/\s+$/, "") + " " + c;
  }

  // results: mảng {isFinal, transcript}; idx = resultIndex của sự kiện
  function extractSpeech(results, idx) {
    var finalText = "", interim = "";
    for (var i = idx || 0; i < results.length; i++) {
      var t = results[i].transcript;
      if (results[i].isFinal) finalText += t; else interim += t;
    }
    return { finalText: finalText, interim: interim };
  }

  function bodyLines(entries) {
    return (entries || []).filter(function (e) {
      return (e.text || "").trim() || (e.speaker || "").trim() || (e.who || "").trim();
    });
  }

  // Tách 3 nhóm: ý kiến thường / kết luận / phân công (bỏ mục rỗng)
  function sections(entries) {
    var s = { notes: [], conclusions: [], tasks: [] };
    (entries || []).forEach(function (e) {
      var txt = (e.text || "").trim();
      if (e.kind === "ketluan") { if (txt) s.conclusions.push(e); }
      else if (e.kind === "phancong") { if (txt || (e.who || "").trim()) s.tasks.push(e); }
      else if (txt || (e.speaker || "").trim()) s.notes.push(e);
    });
    return s;
  }

  // Tìm đoạn ghi âm chứa thời điểm t (giây, theo đồng hồ cuộc họp).
  // segs: [{id, base, dur}] — base = giây bắt đầu đoạn, dur = độ dài đã ghi.
  // Trả null nếu t không nằm trong đoạn nào (khoảng tắt ghi âm) → không phát bừa đoạn khác.
  // Dung sai: trước đoạn ≤3s (chờ cấp micro), sau cuối ≤5s (chunk chưa kịp tới).
  function findSegment(segs, t) {
    if (!segs || !segs.length || t === null || t === undefined || isNaN(t)) return null;
    var sorted = segs.slice().sort(function (a, b) { return a.base - b.base; });
    for (var i = sorted.length - 1; i >= 0; i--) {
      var s = sorted[i], d = s.dur || 0;
      if (t >= s.base - 3 && t <= s.base + d + 5) {
        return { seg: s, offset: Math.max(0, Math.min(t - s.base, d)) };
      }
    }
    return null;
  }

  function fileStem(meta) {
    meta = meta || {};
    var t = (meta.title || "").replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "").slice(0, 40);
    if (!t) t = "cuoc_hop";
    return "Bien_ban_" + t + "_" + (meta.date || "");
  }

  function entryHead(e, i) {
    var who = (e.speaker || "").trim() || ("Ý kiến " + (i + 1));
    return who + (e.time ? " (" + e.time + ")" : "");
  }

  function plainText(meta, entries) {
    meta = meta || {};
    var out = [], sec = sections(entries), lines = sec.notes;
    if (meta.company) out.push(String(meta.company).toUpperCase());
    out.push("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM");
    out.push("Độc lập - Tự do - Hạnh phúc");
    out.push("", "BIÊN BẢN CUỘC HỌP", "");
    out.push("Nội dung: " + (meta.title || "(chưa đặt tiêu đề)"));
    if (meta.date || meta.time) out.push("Thời gian: " + (meta.time ? meta.time + " - " : "") + dmy(meta.date));
    if (meta.place) out.push("Địa điểm: " + meta.place);
    if (meta.chair) out.push("Chủ trì: " + meta.chair);
    if (meta.sec) out.push("Thư ký: " + meta.sec);
    if (meta.att) {
      out.push("Thành phần tham dự:");
      String(meta.att).split("\n").forEach(function (a) { if (a.trim()) out.push("  - " + a.trim()); });
    }
    out.push("", "NỘI DUNG CUỘC HỌP:", "");
    lines.forEach(function (e, i) {
      out.push(entryHead(e, i) + ":");
      out.push((e.text || "").trim());
      out.push("");
    });
    if (sec.conclusions.length) {
      out.push("KẾT LUẬN CUỘC HỌP:");
      sec.conclusions.forEach(function (e, i) { out.push((i + 1) + ". " + (e.text || "").trim()); });
      out.push("");
    }
    if (sec.tasks.length) {
      out.push("PHÂN CÔNG NHIỆM VỤ:");
      sec.tasks.forEach(function (e, i) {
        var line = (i + 1) + ". " + ((e.text || "").trim() || "(chưa ghi nội dung)");
        if ((e.who || "").trim()) line += " — Người thực hiện: " + e.who.trim();
        if ((e.due || "").trim()) line += " — Thời hạn: " + e.due.trim();
        out.push(line);
      });
      out.push("");
    }
    out.push("", "Cuộc họp kết thúc cùng ngày. Biên bản đã được đọc lại cho các thành viên cùng nghe và thống nhất.");
    out.push("", "        THƯ KÝ                              CHỦ TRÌ");
    out.push("", "", "  " + (meta.sec || "") + "                         " + (meta.chair || ""));
    return out.join("\n");
  }

  function wordHtml(meta, entries) {
    meta = meta || {};
    var sec = sections(entries), lines = sec.notes;
    var rows = lines.map(function (e, i) {
      var head = (e.speaker || "").trim() || ("Ý kiến " + (i + 1));
      if (e.time) head += " — " + e.time;
      return '<p style="margin:0 0 4pt"><b>' + esc(head) + ':</b></p>' +
             '<p style="margin:0 0 10pt;text-align:justify">' + esc((e.text || "").trim()).replace(/\n/g, "<br>") + '</p>';
    }).join("");
    if (sec.conclusions.length) {
      rows += '<p class="sec">KẾT LUẬN CUỘC HỌP</p>' + sec.conclusions.map(function (e, i) {
        return '<p style="margin:0 0 6pt;text-align:justify">' + (i + 1) + '. ' + esc((e.text || "").trim()) + '</p>';
      }).join("");
    }
    if (sec.tasks.length) {
      var td = 'style="border:1px solid #000;padding:3pt 5pt;vertical-align:top"';
      rows += '<p class="sec">PHÂN CÔNG NHIỆM VỤ</p><table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">' +
        '<tr><th ' + td + '>STT</th><th ' + td + '>Nội dung công việc</th><th ' + td + '>Người thực hiện</th><th ' + td + '>Thời hạn</th></tr>' +
        sec.tasks.map(function (e, i) {
          return '<tr><td ' + td + ' align="center">' + (i + 1) + '</td><td ' + td + '>' + esc((e.text || "").trim()) +
            '</td><td ' + td + '>' + esc((e.who || "").trim()) + '</td><td ' + td + '>' + esc((e.due || "").trim()) + '</td></tr>';
        }).join("") + '</table>';
    }
    var attHtml = meta.att ? String(meta.att).split("\n").filter(function (a) { return a.trim(); })
      .map(function (a) { return '<p style="margin:0 0 2pt">- ' + esc(a.trim()) + '</p>'; }).join("") : "";
    return '' +
'<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8">' +
'<style>@page{size:A4;margin:2cm 2cm 2cm 3cm} body{font-family:"Times New Roman",serif;font-size:13pt;color:#000;line-height:1.4}' +
'h1{font-size:15pt;text-align:center;margin:0 0 4pt} .sub{text-align:center;font-style:italic;margin:0 0 14pt}' +
'.meta p{margin:0 0 3pt} .sec{font-weight:bold;margin:12pt 0 6pt}</style></head><body>' +
'<table width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 8pt"><tr>' +
'<td width="46%" align="center" valign="top">' + (meta.company ? '<b style="text-transform:uppercase">' + esc(meta.company) + '</b><table align="center" cellspacing="0" cellpadding="0"><tr><td style="border-top:1.2pt solid #000;width:110px;font-size:2pt">&#160;</td></tr></table>' : '') + '</td>' +
'<td width="54%" align="center" valign="top"><b style="font-size:12pt;white-space:nowrap">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</b><br><b>Độc lập - Tự do - Hạnh phúc</b><table align="center" cellspacing="0" cellpadding="0"><tr><td style="border-top:1.2pt solid #000;width:150px;font-size:2pt">&#160;</td></tr></table></td>' +
'</tr></table>' +
'<h1>BIÊN BẢN CUỘC HỌP</h1>' +
'<p class="sub">' + esc(meta.place ? meta.place + ", " : "") + esc(dmy(meta.date)) + '</p>' +
'<div class="meta">' +
'<p><b>Nội dung họp:</b> ' + esc(meta.title || "(chưa đặt tiêu đề)") + '</p>' +
((meta.date || meta.time) ? '<p><b>Thời gian:</b> ' + esc(meta.time ? meta.time + " - " : "") + esc(dmy(meta.date)) + '</p>' : '') +
(meta.place ? '<p><b>Địa điểm:</b> ' + esc(meta.place) + '</p>' : '') +
(meta.chair ? '<p><b>Chủ trì:</b> ' + esc(meta.chair) + '</p>' : '') +
(meta.sec ? '<p><b>Thư ký:</b> ' + esc(meta.sec) + '</p>' : '') +
(attHtml ? '<p><b>Thành phần tham dự:</b></p>' + attHtml : '') +
'</div>' +
'<p class="sec">NỘI DUNG CUỘC HỌP</p>' + rows +
'<p style="margin:14pt 0 0;text-align:justify">Cuộc họp kết thúc cùng ngày. Biên bản đã được đọc lại cho các thành viên cùng nghe và thống nhất thông qua.</p>' +
'<table width="100%" cellspacing="0" cellpadding="0" style="margin-top:22pt"><tr>' +
'<td width="50%" align="center" valign="top"><b>THƯ KÝ</b><br><i style="font-size:11pt">(Ký, ghi rõ họ tên)</i></td>' +
'<td width="50%" align="center" valign="top"><b>CHỦ TRÌ</b><br><i style="font-size:11pt">(Ký, ghi rõ họ tên)</i></td>' +
'</tr><tr>' +
'<td align="center" style="padding-top:46pt">' + esc(meta.sec) + '</td>' +
'<td align="center" style="padding-top:46pt">' + esc(meta.chair) + '</td>' +
'</tr></table></body></html>';
  }

  // Viết hoa đầu chuỗi và sau dấu kết câu (. ! ? …)
  function autoCapitalize(text) {
    if (!text) return "";
    var s = String(text), out = "", capNext = true;
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (capNext && /\S/.test(ch)) { out += ch.toUpperCase(); capNext = false; }
      else out += ch;
      if (/[.!?…]/.test(ch)) capNext = true;
    }
    return out;
  }

  // Từ điển sửa thuật ngữ: mỗi dòng "sai=đúng"
  function parseDict(text) {
    if (!text) return [];
    return String(text).split("\n").map(function (line) {
      var i = line.indexOf("=");
      if (i <= 0) return null;
      var from = line.slice(0, i).trim(), to = line.slice(i + 1).trim();
      if (!from || !to) return null;
      return { from: from, to: to };
    }).filter(function (x) { return x; });
  }
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  // Thay thế theo "từ": biên giới là ký tự không phải chữ/số (unicode)
  function applyDict(text, dict) {
    if (!text || !dict || !dict.length) return text || "";
    var out = String(text);
    dict.forEach(function (d) {
      var re = new RegExp("(^|[^\\p{L}\\p{N}])(" + escRe(d.from) + ")(?![\\p{L}\\p{N}])", "giu");
      out = out.replace(re, function (m, pre) { return pre + d.to; });
    });
    return out;
  }

  // So sánh phiên bản dạng "2.1" / "2.10.3": trả 1 nếu a>b, -1 nếu a<b, 0 nếu bằng
  function cmpVersion(a, b) {
    var pa = String(a || "").split(".").map(function (x) { return parseInt(x, 10) || 0; });
    var pb = String(b || "").split(".").map(function (x) { return parseInt(x, 10) || 0; });
    var n = Math.max(pa.length, pb.length);
    for (var i = 0; i < n; i++) {
      var x = pa[i] || 0, y = pb[i] || 0;
      if (x > y) return 1;
      if (x < y) return -1;
    }
    return 0;
  }

  var api = { fmtTime: fmtTime, dmy: dmy, esc: esc, appendText: appendText,
    extractSpeech: extractSpeech, bodyLines: bodyLines, fileStem: fileStem,
    entryHead: entryHead, plainText: plainText, wordHtml: wordHtml,
    autoCapitalize: autoCapitalize, parseDict: parseDict, applyDict: applyDict,
    cmpVersion: cmpVersion, sections: sections, findSegment: findSegment };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BBLogic = api;
})(typeof window !== "undefined" ? window : this);
