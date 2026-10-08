"use strict";
const test = require("node:test");
const assert = require("node:assert");
const L = require("./logic.js");

// ---------- fmtTime ----------
test("fmtTime: giây < 1 phút", () => {
  assert.strictEqual(L.fmtTime(0), "00:00");
  assert.strictEqual(L.fmtTime(5), "00:05");
  assert.strictEqual(L.fmtTime(59), "00:59");
});
test("fmtTime: phút:giây", () => {
  assert.strictEqual(L.fmtTime(60), "01:00");
  assert.strictEqual(L.fmtTime(125), "02:05");
});
test("fmtTime: có giờ khi >= 1 tiếng", () => {
  assert.strictEqual(L.fmtTime(3600), "01:00:00");
  assert.strictEqual(L.fmtTime(3661), "01:01:01");
});
test("fmtTime: làm tròn xuống, không âm", () => {
  assert.strictEqual(L.fmtTime(9.9), "00:09");
  assert.strictEqual(L.fmtTime(-5), "00:00");
});

// ---------- dmy ----------
test("dmy: iso hợp lệ", () => {
  assert.strictEqual(L.dmy("2026-10-08"), "ngày 08 tháng 10 năm 2026");
});
test("dmy: rỗng → rỗng (ca xấu)", () => {
  assert.strictEqual(L.dmy(""), "");
  assert.strictEqual(L.dmy(null), "");
  assert.strictEqual(L.dmy(undefined), "");
});

// ---------- esc ----------
test("esc: thoát ký tự HTML (chống vỡ Word)", () => {
  assert.strictEqual(L.esc('a<b>&"c'), "a&lt;b&gt;&amp;&quot;c");
});
test("esc: rỗng/null an toàn", () => {
  assert.strictEqual(L.esc(""), "");
  assert.strictEqual(L.esc(null), "");
});
test("esc: giữ nguyên dấu tiếng Việt", () => {
  assert.strictEqual(L.esc("Chiếu sáng Khu vực Trung Tâm"), "Chiếu sáng Khu vực Trung Tâm");
});

// ---------- appendText ----------
test("appendText: text cũ rỗng → chỉ đoạn mới (trim)", () => {
  assert.strictEqual(L.appendText("", "  xin chào "), "xin chào");
});
test("appendText: ghép có đúng 1 khoảng trắng", () => {
  assert.strictEqual(L.appendText("xin chào", "các anh"), "xin chào các anh");
  assert.strictEqual(L.appendText("xin chào ", "các anh"), "xin chào các anh");
});
test("appendText: đoạn mới rỗng → giữ nguyên", () => {
  assert.strictEqual(L.appendText("abc", "   "), "abc");
});

// ---------- extractSpeech ----------
// results: mảng [{isFinal, transcript}], idx = resultIndex
test("extractSpeech: tách final và interim từ resultIndex", () => {
  const results = [
    { isFinal: true, transcript: "đã chốt" },     // trước idx, bỏ qua
    { isFinal: true, transcript: "câu xong" },
    { isFinal: false, transcript: "đang nói" },
  ];
  const r = L.extractSpeech(results, 1);
  assert.strictEqual(r.finalText, "câu xong");
  assert.strictEqual(r.interim, "đang nói");
});
test("extractSpeech: không có gì mới", () => {
  const r = L.extractSpeech([], 0);
  assert.strictEqual(r.finalText, "");
  assert.strictEqual(r.interim, "");
});

// ---------- bodyLines ----------
test("bodyLines: bỏ đoạn rỗng cả text lẫn speaker", () => {
  const e = [
    { id: "1", time: "08:00", speaker: "A", text: "ý kiến 1" },
    { id: "2", time: "08:01", speaker: "", text: "   " },
    { id: "3", time: "08:02", speaker: "B", text: "" },
  ];
  const r = L.bodyLines(e);
  assert.strictEqual(r.length, 2); // đoạn 1 (có text) + đoạn 3 (có speaker)
  assert.strictEqual(r[0].text, "ý kiến 1");
});
test("bodyLines: danh sách rỗng → []", () => {
  assert.deepStrictEqual(L.bodyLines([]), []);
});

