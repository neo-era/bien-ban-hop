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

// ---------- createSpeechTracker (chống lặp chữ, v2.4) ----------
const R = (...xs) => xs.map(([t, f]) => ({ transcript: t, isFinal: !!f }));

test("tracker: máy tính — câu chốt nối tiếp như extractSpeech cũ (A4)", () => {
  const tr = L.createSpeechTracker({ cumulative: false });
  assert.deepStrictEqual(tr.feed(R(["hôm nay", false]), 0), { finalText: "", interim: "hôm nay" });
  assert.strictEqual(tr.feed(R(["hôm nay họp", true]), 0).finalText, "hôm nay họp");
  const r = tr.feed(R(["hôm nay họp", true], ["tiến độ", true], ["chậm", false]), 1);
  assert.deepStrictEqual(r, { finalText: "tiến độ", interim: "chậm" });
});
test("tracker: gửi lại câu đã chốt ở cùng vị trí → không ghi lần 2 (A1)", () => {
  const tr = L.createSpeechTracker({ cumulative: false });
  tr.feed(R(["một", true]), 0);
  assert.strictEqual(tr.feed(R(["một", true], ["hai", true]), 1).finalText, "hai");
  assert.strictEqual(tr.feed(R(["một", true], ["hai", true]), 1).finalText, "");
  assert.strictEqual(tr.feed(R(["một", true], ["hai", true]), 0).finalText, "");
});
test("tracker: trùng vị trí nhưng khác nội dung → vẫn ghi (Chrome đặt mọi câu ở vị trí 0)", () => {
  const tr = L.createSpeechTracker({ cumulative: false });
  assert.strictEqual(tr.feed(R(["khai mạc cuộc họp", true]), 0).finalText, "khai mạc cuộc họp");
  assert.strictEqual(tr.feed(R(["báo cáo tiến độ", true]), 0).finalText, "báo cáo tiến độ");
});
test("tracker: trùng chỉ khác hoa thường/dấu câu/khoảng trắng → vẫn coi là lặp", () => {
  const tr = L.createSpeechTracker({ cumulative: false });
  tr.feed(R(["Đồng ý.", true]), 0);
  assert.strictEqual(tr.feed(R(["  đồng   ý ", true]), 0).finalText, "");
});
test("tracker Android: gửi dồn → chỉ thêm phần mới, giữ chữ gốc (A2)", () => {
  const tr = L.createSpeechTracker({ cumulative: true });
  assert.strictEqual(tr.feed(R(["Hôm nay họp", true]), 0).finalText, "Hôm nay họp");
  assert.strictEqual(tr.feed(R(["Hôm nay họp", true], ["hôm nay họp về Sapulico", true]), 1).finalText, "về Sapulico");
  assert.strictEqual(tr.feed(R(["Hôm nay họp", true], ["hôm nay họp về Sapulico", true],
    ["hôm nay họp về Sapulico, tiến độ chậm", true]), 2).finalText, "tiến độ chậm");
});
// Review độc lập v2.4: thà lặp còn hơn MẤT CHỮ → chỉ cắt khi có bằng chứng gửi dồn
// (câu trước nằm ngay trước, trong cùng danh sách kết quả) và khớp TRỌN câu trước.
test("tracker Android: câu mới chỉ trùng phần đầu câu trước → không mất chữ", () => {
  const tr = L.createSpeechTracker({ cumulative: true });
  tr.feed(R(["giao cho anh Tuấn", true]), 0);
  assert.strictEqual(tr.feed(R(["giao cho anh Hùng làm báo cáo", true]), 0).finalText, "giao cho anh Hùng làm báo cáo");
  const t2 = L.createSpeechTracker({ cumulative: true });
  t2.feed(R(["giao cho anh Tuấn", true]), 0);
  assert.strictEqual(t2.feed(R(["giao cho anh Tuấn", true], ["giao cho anh Hùng làm báo cáo", true]), 1).finalText, "giao cho anh Hùng làm báo cáo");
});
test("tracker Android: mỗi câu ở vị trí 0, câu mới mở đầu bằng câu trước → giữ nguyên", () => {
  const tr = L.createSpeechTracker({ cumulative: true });
  tr.feed(R(["vâng", true]), 0);
  assert.strictEqual(tr.feed(R(["vâng em hiểu rồi", true]), 0).finalText, "vâng em hiểu rồi");
  tr.feed(R(["anh Hùng", true]), 0);
  assert.strictEqual(tr.feed(R(["anh Hùng phụ trách quận 8", true]), 0).finalText, "anh Hùng phụ trách quận 8");
});
test("tracker: không cắt thì giữ nguyên văn câu (dấu câu, ký hiệu) như bản cũ (A4)", () => {
  const tr = L.createSpeechTracker({ cumulative: true });
  assert.strictEqual(tr.feed(R(["Xin chào - mọi người…", true]), 0).finalText, "Xin chào - mọi người…");
});
test("tracker Android: lặp thật ở câu mới → giữ nguyên (A3)", () => {
  const tr = L.createSpeechTracker({ cumulative: true });
  tr.feed(R(["anh thấy sao", true]), 0);
  assert.strictEqual(tr.feed(R(["được được", true]), 0).finalText, "được được");
  assert.strictEqual(tr.feed(R(["được rồi làm luôn", true]), 0).finalText, "được rồi làm luôn");
});
test("tracker Android: câu trước ngắn (<3 từ) chỉ khớp một phần → không cắt bừa", () => {
  const tr = L.createSpeechTracker({ cumulative: true });
  tr.feed(R(["vâng ạ", true]), 0);
  assert.strictEqual(tr.feed(R(["vâng em hiểu", true]), 0).finalText, "vâng em hiểu");
});
test("tracker: reset() khi phiên mới → câu đầu phiên mới không bị coi là lặp (A5)", () => {
  const tr = L.createSpeechTracker({ cumulative: true });
  tr.feed(R(["tiếp tục", true]), 0);
  tr.reset();
  assert.strictEqual(tr.feed(R(["tiếp tục", true]), 0).finalText, "tiếp tục");
});
test("tracker: ca xấu — rỗng/null/câu chốt rỗng không vỡ", () => {
  const tr = L.createSpeechTracker({ cumulative: true });
  assert.deepStrictEqual(tr.feed([], 0), { finalText: "", interim: "" });
  assert.deepStrictEqual(tr.feed(null, 0), { finalText: "", interim: "" });
  assert.strictEqual(tr.feed(R(["   ", true], ["...", true]), 0).finalText, "");
  assert.strictEqual(tr.feed(R(["ok", true]), 0).finalText, "ok");
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

// ---------- autoCapitalize ----------
test("autoCapitalize: viết hoa đầu chuỗi", () => {
  assert.strictEqual(L.autoCapitalize("xin chào các anh"), "Xin chào các anh");
});
test("autoCapitalize: viết hoa sau dấu kết câu", () => {
  assert.strictEqual(L.autoCapitalize("khai mạc. báo cáo tiến độ"), "Khai mạc. Báo cáo tiến độ");
  assert.strictEqual(L.autoCapitalize("xong chưa? rồi nhé"), "Xong chưa? Rồi nhé");
});
test("autoCapitalize: giữ nguyên chữ đã hoa, không phá giữa từ", () => {
  assert.strictEqual(L.autoCapitalize("Dùng đèn LED mới"), "Dùng đèn LED mới");
});
test("autoCapitalize: rỗng/null an toàn", () => {
  assert.strictEqual(L.autoCapitalize(""), "");
  assert.strictEqual(L.autoCapitalize(null), "");
});

// ---------- parseDict / applyDict ----------
test("parseDict: đọc 'sai=đúng' mỗi dòng, bỏ dòng trống/sai", () => {
  const d = L.parseDict("led=LED\nthgt = THGT\n\nxxx\n= bỏ");
  assert.strictEqual(d.length, 2);
  assert.deepStrictEqual(d[0], { from: "led", to: "LED" });
  assert.deepStrictEqual(d[1], { from: "thgt", to: "THGT" });
});
test("applyDict: thay thế không phân biệt hoa thường, theo từ", () => {
  const d = [{ from: "led", to: "LED" }, { from: "thgt", to: "THGT" }];
  assert.strictEqual(L.applyDict("thay den led va thgt", d), "thay den LED va THGT");
  assert.strictEqual(L.applyDict("Led sáng", d), "LED sáng");
});
test("applyDict: không thay giữa từ khác", () => {
  const d = [{ from: "led", to: "LED" }];
  assert.strictEqual(L.applyDict("bледa khong dung", d), "bледa khong dung");
  assert.strictEqual(L.applyDict("sled", d), "sled"); // 'led' trong 'sled' không đổi
});
test("applyDict: từ điển rỗng → giữ nguyên", () => {
  assert.strictEqual(L.applyDict("abc", []), "abc");
  assert.strictEqual(L.applyDict("abc", null), "abc");
});

// ---------- cmpVersion ----------
test("cmpVersion: so sánh đúng theo từng phần số", () => {
  assert.strictEqual(L.cmpVersion("2.1", "2.0"), 1);
  assert.strictEqual(L.cmpVersion("2.0", "2.1"), -1);
  assert.strictEqual(L.cmpVersion("2.0", "2.0"), 0);
});
test("cmpVersion: không so theo chữ cái (2.10 > 2.9)", () => {
  assert.strictEqual(L.cmpVersion("2.10", "2.9"), 1);
});
test("cmpVersion: khác số phần (2.1 > 2 ; 2.0.1 > 2.0)", () => {
  assert.strictEqual(L.cmpVersion("2.1", "2"), 1);
  assert.strictEqual(L.cmpVersion("2.0.1", "2.0"), 1);
});
test("cmpVersion: chịu được rỗng/rác", () => {
  assert.strictEqual(L.cmpVersion("", "1.0"), -1);
  assert.strictEqual(L.cmpVersion("1.0", ""), 1);
  assert.strictEqual(L.cmpVersion("", ""), 0);
});

// ---------- sections (Kết luận / Phân công) ----------
const MIX = [
  { id: "1", time: "08:00", speaker: "Ô. A", text: "ý kiến thường" },
  { id: "2", time: "08:10", kind: "ketluan", text: "Thống nhất triển khai quý 4" },
  { id: "3", time: "08:12", kind: "phancong", text: "Lập dự toán", who: "Tổ dự toán", due: "15/10" },
  { id: "4", time: "08:13", kind: "ketluan", text: "   " },          // rỗng → bỏ
  { id: "5", time: "08:14", kind: "phancong", text: "", who: "" },     // rỗng → bỏ
  { id: "6", time: "08:15", speaker: "", text: "ý kiến 2" },
];
test("sections: tách đúng 3 nhóm, bỏ mục rỗng", () => {
  const s = L.sections(MIX);
  assert.deepStrictEqual(s.notes.map((e) => e.id), ["1", "6"]);
  assert.deepStrictEqual(s.conclusions.map((e) => e.id), ["2"]);
  assert.deepStrictEqual(s.tasks.map((e) => e.id), ["3"]);
});
test("sections: danh sách rỗng/null an toàn", () => {
  const s = L.sections(null);
  assert.strictEqual(s.notes.length + s.conclusions.length + s.tasks.length, 0);
});
test("plainText: Ý kiến N chỉ đếm trên ý kiến thường, không đếm Kết luận/Phân công", () => {
  const t = L.plainText({ title: "T" }, MIX);
  assert.ok(t.includes("Ý kiến 2"), "ý kiến không tên thứ 2 trong nhóm thường");
  assert.ok(!t.includes("Ý kiến 3"));
});
test("plainText: có mục KẾT LUẬN và PHÂN CÔNG đủ người + hạn", () => {
  const t = L.plainText({ title: "T" }, MIX);
  assert.ok(t.includes("KẾT LUẬN CUỘC HỌP"));
  assert.ok(t.includes("1. Thống nhất triển khai quý 4"));
  assert.ok(t.includes("PHÂN CÔNG NHIỆM VỤ"));
  assert.ok(t.includes("Lập dự toán") && t.includes("Tổ dự toán") && t.includes("15/10"));
});
test("plainText: không có Kết luận/Phân công → không in tiêu đề mục rỗng", () => {
  const t = L.plainText({ title: "T" }, [{ id: "1", speaker: "A", text: "x" }]);
  assert.ok(!t.includes("KẾT LUẬN CUỘC HỌP"));
  assert.ok(!t.includes("PHÂN CÔNG NHIỆM VỤ"));
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

// ---------- Địa điểm từ GPS (v2.4) ----------
test("checkFix: tọa độ hợp lệ trong Việt Nam", () => {
  assert.strictEqual(L.checkFix(10.7655, 106.6115, 20).ok, true);
  assert.strictEqual(L.checkFix(21.0278, 105.8342).ok, true); // không có sai số vẫn nhận
});
test("checkFix: 0,0 / ngoài VN / sai số >1km / rác → không nhận (G2)", () => {
  assert.strictEqual(L.checkFix(0, 0, 10).ok, false);
  assert.strictEqual(L.checkFix(48.85, 2.35, 10).ok, false);
  assert.strictEqual(L.checkFix(10.7655, 106.6115, 1500).ok, false);
  assert.strictEqual(L.checkFix(NaN, 106.6, 10).ok, false);
  assert.strictEqual(L.checkFix(null, undefined).ok, false);
});
test("provinceName: chuẩn hóa tên tỉnh/thành phố", () => {
  assert.strictEqual(L.provinceName("Thành phố Hồ Chí Minh"), "Thành phố Hồ Chí Minh");
  assert.strictEqual(L.provinceName("Ho Chi Minh City"), "Thành phố Hồ Chí Minh");
  assert.strictEqual(L.provinceName("Hà Nội"), "Thành phố Hà Nội");
  assert.strictEqual(L.provinceName("Tỉnh Đồng Nai"), "Tỉnh Đồng Nai");
  assert.strictEqual(L.provinceName("Đồng Nai"), "Tỉnh Đồng Nai");
  assert.strictEqual(L.provinceName(""), "");
});
test("wardName: giữ tiền tố có sẵn, thiếu thì mặc định Phường", () => {
  assert.strictEqual(L.wardName("Xã Nhuận Đức"), "Xã Nhuận Đức");
  assert.strictEqual(L.wardName("phường Bến Thành"), "Phường Bến Thành");
  assert.strictEqual(L.wardName("Đặc khu Côn Đảo"), "Đặc khu Côn Đảo");
  assert.strictEqual(L.wardName("Bình Trị Đông"), "Phường Bình Trị Đông");
  assert.strictEqual(L.wardName(""), "");
});
test("parsePhoton: lấy số nhà/đường/phường/tỉnh; bỏ tên địa danh không phải đường", () => {
  const p = L.parsePhoton({ features: [{ properties: { osm_key: "highway", name: "Hẻm 639/73/4 Hương Lộ 2",
    locality: "Khu phố 25", district: "Bình Trị Đông", city: "Thành phố Hồ Chí Minh" } }] });
  assert.deepStrictEqual(p, { house: "", street: "Hẻm 639/73/4 Hương Lộ 2", ward: "Bình Trị Đông", province: "Thành phố Hồ Chí Minh" });
  const q = L.parsePhoton({ features: [{ properties: { osm_key: "leisure", name: "Quach Thi Trang Square",
    housenumber: "", district: "Ben Thanh", city: "Ho Chi Minh City" } }] });
  assert.strictEqual(q.street, "");
  const r = L.parsePhoton({ features: [{ properties: { housenumber: "247", street: "Đường Thống Nhất",
    district: "Thông Tây Hội", state: "Tỉnh Đồng Nai", city: "Biên Hòa" } }] });
  assert.strictEqual(r.province, "Tỉnh Đồng Nai"); // ưu tiên state (tỉnh), city có thể là TP cũ đã giải thể
  assert.strictEqual(L.parsePhoton({}), null);
  assert.strictEqual(L.parsePhoton(null), null);
});
test("parseOverpass: lấy phường/xã (cấp 6) + tỉnh (cấp 4); nhiều phường → không đoán", () => {
  const one = { elements: [{ tags: { admin_level: "4", name: "Thành phố Hồ Chí Minh" } }, { tags: { admin_level: "6", name: "Phường Bình Trị Đông" } }] };
  assert.deepStrictEqual(L.parseOverpass(one), { ward: "Phường Bình Trị Đông", province: "Thành phố Hồ Chí Minh" });
  const two = { elements: [{ tags: { admin_level: "6", name: "Phường A" } }, { tags: { admin_level: "6", name: "Phường B" } }] };
  assert.strictEqual(L.parseOverpass(two).ward, "");
  assert.deepStrictEqual(L.parseOverpass({}), { ward: "", province: "" });
});
test("formatPlace: số nhà + đường, Phường, Tỉnh/TP — không quận/huyện (G3)", () => {
  assert.strictEqual(L.formatPlace({ house: "", street: "Hẻm 639/73/4 Hương Lộ 2", ward: "Bình Trị Đông", province: "Thành phố Hồ Chí Minh" }),
    "Hẻm 639/73/4 Hương Lộ 2, Phường Bình Trị Đông, Thành phố Hồ Chí Minh");
  assert.strictEqual(L.formatPlace({ house: "247", street: "Đường Thống Nhất", ward: "Phường Thông Tây Hội", province: "Ho Chi Minh City" }),
    "247 Đường Thống Nhất, Phường Thông Tây Hội, Thành phố Hồ Chí Minh");
  assert.strictEqual(L.formatPlace({ ward: "Xã Nhuận Đức", province: "Thành phố Hồ Chí Minh" }), "Xã Nhuận Đức, Thành phố Hồ Chí Minh");
});
test("formatPlace: thiếu phường/xã hoặc tỉnh → rỗng (không ghi nửa vời)", () => {
  assert.strictEqual(L.formatPlace({ street: "Hương Lộ 2", ward: "", province: "Thành phố Hồ Chí Minh" }), "");
  assert.strictEqual(L.formatPlace({ ward: "Bình Trị Đông", province: "" }), "");
  assert.strictEqual(L.formatPlace(null), "");
});
test("cleanPlace: gỡ tọa độ thô đã lưu từ bản cũ (G1)", () => {
  assert.strictEqual(L.cleanPlace("GPS 0.000000, 0.000000"), "");
  assert.strictEqual(L.cleanPlace("Phòng họp LAVIPCO (GPS 10.765500, 106.611500)"), "Phòng họp LAVIPCO");
  assert.strictEqual(L.cleanPlace("GPS -1.5, 106.6"), "");
  assert.strictEqual(L.cleanPlace("Phòng họp tầng 3"), "Phòng họp tầng 3");
  assert.strictEqual(L.cleanPlace(""), "");
});

// ---- review độc lập phần GPS (v2.4) ----
test("parsePhoton: phường nằm ở county, hoặc city là đặc khu khi có state", () => {
  assert.strictEqual(L.parsePhoton({ features: [{ properties: { countrycode: "VN", county: "Phường Tân Thành", state: "Tỉnh Cà Mau" } }] }).ward, "Phường Tân Thành");
  assert.strictEqual(L.parsePhoton({ features: [{ properties: { countrycode: "VN", city: "Phú Quốc", state: "Tỉnh An Giang" } }] }).ward, "Phú Quốc");
  // city là tỉnh/TP (không có state) → không lấy làm phường
  assert.strictEqual(L.parsePhoton({ features: [{ properties: { city: "Thành phố Hồ Chí Minh" } }] }).ward, "");
});
test("parsePhoton/parseOverpass: điểm ngoài Việt Nam → bỏ (G2)", () => {
  assert.strictEqual(L.parsePhoton({ features: [{ properties: { countrycode: "KH", district: "Daun Penh", city: "Phnom Penh" } }] }), null);
  const kh = { elements: [{ tags: { admin_level: "2", "ISO3166-1": "KH" } }, { tags: { admin_level: "4", name: "Phnom Penh" } }, { tags: { admin_level: "6", name: "Daun Penh" } }] };
  assert.deepStrictEqual(L.parseOverpass(kh), { ward: "", province: "" });
  const vn = { elements: [{ tags: { admin_level: "2", "ISO3166-1": "VN" } }, { tags: { admin_level: "4", name: "Thành phố Hồ Chí Minh" } }, { tags: { admin_level: "6", name: "Phường Bến Thành" } }] };
  assert.strictEqual(L.parseOverpass(vn).ward, "Phường Bến Thành");
});
test("wardName: tên cấp quận/huyện cũ → rỗng (không bịa 'Phường Quận 1'); P. → Phường; Unicode tổ hợp", () => {
  assert.strictEqual(L.wardName("Quận 1"), "");
  assert.strictEqual(L.wardName("Huyện Củ Chi"), "");
  assert.strictEqual(L.wardName("Thị xã Bến Cát"), "");
  assert.strictEqual(L.wardName("Thành phố Thủ Đức"), "");
  assert.strictEqual(L.wardName("P. Bến Thành"), "Phường Bến Thành");
  assert.strictEqual(L.wardName("Phường Bến Thành".normalize("NFD")), "Phường Bến Thành");
});
test("provinceName: viết tắt / tên tiếng Anh / Thủ đô", () => {
  assert.strictEqual(L.provinceName("TP.HCM"), "Thành phố Hồ Chí Minh");
  assert.strictEqual(L.provinceName("TP. Hồ Chí Minh"), "Thành phố Hồ Chí Minh");
  assert.strictEqual(L.provinceName("Thủ đô Hà Nội"), "Thành phố Hà Nội");
  assert.strictEqual(L.provinceName("Thua Thien Hue"), "Thành phố Huế");
  assert.strictEqual(L.provinceName("Thành phố Hồ Chí Minh".normalize("NFD")), "Thành phố Hồ Chí Minh");
});
test("formatPlace: số nhà so theo từ; có số nhà mà không có đường → bỏ số nhà", () => {
  assert.strictEqual(L.formatPlace({ house: "1", street: "10 Lê Lợi", ward: "Bến Thành", province: "Hồ Chí Minh" }),
    "1 10 Lê Lợi, Phường Bến Thành, Thành phố Hồ Chí Minh");
  assert.strictEqual(L.formatPlace({ house: "10", street: "10 Lê Lợi", ward: "Bến Thành", province: "Hồ Chí Minh" }),
    "10 Lê Lợi, Phường Bến Thành, Thành phố Hồ Chí Minh");
  assert.strictEqual(L.formatPlace({ house: "12", street: "", ward: "Bến Thành", province: "Hồ Chí Minh" }),
    "Phường Bến Thành, Thành phố Hồ Chí Minh");
});
test("cleanPlace: chỉ gỡ đúng dạng bản cũ đã ghi, không ăn chữ khác", () => {
  assert.strictEqual(L.cleanPlace("Trạm GPS 3, 5 Lê Lợi"), "Trạm GPS 3, 5 Lê Lợi");
  assert.strictEqual(L.cleanPlace("Cty AGPS 1,2"), "Cty AGPS 1,2");
  assert.strictEqual(L.cleanPlace("Phòng họp (tầng 2, GPS 10.1, 106.2)"), "Phòng họp (tầng 2, GPS 10.1, 106.2)");
  assert.strictEqual(L.cleanPlace("  GPS 10.765500, 106.611500  "), "");
});
test("datePlace: dòng 'địa danh, ngày…' chỉ lấy Tỉnh/Thành phố (NĐ 30)", () => {
  assert.strictEqual(L.datePlace("Hẻm 639/73/4 Hương Lộ 2, Phường Bình Trị Đông, Thành phố Hồ Chí Minh"), "Thành phố Hồ Chí Minh");
  assert.strictEqual(L.datePlace("Xã Nhuận Đức, Tỉnh Tây Ninh"), "Tỉnh Tây Ninh");
  assert.strictEqual(L.datePlace("Phòng họp LAVIPCO"), "Phòng họp LAVIPCO"); // gõ tay: giữ như cũ
  assert.strictEqual(L.datePlace(""), "");
});
test("plainText/wordHtml: Địa điểm ghi đủ địa chỉ, dòng ngày chỉ có Tỉnh/TP", () => {
  const meta = { title: "Họp", date: "2026-10-09", place: "Hẻm 1 Lê Lợi, Phường Bến Thành, Thành phố Hồ Chí Minh" };
  const html = L.wordHtml(meta, [{ id: "1", time: "08:00", speaker: "A", text: "x" }]);
  assert.ok(html.includes("Thành phố Hồ Chí Minh, ngày 09 tháng 10 năm 2026"));
  assert.ok(!html.includes("Bến Thành, Thành phố Hồ Chí Minh, ngày"));
  assert.ok(html.includes("Hẻm 1 Lê Lợi, Phường Bến Thành, Thành phố Hồ Chí Minh</p>"));
});

// ---------- v2.6: iPhone (Siri) + ghi chữ tạm khi phiên kết thúc ----------
test("flush: chữ tạm chưa chốt được trả về để ghi; gọi lại → rỗng (I2)", () => {
  const tr = L.createSpeechTracker({});
  tr.feed(R(["hôm nay họp", true]), 0);
  tr.feed(R(["hôm nay họp", true], ["tiến độ chậm", false]), 1);
  assert.strictEqual(tr.flush(), "tiến độ chậm");
  assert.strictEqual(tr.flush(), "");
});
test("flush: không có chữ tạm → rỗng; null an toàn", () => {
  const tr = L.createSpeechTracker({});
  assert.strictEqual(tr.flush(), "");
  tr.feed(null, 0);
  assert.strictEqual(tr.flush(), "");
});
test("flush rồi câu chốt y hệt đến trễ (sau Tạm dừng) → không ghi lần 2", () => {
  const tr = L.createSpeechTracker({});
  tr.feed(R(["chốt lại nhé", false]), 0);
  assert.strictEqual(tr.flush(true), "chốt lại nhé");
  assert.strictEqual(tr.feed(R(["Chốt lại nhé.", true]), 0).finalText, "");
});
test("flush rồi câu chốt dài hơn đến trễ → chỉ thêm phần đuôi", () => {
  const tr = L.createSpeechTracker({});
  tr.feed(R(["chốt lại", false]), 0);
  tr.flush(true); // Tạm dừng/Kết thúc
  assert.strictEqual(tr.feed(R(["chốt lại nhé", true]), 0).finalText, "nhé");
});
test("flush rồi câu mới khác hẳn → ghi đủ (không cắt bừa)", () => {
  const tr = L.createSpeechTracker({});
  tr.feed(R(["chốt lại", false]), 0);
  tr.flush();
  assert.strictEqual(tr.feed(R(["sang mục hai", true]), 0).finalText, "sang mục hai");
});
test("iPhone: chữ tạm lớn dần ở cùng vị trí, flush nhiều lần → mỗi lần chỉ phần mới (I3)", () => {
  const tr = L.createSpeechTracker({ cumulative: true, sameIndexGrow: true });
  tr.feed(R(["hôm nay", false]), 0);
  tr.feed(R(["hôm nay họp", false]), 0);
  assert.strictEqual(tr.flush(), "hôm nay họp");
  const r = tr.feed(R(["hôm nay họp về tiến độ", false]), 0);
  assert.strictEqual(r.interim, "về tiến độ"); // thanh "Đang nghe" chỉ hiện phần chưa ghi
  assert.strictEqual(tr.flush(), "về tiến độ");
  assert.strictEqual(tr.feed(R(["hôm nay họp về tiến độ", true]), 0).finalText, ""); // Siri chốt cả câu → đã ghi rồi
});
test("iPhone: câu chốt ở cùng vị trí lớn dần → chỉ thêm phần mới (I3)", () => {
  const tr = L.createSpeechTracker({ cumulative: true, sameIndexGrow: true });
  assert.strictEqual(tr.feed(R(["Hôm nay họp", true]), 0).finalText, "Hôm nay họp");
  assert.strictEqual(tr.feed(R(["Hôm nay họp về Sapulico", true]), 0).finalText, "về Sapulico");
});
test("iPhone: Siri sửa chữ phía trước (không còn khớp trọn) → ghi lại cả câu (thà lặp)", () => {
  const tr = L.createSpeechTracker({ cumulative: true, sameIndexGrow: true });
  tr.feed(R(["kiểm tra đèn lét", true]), 0);
  assert.strictEqual(tr.feed(R(["kiểm tra đèn LED quận 8", true]), 0).finalText, "kiểm tra đèn LED quận 8");
});
test("không bật sameIndexGrow (máy tính/Android): câu mới ở vị trí 0 mở đầu bằng câu trước → giữ nguyên", () => {
  const tr = L.createSpeechTracker({ cumulative: true });
  tr.feed(R(["vâng", true]), 0);
  assert.strictEqual(tr.feed(R(["vâng em hiểu rồi", true]), 0).finalText, "vâng em hiểu rồi");
});
test("reset sau flush → phiên mới không bị cắt theo phần đã flush", () => {
  const tr = L.createSpeechTracker({ cumulative: true, sameIndexGrow: true });
  tr.feed(R(["tiếp tục", false]), 0);
  tr.flush();
  tr.reset();
  assert.strictEqual(tr.feed(R(["tiếp tục bàn", true]), 0).finalText, "tiếp tục bàn");
});

// ---- review độc lập v2.6: không mất câu ngắn, không lặp ----
const IOS = { cumulative: true, sameIndexGrow: true };
test("iPhone: vị trí 0 được dùng lại (có chữ tạm chen giữa) → 'Đồng ý' lần 2 vẫn ghi", () => {
  for (const o of [IOS, {}]) {
    const tr = L.createSpeechTracker(o);
    assert.strictEqual(tr.feed(R(["Đồng ý", true]), 0).finalText, "Đồng ý");
    tr.feed(R(["tiếp", false]), 0);
    assert.strictEqual(tr.feed(R(["Đồng ý", true]), 0).finalText, "Đồng ý");
  }
});
test("iPhone: câu trước ngắn (<3 từ) → câu mới mở đầu bằng nó vẫn giữ đủ", () => {
  let tr = L.createSpeechTracker(IOS);
  tr.feed(R(["Vâng", false]), 0); tr.flush();
  assert.strictEqual(tr.feed(R(["Vâng tôi đồng ý", true]), 0).finalText, "Vâng tôi đồng ý");
  tr = L.createSpeechTracker(IOS);
  tr.feed(R(["Được", true]), 0);
  assert.strictEqual(tr.feed(R(["Được rồi làm tiếp", true]), 0).finalText, "Được rồi làm tiếp");
  tr = L.createSpeechTracker(IOS);
  tr.feed(R(["Đồng ý", true]), 0);
  assert.strictEqual(tr.feed(R(["Đồng ý", true], ["Đồng ý với phương án", true]), 1).finalText, "Đồng ý với phương án");
});
test("flush dùng được bằng chứng gửi dồn (câu chốt ngay trước) → không ghi lặp", () => {
  const tr = L.createSpeechTracker(IOS);
  assert.strictEqual(tr.feed(R(["họp về tiến độ", true], ["họp về tiến độ gói thầu", false]), 0).finalText, "họp về tiến độ");
  assert.strictEqual(tr.flush(), "gói thầu");
  const an = L.createSpeechTracker({ cumulative: true });
  an.feed(R(["xin chào mọi người", true], ["xin chào mọi người hôm nay", false]), 0);
  assert.strictEqual(an.flush(), "hôm nay");
});
test("Tạm dừng khi có nhiều chữ tạm, sau đó Chrome chốt từng phần → không lặp", () => {
  const tr = L.createSpeechTracker({});
  tr.feed(R(["xin chào", false], [" các bạn", false]), 0);
  assert.strictEqual(tr.flush(true), "xin chào các bạn");
  assert.strictEqual(tr.feed(R(["xin chào", true], [" các bạn", false]), 0).finalText, "");
  assert.strictEqual(tr.flush(true), "");
});
test("đang ghi (không phải Tạm dừng): câu mới nằm trong phần vừa flush vẫn ghi", () => {
  const tr = L.createSpeechTracker(IOS);
  tr.feed(R(["đồng ý với phương án", false]), 0); tr.flush();
  assert.strictEqual(tr.feed(R(["phương án", true]), 0).finalText, "phương án");
});

// ---------- v2.7: dấu chấm, phẩy ----------
test("voicePunct: đọc lệnh → dấu, dính vào chữ trước (P1)", () => {
  assert.strictEqual(L.voicePunct("hôm nay họp dấu phẩy tiến độ chậm dấu chấm"), "hôm nay họp, tiến độ chậm.");
  assert.strictEqual(L.voicePunct("anh thấy sao dấu chấm hỏi"), "anh thấy sao?");
  assert.strictEqual(L.voicePunct("anh thấy sao dấu hỏi"), "anh thấy sao?");
  assert.strictEqual(L.voicePunct("tuyệt vời dấu chấm than"), "tuyệt vời!");
  assert.strictEqual(L.voicePunct("gồm dấu hai chấm A và B"), "gồm: A và B");
  assert.strictEqual(L.voicePunct("thứ nhất dấu chấm phẩy thứ hai"), "thứ nhất; thứ hai");
  assert.strictEqual(L.voicePunct("mục một xuống dòng mục hai"), "mục một\nmục hai");
  assert.strictEqual(L.voicePunct("Dấu Phẩy"), ",");
});
test("voicePunct: không nhầm chữ thường (P2)", () => {
  assert.strictEqual(L.voicePunct("chấm điểm và chấm công"), "chấm điểm và chấm công");
  assert.strictEqual(L.voicePunct("tỉ lệ hai chấm năm"), "tỉ lệ hai chấm năm");
  assert.strictEqual(L.voicePunct("ba phẩy năm mét"), "ba phẩy năm mét");
  assert.strictEqual(L.voicePunct("dấu hiệu tốt"), "dấu hiệu tốt");
  assert.strictEqual(L.voicePunct(""), "");
});
test("autoPeriod: thêm '.' nếu đoạn chưa kết thúc bằng dấu (P3)", () => {
  assert.strictEqual(L.autoPeriod("tiến độ chậm"), "tiến độ chậm.");
  assert.strictEqual(L.autoPeriod("tiến độ chậm  "), "tiến độ chậm.");
  for (const s of ["a.", "a,", "a?", "a!", "a:", "a;", "a…", "a\n"]) assert.strictEqual(L.autoPeriod(s), s);
  assert.strictEqual(L.autoPeriod(""), "");
});
test("appendText: không chèn khoảng trắng trước dấu / sau xuống dòng", () => {
  assert.strictEqual(L.appendText("hôm nay họp", ", tiến độ"), "hôm nay họp, tiến độ");
  assert.strictEqual(L.appendText("hôm nay họp", "."), "hôm nay họp.");
  assert.strictEqual(L.appendText("mục một\n", "mục hai"), "mục một\nmục hai");
  assert.strictEqual(L.appendText("mục một", "\nmục hai"), "mục một\nmục hai");
});
test("autoCapitalize: viết hoa sau xuống dòng (P4)", () => {
  assert.strictEqual(L.autoCapitalize("mục một\nmục hai. xong"), "Mục một\nMục hai. Xong");
});
test("tidyText: viết hoa đầu câu khi xuất, sửa khoảng trắng quanh dấu (P7)", () => {
  assert.strictEqual(L.tidyText("hôm nay họp. tiến độ chậm? đúng vậy! tiếp"), "Hôm nay họp. Tiến độ chậm? Đúng vậy! Tiếp");
  assert.strictEqual(L.tidyText("mục một\nmục hai"), "Mục một\nMục hai");
  assert.strictEqual(L.tidyText("họp ,tiến độ . xong"), "Họp, tiến độ. Xong");
  assert.strictEqual(L.tidyText("xong.tiếp theo"), "Xong. Tiếp theo");
  assert.strictEqual(L.tidyText("đạt 3,5 tỷ và 1.000 bộ đèn"), "Đạt 3,5 tỷ và 1.000 bộ đèn");
  assert.strictEqual(L.tidyText("trụ sở TP.HCM"), "Trụ sở TP.HCM");
  assert.strictEqual(L.tidyText("  "), "");
  assert.strictEqual(L.tidyText("... đang chờ"), "... Đang chờ");
});

// ---- review độc lập v2.7 ----
test("'xuống dòng' nói riêng một đoạn → không mất (bật hay tắt tự chấm)", () => {
  assert.strictEqual(L.autoPeriod("\n"), "\n");
  assert.strictEqual(L.appendText("Abc.", "\n"), "Abc.\n");
  assert.strictEqual(L.appendText("Abc.\n", "mục hai"), "Abc.\nmục hai");
});
test("voicePunct: không ăn chữ 'đánh/đóng/con dấu…', 'xuống dòng sông'", () => {
  for (const s of ["đánh dấu chấm điểm", "con dấu chấm đỏ", "đóng dấu chấm hết", "đánh dấu hỏi", "có dấu phẩy ở đây",
    "thuyền xuống dòng sông", "đi xuống dòng suối"]) assert.strictEqual(L.voicePunct(s), s);
  assert.strictEqual(L.voicePunct("đã đánh dấu xong dấu chấm"), "đã đánh dấu xong.");
});
test("appendText: đoạn mới mở đầu bằng dấu → thay dấu cuối cũ, không lặp '..' / '.,'", () => {
  assert.strictEqual(L.appendText("Abc.", ". Abc"), "Abc. Abc");
  assert.strictEqual(L.appendText("Abc.", ", xyz"), "Abc, xyz");
  assert.strictEqual(L.appendText("Abc", "?"), "Abc?");
});
test("appendText: đoạn đầu tiên mở đầu bằng dấu → bỏ dấu thừa", () => {
  assert.strictEqual(L.appendText("", ", abc."), "abc.");
});
test("capChunk: chỉ viết hoa phần máy vừa nghe, không đụng phần gõ tay (P5)", () => {
  assert.strictEqual(L.capChunk("ghi chú:\n- a\nb tay", "thêm ý. hai"), "thêm ý. Hai");
  assert.strictEqual(L.capChunk("", ", abc"), ", Abc");
  assert.strictEqual(L.capChunk("Xong.", "tiếp theo"), "Tiếp theo");
  assert.strictEqual(L.capChunk("Xong.\n", "mục hai"), "Mục hai");
  assert.strictEqual(L.capChunk("đang nói", "tiếp"), "tiếp");
});
test("tidyText: không phá URL, email, tên file, v.v., số", () => {
  for (const s of ["Xem www.google.com nhé", "Gửi abc@gmail.com nhé", "Link https://a.vn/x nhé", "Web lavipco.vn nhé",
    "Ở tp.hcm nhé", "Các việc v.v. và", "Mở file .docx nhé", "Giá .5 triệu", "Lúc 8:30 sáng"]) assert.strictEqual(L.tidyText(s), s);
});
test("tidyText: không viết hoa sau viết tắt / dấu ba chấm; không đổi chữ cố ý viết thường", () => {
  assert.strictEqual(L.tidyText("Tại TP. hồ chí minh"), "Tại TP. hồ chí minh");
  assert.strictEqual(L.tidyText("Ông A. nói"), "Ông A. nói");
  assert.strictEqual(L.tidyText("Đợi... rồi"), "Đợi... rồi");
  assert.strictEqual(L.tidyText("iPhone mới"), "iPhone mới");
  assert.strictEqual(L.tidyText("Mua eVN"), "Mua eVN");
  assert.strictEqual(L.tidyText("a) mục một\nb) mục hai"), "a) mục một\nb) mục hai");
  assert.strictEqual(L.tidyText("xong rồi đó. sau đó"), "Xong rồi đó. Sau đó");
});
test("capChunk: đoạn mở đầu bằng dấu phẩy thay dấu chấm cũ → không viết hoa chữ sau phẩy", () => {
  assert.strictEqual(L.capChunk("Họp về tiến độ.", ", nhất là gói ba."), ", nhất là gói ba.");
  assert.strictEqual(L.capChunk("Họp về tiến độ", "? anh thấy sao"), "? Anh thấy sao");
});

// ---------- v2.8: Quốc hiệu căn giữa, bỏ tên công ty ở đầu ----------
test("plainText/wordHtml: Quốc hiệu ở đầu, căn giữa, không in tên công ty", () => {
  const meta = { company: "LAVIPCO", title: "T", date: "", time: "", place: "", chair: "", sec: "", att: "" };
  const e = [{ id: "1", time: "08:00", speaker: "A", text: "x" }];
  const t = L.plainText(meta, e), h = L.wordHtml(meta, e);
  assert.ok(!t.slice(0, t.indexOf("BIÊN BẢN CUỘC HỌP")).includes("LAVIPCO") && !h.slice(0, h.indexOf("BIÊN BẢN CUỘC HỌP")).includes("LAVIPCO"));
  assert.ok(/^\s*CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM/.test(t));
  assert.ok(/text-align:center[^>]*>\s*<b[^>]*>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM/.test(h));
  assert.ok(!h.slice(0, h.indexOf("BIÊN BẢN CUỘC HỌP")).includes("<table width=\"100%\""));
});
test("wordHtml: dòng địa danh, ngày tháng căn phải", () => {
  const h = L.wordHtml({ title: "T", date: "2026-10-09", place: "Thành phố Hồ Chí Minh" }, [{ id: "1", time: "08:00", speaker: "A", text: "x" }]);
  assert.ok(/\.sub\{[^}]*text-align:right/.test(h));
});

test("placeLine: Tên đơn vị đưa vào dòng Địa điểm", () => {
  const c = "Công ty TNHH Kỹ Nghệ Lâm Việt Phát", p = "63/23A Liên Khu 16-18, Phường Bình Trị Đông, Thành phố Hồ Chí Minh";
  assert.strictEqual(L.placeLine({ company: c, place: p }), c + ", " + p);
  assert.strictEqual(L.placeLine({ company: c, place: "" }), c);
  assert.strictEqual(L.placeLine({ company: "", place: p }), p);
  assert.strictEqual(L.placeLine({ company: "lavipco", place: "Phòng họp LAVIPCO" }), "Phòng họp LAVIPCO");
  assert.strictEqual(L.placeLine({ company: "  ", place: "  " }), "");
  assert.strictEqual(L.placeLine(null), "");
});
test("plainText/wordHtml: dòng Địa điểm có tên đơn vị; dòng ngày vẫn chỉ Tỉnh/TP", () => {
  const meta = { company: "Công ty A", title: "T", date: "2026-10-09", place: "Hẻm 1, Phường Bến Thành, Thành phố Hồ Chí Minh" };
  const e = [{ id: "1", time: "08:00", speaker: "A", text: "x" }];
  assert.ok(L.plainText(meta, e).includes("Địa điểm: Công ty A, Hẻm 1, Phường Bến Thành, Thành phố Hồ Chí Minh"));
  const h = L.wordHtml(meta, e);
  assert.ok(h.includes("<b>Địa điểm:</b> Công ty A, Hẻm 1"));
  assert.ok(h.includes(">Thành phố Hồ Chí Minh, ngày 09 tháng 10 năm 2026<"));
  assert.ok(L.plainText({ company: "Công ty A", title: "T" }, e).includes("Địa điểm: Công ty A"));
});
