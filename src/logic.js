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

  // Chống lặp chữ: Chrome (nhất là Android) có thể gửi lại câu đã chốt, hoặc gửi dồn
  // "câu cũ + phần mới". Mỗi phiên nhận diện dùng 1 tracker; reset() khi phiên mới.
  function wordsOf(text) {
    return String(text || "").split(/\s+/).map(function (o) {
      return { o: o, n: o.toLowerCase().replace(/[.,!?;:…"'“”()\[\]\-–—]/g, "") };
    }).filter(function (w) { return w.n; });
  }
  function createSpeechTracker(opts) {
    var cumulative = !!(opts && opts.cumulative);
    var byIndex = {}, last = [];
    function key(ws) { return ws.map(function (w) { return w.n; }).join(" "); }
    // Thà lặp còn hơn mất chữ: chỉ cắt khi có bằng chứng gửi dồn — câu chốt trước nằm ngay
    // trước trong cùng danh sách kết quả, và câu mới mở đầu bằng TRỌN câu đó.
    // Trả null = không cắt (giữ nguyên văn).
    function newPart(ws, prev) {
      if (!cumulative || !last.length || !prev || !prev.isFinal) return null;
      if (key(wordsOf(prev.transcript)) !== key(last)) return null;
      for (var k = 0; k < last.length; k++) if (!ws[k] || ws[k].n !== last[k].n) return null;
      return ws.slice(last.length);
    }
    return {
      reset: function () { byIndex = {}; last = []; },
      feed: function (results, idx) {
        var fin = [], interim = "";
        results = results || [];
        for (var i = idx || 0; i < results.length; i++) {
          var r = results[i];
          if (!r.isFinal) { interim += r.transcript || ""; continue; }
          var ws = wordsOf(r.transcript);
          if (!ws.length || byIndex[i] === key(ws)) continue;
          byIndex[i] = key(ws);
          var part = newPart(ws, results[i - 1]);
          last = ws;
          if (!part) fin.push(String(r.transcript).trim());
          else if (part.length) fin.push(part.map(function (w) { return w.o; }).join(" "));
        }
        return { finalText: fin.join(" "), interim: interim };
      }
    };
  }

  // ----- Địa điểm từ GPS: địa chỉ theo đơn vị hành chính 2 cấp (01/7/2025) -----
  // Máy không có GPS thật hay trả 0,0 → không được ghi tọa độ rác vào biên bản.
  function checkFix(lat, lon, acc) {
    if (typeof lat !== "number" || typeof lon !== "number" || !isFinite(lat) || !isFinite(lon)) return { ok: false, reason: "bad" };
    if (Math.abs(lat) < 1e-6 && Math.abs(lon) < 1e-6) return { ok: false, reason: "zero" };
    if (lat < 7 || lat > 23.5 || lon < 102 || lon > 118) return { ok: false, reason: "outside" }; // gồm Hoàng Sa, Trường Sa
    if (typeof acc === "number" && acc > 1000) return { ok: false, reason: "inaccurate" };
    return { ok: true, reason: "" };
  }
  var CITIES = ["Hà Nội", "Huế", "Hải Phòng", "Đà Nẵng", "Cần Thơ", "Hồ Chí Minh"]; // 6 TP trực thuộc TW
  var ALIASES = { "ho chi minh": "Hồ Chí Minh", "hcm": "Hồ Chí Minh", "hanoi": "Hà Nội", "ha noi": "Hà Nội",
    "hue": "Huế", "thua thien hue": "Huế", "thừa thiên huế": "Huế", "hai phong": "Hải Phòng",
    "da nang": "Đà Nẵng", "can tho": "Cần Thơ" };
  var CITY_OR_PROV = /^(thành phố|tỉnh)\s/i;
  function nfc(s) { s = String(s || "").trim(); return s.normalize ? s.normalize("NFC") : s; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function provinceName(s) {
    var t = nfc(s);
    if (!t) return "";
    if (CITY_OR_PROV.test(t)) return cap(t);
    t = t.replace(/^(tp\.?\s*|thủ đô\s+|city of\s+)/i, "").replace(/\s+city$/i, "").trim();
    t = ALIASES[t.toLowerCase()] || t;
    return (CITIES.indexOf(t) >= 0 ? "Thành phố " : "Tỉnh ") + t;
  }
  function wardName(s) {
    var t = nfc(s);
    if (!t) return "";
    if (/^(quận|huyện|thị xã|thành phố|tỉnh)\s/i.test(t)) return ""; // tên cấp cũ (đã bỏ từ 01/7/2025) → không bịa phường
    t = t.replace(/^p\.\s*/i, "Phường ");
    var m = t.match(/^(phường|xã|đặc khu|thị trấn)\s+/i);
    if (m) return cap(m[1].toLowerCase()) + " " + t.slice(m[0].length);
    return "Phường " + t;
  }
  function parsePhoton(json) {
    var f = json && json.features && json.features[0], p = f && f.properties;
    if (!p) return null;
    if (p.countrycode && String(p.countrycode).toUpperCase() !== "VN") return null;
    // phường/xã thường ở district, có nơi ở county; đặc khu (Phú Quốc…) nằm ở city khi có state = tỉnh
    var ward = p.district || p.county || (p.state && p.city && !CITY_OR_PROV.test(p.city) ? p.city : "");
    return { house: p.housenumber || "", street: p.street || (p.osm_key === "highway" ? p.name || "" : ""),
      ward: ward, province: p.state || p.city || "" };
  }
  function parseOverpass(json) {
    var wards = [], province = "", foreign = false;
    ((json && json.elements) || []).forEach(function (e) {
      var t = e.tags || {};
      if (t.admin_level === "2" && t["ISO3166-1"] && t["ISO3166-1"] !== "VN") foreign = true;
      if (t.admin_level === "6" && t.name && wards.indexOf(t.name) < 0) wards.push(t.name);
      if (t.admin_level === "4" && t.name && !province) province = t.name;
    });
    if (foreign) return { ward: "", province: "" };
    return { ward: wards.length === 1 ? wards[0] : "", province: province }; // nhiều phường → không đoán
  }
  function formatPlace(p) {
    if (!p) return "";
    var ward = wardName(p.ward), prov = provinceName(p.province);
    if (!ward || !prov) return "";
    var house = String(p.house || "").trim(), street = String(p.street || "").trim();
    var road = !street ? "" : house && street.split(/\s+/)[0] !== house ? house + " " + street : street;
    return [road, ward, prov].filter(function (x) { return x; }).join(", ");
  }
  // Gỡ đúng 2 dạng bản cũ đã ghi: "GPS x, y" và "chữ (GPS x, y)"
  function cleanPlace(s) {
    var t = String(s || "").trim();
    if (/^GPS\s+-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/i.test(t)) return "";
    return t.replace(/\s*\(GPS\s+-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\)$/i, "").trim();
  }
  // Dòng "địa danh, ngày…" (NĐ 30): chỉ tên Tỉnh/TP. Địa điểm gõ tay không theo dạng địa chỉ → giữ như cũ.
  function datePlace(place) {
    var parts = String(place || "").split(",").map(function (x) { return x.trim(); }).filter(function (x) { return x; });
    var last = parts[parts.length - 1] || "";
    return parts.length > 1 && CITY_OR_PROV.test(last) ? last : parts.join(", ");
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
'<p class="sub">' + esc(meta.place ? datePlace(meta.place) + ", " : "") + esc(dmy(meta.date)) + '</p>' +
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
    extractSpeech: extractSpeech, createSpeechTracker: createSpeechTracker,
    checkFix: checkFix, provinceName: provinceName, wardName: wardName, parsePhoton: parsePhoton,
    parseOverpass: parseOverpass, formatPlace: formatPlace, cleanPlace: cleanPlace, datePlace: datePlace, bodyLines: bodyLines, fileStem: fileStem,
    entryHead: entryHead, plainText: plainText, wordHtml: wordHtml,
    autoCapitalize: autoCapitalize, parseDict: parseDict, applyDict: applyDict,
    cmpVersion: cmpVersion, sections: sections };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BBLogic = api;
})(typeof window !== "undefined" ? window : this);
