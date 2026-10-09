/* docx.js — tạo file .docx (OOXML) thuần, không thư viện ngoài.
   Mục đích: điện thoại (Google Docs/WPS/Word mobile) mở được, khác với .doc-HTML cũ.
   Dùng chung cho Node (test) và trình duyệt (nhúng vào index.html). */
(function (root) {
  "use strict";

  // ---- escape XML ----
  function xmlEsc(s) {
    if (s === null || s === undefined) return "";
    return String(s).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }

  // ---- dòng "địa danh, ngày…" (NĐ 30): chỉ tên Tỉnh/TP — giống datePlace trong logic.js ----
  function datePlace(place) {
    var parts = String(place || "").split(",").map(function (x) { return x.trim(); }).filter(function (x) { return x; });
    var last = parts[parts.length - 1] || "";
    return parts.length > 1 && /^(thành phố|tỉnh)\s/i.test(last) ? last : parts.join(", ");
  }

  // ---- định dạng ngày ----
  function dmy(iso) {
    if (!iso || typeof iso !== "string") return "";
    var p = iso.split("-"); if (p.length !== 3) return iso;
    return "ngày " + p[2] + " tháng " + p[1] + " năm " + p[0];
  }

  // half-point sizes: 13pt=26, 15pt=30, 12pt=24, 11pt=22
  function run(text, opt) {
    opt = opt || {};
    var rpr = "<w:rPr>";
    if (opt.b) rpr += "<w:b/>";
    if (opt.i) rpr += "<w:i/>";
    if (opt.sz) rpr += '<w:sz w:val="' + opt.sz + '"/><w:szCs w:val="' + opt.sz + '"/>';
    if (opt.caps) rpr += "<w:caps/>";
    rpr += "</w:rPr>";
    // giữ khoảng trắng
    return '<w:r>' + rpr + '<w:t xml:space="preserve">' + xmlEsc(text) + '</w:t></w:r>';
  }
  function para(runsXml, opt) {
    opt = opt || {};
    var ppr = "<w:pPr>";
    if (opt.keepNext) ppr += "<w:keepNext/>";
    if (opt.align) ppr += '<w:jc w:val="' + opt.align + '"/>';
    var sa = (opt.spaceAfter !== undefined) ? opt.spaceAfter : 120; // twips 6pt
    var sb = opt.spaceBefore || 0;
    ppr += '<w:spacing w:before="' + sb + '" w:after="' + sa + '" w:line="276" w:lineRule="auto"/>';
    ppr += "</w:pPr>";
    return "<w:p>" + ppr + (runsXml || "") + "</w:p>";
  }
  function emptyPara() { return '<w:p><w:pPr><w:spacing w:after="0"/></w:pPr></w:p>'; }

  // bảng 2 cột không viền, canh giữa mỗi ô. leftPct/rightPct = phần nghìn (pct).
  // Khổ in = 9355 dxa (A4 trừ lề 30mm+15mm) → quy bề rộng cột ra dxa cho tblGrid.
  var TEXT_W = 9355;
  function twoColTable(leftXml, rightXml, leftPct, rightPct) {
    var leftDxa = Math.round(TEXT_W * leftPct / 5000);
    var rightDxa = TEXT_W - leftDxa;
    function cell(xml, w) {
      return '<w:tc><w:tcPr><w:tcW w:w="' + w + '" w:type="pct"/>' +
        '<w:tcMar><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tcMar></w:tcPr>' +
        xml + '</w:tc>';
    }
    return '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>' +
      '<w:tblBorders><w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/>' +
      '<w:right w:val="none"/><w:insideH w:val="none"/><w:insideV w:val="none"/></w:tblBorders>' +
      '<w:tblLayout w:type="fixed"/></w:tblPr>' +
      '<w:tblGrid><w:gridCol w:w="' + leftDxa + '"/><w:gridCol w:w="' + rightDxa + '"/></w:tblGrid>' +
      '<w:tr><w:trPr><w:cantSplit/></w:trPr>' + cell(leftXml, leftPct) + cell(rightXml, rightPct) + '</w:tr></w:tbl>';
  }

  // Tách ý kiến thường / kết luận / phân công (cùng quy tắc với logic.js → sections)
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

  // Bảng có kẻ ô (dùng cho Phân công). widths = mảng dxa, rows = mảng mảng chuỗi
  function gridTable(widths, header, rows) {
    var B = '<w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="single" w:sz="4" w:color="000000"/>' +
      '<w:bottom w:val="single" w:sz="4" w:color="000000"/><w:right w:val="single" w:sz="4" w:color="000000"/>' +
      '<w:insideH w:val="single" w:sz="4" w:color="000000"/><w:insideV w:val="single" w:sz="4" w:color="000000"/>';
    function tc(text, w, opt) {
      return '<w:tc><w:tcPr><w:tcW w:w="' + w + '" w:type="dxa"/></w:tcPr>' +
        para(run(text, { b: !!opt.b }), { align: opt.align || "left", spaceAfter: 0 }) + '</w:tc>';
    }
    var xml = '<w:tbl><w:tblPr><w:tblW w:w="' + widths.reduce(function (a, c) { return a + c; }, 0) + '" w:type="dxa"/>' +
      '<w:tblBorders>' + B + '</w:tblBorders><w:tblLayout w:type="fixed"/>' +
      '<w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>' +
      '<w:tblGrid>' + widths.map(function (w) { return '<w:gridCol w:w="' + w + '"/>'; }).join("") + '</w:tblGrid>';
    xml += '<w:tr>' + header.map(function (h, i) { return tc(h, widths[i], { b: true, align: "center" }); }).join("") + '</w:tr>';
    rows.forEach(function (r) {
      xml += '<w:tr>' + r.map(function (c, i) { return tc(c, widths[i], { align: i === 0 ? "center" : "left" }); }).join("") + '</w:tr>';
    });
    return xml + '</w:tbl>';
  }

  function buildDocumentXml(meta, entries) {
    meta = meta || {};
    var sec = sections(entries), lines = sec.notes;
    var b = [];

    // ===== Header: công ty (trái) | Quốc hiệu - Tiêu ngữ (phải) =====
    var leftCell = para(meta.company ? run(meta.company, { b: true, caps: true }) : "", { align: "center", spaceAfter: 0 });
    var rightCell =
      para(run("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", { b: true, sz: 24 }), { align: "center", spaceAfter: 0 }) +
      para(run("Độc lập - Tự do - Hạnh phúc", { b: true }), { align: "center", spaceAfter: 0 }) +
      para(run("————————————", {}), { align: "center", spaceAfter: 0 });
    b.push(twoColTable(leftCell, rightCell, 2200, 2800));
    b.push(emptyPara());

    // ===== Tiêu đề =====
    b.push(para(run("BIÊN BẢN CUỘC HỌP", { b: true, sz: 30 }), { align: "center", spaceAfter: 60 }));
    var sub = (meta.place ? datePlace(meta.place) + ", " : "") + dmy(meta.date);
    if (sub.trim()) b.push(para(run(sub, { i: true }), { align: "center", spaceAfter: 200 }));

    // ===== Thông tin =====
    function label(lbl, val) { return para(run(lbl + " ", { b: true }) + run(val, {}), { spaceAfter: 100 }); }
    b.push(label("Nội dung họp:", meta.title || "(chưa đặt tiêu đề)"));
    if (meta.date || meta.time) b.push(label("Thời gian:", (meta.time ? meta.time + " - " : "") + dmy(meta.date)));
    if (meta.place) b.push(label("Địa điểm:", meta.place));
    if (meta.chair) b.push(label("Chủ trì:", meta.chair));
    if (meta.sec) b.push(label("Thư ký:", meta.sec));
    if (meta.att) {
      b.push(para(run("Thành phần tham dự:", { b: true }), { spaceAfter: 60 }));
      String(meta.att).split("\n").forEach(function (a) {
        if (a.trim()) b.push(para(run("- " + a.trim(), {}), { spaceAfter: 40 }));
      });
    }

    // ===== Nội dung =====
    b.push(para(run("NỘI DUNG CUỘC HỌP", { b: true }), { spaceBefore: 160, spaceAfter: 80 }));
    lines.forEach(function (e, i) {
      var who = (e.speaker || "").trim() || ("Ý kiến " + (i + 1));
      if (e.time) who += " — " + e.time;
      b.push(para(run(who + ":", { b: true }), { spaceAfter: 40 }));
      // mỗi dòng xuống hàng trong text
      var parts = (e.text || "").trim().split("\n");
      var runs = "";
      parts.forEach(function (p, idx) { runs += run(p, {}); if (idx < parts.length - 1) runs += "<w:r><w:br/></w:r>"; });
      b.push(para(runs, { align: "both", spaceAfter: 160 }));
    });

    // ===== Kết luận =====
    if (sec.conclusions.length) {
      b.push(para(run("KẾT LUẬN CUỘC HỌP", { b: true }), { spaceBefore: 160, spaceAfter: 80 }));
      sec.conclusions.forEach(function (e, i) {
        b.push(para(run((i + 1) + ". " + (e.text || "").trim(), {}), { align: "both", spaceAfter: 100 }));
      });
    }
    // ===== Phân công (bảng kẻ ô) =====
    if (sec.tasks.length) {
      b.push(para(run("PHÂN CÔNG NHIỆM VỤ", { b: true }), { spaceBefore: 160, spaceAfter: 80 }));
      // tổng = TEXT_W (9355 dxa): STT | Nội dung | Người | Hạn
      b.push(gridTable([700, 4655, 2400, 1600],
        ["STT", "Nội dung công việc", "Người thực hiện", "Thời hạn"],
        sec.tasks.map(function (e, i) {
          return [String(i + 1), (e.text || "").trim(), (e.who || "").trim(), (e.due || "").trim()];
        })));
      b.push(emptyPara());
    }

    b.push(para(run("Cuộc họp kết thúc cùng ngày. Biên bản đã được đọc lại cho các thành viên cùng nghe và thống nhất thông qua.", {}), { align: "both", spaceBefore: 120, spaceAfter: 200, keepNext: true }));

    // ===== Khối ký =====
    var skLeft = para(run("THƯ KÝ", { b: true }), { align: "center", spaceAfter: 0 }) +
      para(run("(Ký, ghi rõ họ tên)", { i: true, sz: 22 }), { align: "center", spaceAfter: 0 }) +
      emptyPara() + emptyPara() + emptyPara() +
      para(run(meta.sec || "", {}), { align: "center", spaceAfter: 0 });
    var skRight = para(run("CHỦ TRÌ", { b: true }), { align: "center", spaceAfter: 0 }) +
      para(run("(Ký, ghi rõ họ tên)", { i: true, sz: 22 }), { align: "center", spaceAfter: 0 }) +
      emptyPara() + emptyPara() + emptyPara() +
      para(run(meta.chair || "", {}), { align: "center", spaceAfter: 0 });
    b.push(twoColTable(skLeft, skRight, 2500, 2500));
    b.push(emptyPara()); // paragraph sau bảng cuối (tránh Word báo "repair")

    // section: A4, lề theo NĐ30 (trái 30mm, phải 15mm, trên/dưới 20mm)
    var sect = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
      '<w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="1701" w:header="720" w:footer="720" w:gutter="0"/>' +
      '</w:sectPr>';

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body>' + b.join("") + sect + '</w:body></w:document>';
  }

  var CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '</Types>';
  var RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>';
  var DOC_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '</Relationships>';
  var STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:docDefaults><w:rPrDefault><w:rPr>' +
    '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>' +
    '<w:sz w:val="26"/><w:szCs w:val="26"/><w:lang w:val="vi-VN"/></w:rPr></w:rPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
    '</w:styles>';

  // ---------- ZIP (store, không nén) ----------
  var CRC_TABLE = (function () {
    var t = [], c, n, k;
    for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; }
    return t;
  })();
  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function utf8(str) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(str);
    // Node fallback
    return new Uint8Array(Buffer.from(str, "utf8"));
  }
  function u16(n) { return [n & 0xFF, (n >>> 8) & 0xFF]; }
  function u32(n) { return [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF]; }

  function zipStore(files) {
    // files: [{name, data(Uint8Array)}]
    var chunks = [], central = [], offset = 0;
    files.forEach(function (f) {
      var name = utf8(f.name), data = f.data, crc = crc32(data), size = data.length;
      var local = [].concat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
        u32(crc), u32(size), u32(size), u16(name.length), u16(0));
      var localArr = new Uint8Array(local.length + name.length + data.length);
      localArr.set(local, 0); localArr.set(name, local.length); localArr.set(data, local.length + name.length);
      chunks.push(localArr);
      var cen = [].concat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
        u32(crc), u32(size), u32(size), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset));
      var cenArr = new Uint8Array(cen.length + name.length);
      cenArr.set(cen, 0); cenArr.set(name, cen.length);
      central.push(cenArr);
      offset += localArr.length;
    });
    var cenSize = central.reduce(function (s, a) { return s + a.length; }, 0);
    var end = new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
      u32(cenSize), u32(offset), u16(0)));
    var total = offset + cenSize + end.length;
    var out = new Uint8Array(total), pos = 0;
    chunks.forEach(function (c) { out.set(c, pos); pos += c.length; });
    central.forEach(function (c) { out.set(c, pos); pos += c.length; });
    out.set(end, pos);
    return out;
  }

  function buildDocx(meta, entries) {
    return zipStore([
      { name: "[Content_Types].xml", data: utf8(CONTENT_TYPES) },
      { name: "_rels/.rels", data: utf8(RELS) },
      { name: "word/_rels/document.xml.rels", data: utf8(DOC_RELS) },
      { name: "word/styles.xml", data: utf8(STYLES) },
      { name: "word/document.xml", data: utf8(buildDocumentXml(meta, entries)) }
    ]);
  }

  var api = { buildDocx: buildDocx, buildDocumentXml: buildDocumentXml, crc32: crc32, zipStore: zipStore, xmlEsc: xmlEsc };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BBDocx = api;
})(typeof window !== "undefined" ? window : this);
