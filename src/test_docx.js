"use strict";
const test = require("node:test");
const assert = require("node:assert");
const D = require("./docx.js");

const meta = { company: "LAVIPCO", title: "Họp A", date: "2026-10-09", time: "08:00",
  place: "P.Họp", chair: "Ô. X", sec: "Bà Y", att: "Ô. X\nBà Y" };
const entries = [{ id: "1", time: "08:05", speaker: "Ô. X", text: "khai mạc 1 < 2 & \"ok\"" }];

test("buildDocx trả về Uint8Array và là ZIP (PK..)", () => {
  const out = D.buildDocx(meta, entries);
  assert.ok(out instanceof Uint8Array);
  assert.strictEqual(out[0], 0x50); // 'P'
  assert.strictEqual(out[1], 0x4B); // 'K'
  assert.ok(out.length > 500);
});

test("document.xml có đủ nội dung + Quốc hiệu + khối ký", () => {
  const xml = D.buildDocumentXml(meta, entries);
  assert.ok(xml.includes("BIÊN BẢN CUỘC HỌP"));
  assert.ok(xml.includes("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM"));
  assert.ok(xml.includes("Độc lập - Tự do - Hạnh phúc"));
  assert.ok(xml.includes("THƯ KÝ") && xml.includes("CHỦ TRÌ"));
  assert.ok(xml.includes("Họp A") && xml.includes("khai mạc"));
});

test("escape XML đúng (chống vỡ file)", () => {
  const xml = D.buildDocumentXml(meta, entries);
  assert.ok(xml.includes("1 &lt; 2 &amp; &quot;ok&quot;"));
  assert.ok(!xml.includes('khai mạc 1 < 2 & "ok"'));
});

test("người nói rỗng → 'Ý kiến N'", () => {
  const xml = D.buildDocumentXml({ title: "T" }, [{ id: "1", time: "08:00", speaker: "", text: "x" }]);
  assert.ok(xml.includes("Ý kiến 1"));
});

test("thiếu tiêu đề vẫn tạo được, không lỗi", () => {
  assert.doesNotThrow(() => D.buildDocx({}, []));
  const xml = D.buildDocumentXml({}, []);
  assert.ok(xml.includes("(chưa đặt tiêu đề)"));
});

test("có tblGrid trong bảng (hợp lệ OOXML cho điện thoại)", () => {
  const xml = D.buildDocumentXml(meta, entries);
  assert.ok(xml.includes("<w:tblGrid>"), "bảng phải có tblGrid");
  assert.ok((xml.match(/<w:gridCol/g) || []).length >= 4, "mỗi bảng 2 cột có gridCol");
});
test("body kết thúc bằng paragraph trước sectPr (không phải bảng)", () => {
  const xml = D.buildDocumentXml(meta, entries);
  const i = xml.indexOf("<w:sectPr>");
  const before = xml.slice(0, i);
  assert.ok(before.trimEnd().endsWith("</w:p>"), "ngay trước sectPr phải là </w:p>");
});
test("CRC32 khớp giá trị chuẩn", () => {
  // CRC32 của "123456789" = 0xCBF43926
  assert.strictEqual(D.crc32(new TextEncoder().encode("123456789")) >>> 0, 0xCBF43926);
});

test("zipStore: EOCD signature ở cuối", () => {
  const out = D.buildDocx(meta, entries);
  // tìm 0x06054b50 (PK\x05\x06)
  let found = false;
  for (let i = out.length - 22; i >= 0; i--) {
    if (out[i] === 0x50 && out[i+1] === 0x4B && out[i+2] === 0x05 && out[i+3] === 0x06) { found = true; break; }
  }
  assert.ok(found, "có End Of Central Directory");
});
