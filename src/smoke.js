"use strict";
// Smoke test giao diện bằng jsdom: tải trang, mô phỏng thao tác, bắt lỗi runtime.
const fs = require("fs");
const { JSDOM } = require("jsdom");
const assert = require("node:assert");

const html = fs.readFileSync(__dirname + "/../index.html", "utf8");
const errors = [];
const dom = new JSDOM(html, {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  url: "http://localhost/",
});
const { window } = dom;
window.addEventListener("error", (e) => errors.push(String(e.error || e.message)));
// localStorage stub (jsdom có sẵn, nhưng chắc chắn)
if (!window.localStorage) {
  const store = {};
  window.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = String(v)), removeItem: (k) => delete store[k] };
}
// Bắt URL.createObjectURL để chặn tải file thật, ghi lại nội dung đã "tải"
const downloads = [];
window.URL.createObjectURL = () => "blob:fake";
window.URL.revokeObjectURL = () => {};
// Chặn click tải file: ghi lại thay vì thực thi
const origCreate = window.document.createElement.bind(window.document);
window.HTMLAnchorElement.prototype.click = function () { downloads.push(this.download); };

function run() {
  const d = window.document;
  const $ = (id) => d.getElementById(id);
  let step = "init";
  try {
    // 1) Tải trang không lỗi; không hỗ trợ SpeechRecognition → phải có banner
    step = "init-render";
    assert.ok($("entries").textContent.includes("Chưa có nội dung"), "empty state hiển thị");
    assert.ok($("banner").classList.contains("show"), "banner báo không hỗ trợ nhận giọng (jsdom không có SR)");
    assert.strictEqual($("statusTxt").textContent, "Sẵn sàng", "trạng thái ban đầu Sẵn sàng");

    // 2) Thêm đoạn + gõ tay
    step = "add-entry";
    $("btnAdd").click();
    const ta = d.querySelector("[data-txt]");
    assert.ok(ta, "có textarea sau khi Thêm đoạn");
    ta.value = "Nội dung thử nghiệm <b>in đậm</b> & ký tự lạ";
    ta.dispatchEvent(new window.Event("input", { bubbles: true }));
    const spk = d.querySelector("[data-spk]");
    spk.value = "Ô. Mai Vũ Lâm";
    spk.dispatchEvent(new window.Event("input", { bubbles: true }));

    // 3) Điền tiêu đề rồi xuất Word + txt → phải tạo đúng tên file, không lỗi
    step = "export";
    $("mTitle").value = "Họp kiểm thử";
    $("mTitle").dispatchEvent(new window.Event("input", { bubbles: true }));
    $("btnWord").click();
    $("btnTxt").click();
    assert.ok(downloads.some((n) => /\.docx$/.test(n)), "đã tải .docx (không phải .doc-HTML)");
    assert.ok(!downloads.some((n) => /\.doc$/.test(n)), "không rơi vào fallback .doc");
    assert.ok(downloads.some((n) => /\.txt$/.test(n)), "đã tải .txt");
    assert.ok(downloads.some((n) => n.includes("Họp_kiểm_thử")), "tên file theo tiêu đề");

    // 4) Xuất khi KHÔNG có nội dung (ca xấu): xóa hết rồi bấm Word → không tải, không lỗi
    step = "export-empty";
    window.confirm = () => true;
    $("btnClear").click();
    const before = downloads.length;
    $("btnWord").click();
    assert.strictEqual(downloads.length, before, "không tải khi rỗng");
    assert.ok($("entries").textContent.includes("Chưa có nội dung"), "về empty state sau Xóa hết");

    // 5) localStorage: nạp lại từ dữ liệu đã lưu
    step = "persist";
    const saved = window.localStorage.getItem("bien_ban_hop_v1");
    assert.ok(saved && saved.length > 2, "có dữ liệu trong localStorage");

    assert.strictEqual(errors.length, 0, "không có lỗi runtime: " + errors.join(" | "));
    console.log("SMOKE PASS — các bước: init, add-entry, export, export-empty, persist đều ổn");
    console.log("downloads ghi nhận:", downloads);
  } catch (e) {
    console.error("SMOKE FAIL ở bước [" + step + "]:", e.message);
    if (errors.length) console.error("runtime errors:", errors);
    process.exit(1);
  }
}
// đợi script trong trang chạy xong
if (window.document.readyState === "complete") run();
else window.addEventListener("load", run);
setTimeout(run, 200);