// ---------- fileStem ----------
test("fileStem: từ tiêu đề, bỏ ký tự lạ, giữ chữ VN", () => {
  const s = L.fileStem({ title: "Họp triển khai / gói thầu!", date: "2026-10-08" });
  assert.ok(s.startsWith("Bien_ban_"));
  assert.ok(s.includes("2026-10-08"));
  assert.ok(!/[\/!]/.test(s)); // không còn ký tự lạ
});
test("fileStem: thiếu tiêu đề → cuoc_hop (ca xấu)", () => {
  const s = L.fileStem({ title: "", date: "" });
  assert.ok(s.includes("cuoc_hop"));
});

// ---------- plainText ----------
test("plainText: có tiêu đề chính và các mục", () => {
  const meta = { company: "LAVIPCO", title: "Họp A", date: "2026-10-08", time: "08:00",
                 place: "P.Họp", chair: "Ông X", sec: "Bà Y", att: "Ông X\nBà Y" };
  const entries = [{ id: "1", time: "08:05", speaker: "Ông X", text: "khai mạc" }];
  const t = L.plainText(meta, entries);
  assert.ok(t.includes("BIÊN BẢN CUỘC HỌP"));
  assert.ok(t.includes("Họp A"));
  assert.ok(t.includes("Ông X"));
  assert.ok(t.includes("khai mạc"));
  assert.ok(t.includes("CHỦ TRÌ"));
});
test("plainText: người nói rỗng → 'Ý kiến N'", () => {
  const meta = { title: "H", date: "", time: "", place: "", chair: "", sec: "", att: "" };
  const entries = [{ id: "1", time: "08:05", speaker: "", text: "nội dung" }];
  const t = L.plainText(meta, entries);
  assert.ok(t.includes("Ý kiến 1"));
});
test("plainText: không có nội dung vẫn không lỗi (ca xấu)", () => {
  const meta = { title: "", date: "", time: "", place: "", chair: "", sec: "", att: "" };
  assert.doesNotThrow(() => L.plainText(meta, []));
});

// ---------- wordHtml ----------
test("wordHtml: Times New Roman + tiêu đề + khối ký", () => {
  const meta = { company: "LAVIPCO", title: "Họp A", date: "2026-10-08", time: "08:00",
                 place: "P.Họp", chair: "Ông X", sec: "Bà Y", att: "" };
  const entries = [{ id: "1", time: "08:05", speaker: "Ông X", text: "khai mạc" }];
  const h = L.wordHtml(meta, entries);
  assert.ok(/Times New Roman/i.test(h));
  assert.ok(h.includes("BIÊN BẢN CUỘC HỌP"));
  assert.ok(h.includes("THƯ KÝ") && h.includes("CHỦ TRÌ"));
});
test("wordHtml: có Quốc hiệu - Tiêu ngữ theo chuẩn NĐ30", () => {
  const meta = { company: "LAVIPCO", title: "T", date: "", time: "", place: "", chair: "", sec: "", att: "" };
  const h = L.wordHtml(meta, [{ id: "1", time: "08:00", speaker: "A", text: "x" }]);
  assert.ok(h.includes("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM"));
  assert.ok(h.includes("Độc lập - Tự do - Hạnh phúc"));
});
test("plainText: có Quốc hiệu - Tiêu ngữ", () => {
  const meta = { company: "LAVIPCO", title: "T", date: "", time: "", place: "", chair: "", sec: "", att: "" };
  const t = L.plainText(meta, [{ id: "1", time: "08:00", speaker: "A", text: "x" }]);
  assert.ok(t.includes("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM"));
  assert.ok(t.includes("Độc lập - Tự do - Hạnh phúc"));
});
test("wordHtml: thoát ký tự đặc biệt trong nội dung (ca xấu)", () => {
  const meta = { title: "T", date: "", time: "", place: "", chair: "", sec: "", att: "" };
  const entries = [{ id: "1", time: "08:05", speaker: "A", text: "1 < 2 & 3 > 0" }];
  const h = L.wordHtml(meta, entries);
  assert.ok(h.includes("1 &lt; 2 &amp; 3 &gt; 0"));
  assert.ok(!h.includes("1 < 2 & 3 > 0"));
});
