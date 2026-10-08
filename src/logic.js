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
      return (e.text || "").trim() || (e.speaker || "").trim();
    });
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
    var out = [], lines = bodyLines(entries);
    if (meta.company) out.push(String(meta.company).toUpperCase());
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
    out.push("", "Cuộc họp kết thúc cùng ngày. Biên bản đã được đọc lại cho các thành viên cùng nghe và thống nhất.");
    out.push("", "        THƯ KÝ                              CHỦ TRÌ");
    out.push("", "", "  " + (meta.sec || "") + "                         " + (meta.chair || ""));
    return out.join("\n");
  }

  function wordHtml(meta, entries) {
    meta = meta || {};
    var lines = bodyLines(entries);
    var rows = lines.map(function (e, i) {
      var head = (e.speaker || "").trim() || ("Ý kiến " + (i + 1));
      if (e.time) head += " — " + e.time;
      return '<p style="margin:0 0 4pt"><b>' + esc(head) + ':</b></p>' +
             '<p style="margin:0 0 10pt;text-align:justify">' + esc((e.text || "").trim()).replace(/\n/g, "<br>") + '</p>';
    }).join("");
    var attHtml = meta.att ? String(meta.att).split("\n").filter(function (a) { return a.trim(); })
      .map(function (a) { return '<p style="margin:0 0 2pt">- ' + esc(a.trim()) + '</p>'; }).join("") : "";
    return '' +
'<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8">' +
'<style>@page{size:A4;margin:2cm 2cm 2cm 3cm} body{font-family:"Times New Roman",serif;font-size:13pt;color:#000;line-height:1.4}' +
'h1{font-size:15pt;text-align:center;margin:0 0 4pt} .sub{text-align:center;font-style:italic;margin:0 0 14pt}' +
'.meta p{margin:0 0 3pt} .sec{font-weight:bold;margin:12pt 0 6pt}</style></head><body>' +
(meta.company ? '<p style="text-align:center;font-weight:bold;text-transform:uppercase;margin:0 0 10pt">' + esc(meta.company) + '</p>' : '') +
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

  var api = { fmtTime: fmtTime, dmy: dmy, esc: esc, appendText: appendText,
    extractSpeech: extractSpeech, bodyLines: bodyLines, fileStem: fileStem,
    entryHead: entryHead, plainText: plainText, wordHtml: wordHtml };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BBLogic = api;
})(typeof window !== "undefined" ? window : this);
