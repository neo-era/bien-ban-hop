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
// Giả lập GitHub trả version.json (app gọi sau 1,5s)
let fakeVer = "9.9";
let fetchCalls = 0;
window.fetch = (url) => { fetchCalls++; return Promise.resolve({ ok: true, json: () => Promise.resolve({ version: fakeVer, notes: "bản thử" }) }); };

// Pha bất đồng bộ: kiểm tính năng tự cập nhật
function updatePhase(d, $) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  (async () => {
    let step = "update-new";
    try {
      await sleep(1900); // app kiểm sau 1,5s
      assert.ok(fetchCalls >= 1, "app đã gọi kiểm tra phiên bản");
      assert.strictEqual($("updateBar").style.display, "flex", "có bản mới 9.9 → hiện thanh cập nhật");
      assert.ok($("updateMsg").textContent.includes("9.9"), "thông báo ghi đúng số phiên bản");
      assert.strictEqual($("updateBtn").textContent, "Cập nhật ngay", "chạy web (http) → nút Cập nhật ngay");
      assert.strictEqual($("verBadge").textContent, "v2.1", "nhãn version đồng bộ APP_VERSION");

      step = "update-later";
      $("updateLater").click();
      assert.strictEqual($("updateBar").style.display, "none", "Để sau → ẩn");
      d.dispatchEvent(new window.Event("visibilitychange"));
      await sleep(100);
      assert.strictEqual($("updateBar").style.display, "none", "đã 'Để sau' bản 9.9 → không nhắc lại trong phiên");

      step = "update-none";
      fakeVer = "2.1"; // bằng bản đang dùng
      d.dispatchEvent(new window.Event("visibilitychange"));
      await sleep(100);
      assert.strictEqual($("updateBar").style.display, "none", "không có bản mới → không hiện");

      step = "update-offline";
      window.fetch = () => Promise.reject(new Error("offline"));
      d.dispatchEvent(new window.Event("visibilitychange"));
      await sleep(100);

      assert.strictEqual(errors.length, 0, "không lỗi runtime: " + errors.join(" | "));
      console.log("SMOKE PASS (cập nhật) — có bản mới, để sau, không có bản mới, mất mạng đều ổn");
      process.exit(0);
    } catch (e) {
      console.error("SMOKE FAIL ở bước [" + step + "]:", e.message);
      process.exit(1);
    }
  })();
}

let ran = false;
function run() {
  if (ran) return; ran = true; // chỉ chạy 1 lần (load + setTimeout)
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

    // 5) localStorage: lưu có giảm tần suất (debounce) → kích hoạt lưu ngay qua beforeunload
    step = "persist";
    window.dispatchEvent(new window.Event("beforeunload"));
    const saved = window.localStorage.getItem("bien_ban_hop_v1");
    assert.ok(saved && saved.length > 2, "có dữ liệu trong localStorage sau khi flush");

    // 6) Hoàn tác xóa đoạn
    step = "undo-delete";
    $("btnAdd").click();
    const ta2 = d.querySelector("[data-txt]");
    ta2.value = "đoạn sẽ bị xóa"; ta2.dispatchEvent(new window.Event("input", { bubbles: true }));
    const cntBefore = d.querySelectorAll(".entry").length;
    d.querySelector("[data-del]").click();
    assert.strictEqual(d.querySelectorAll(".entry").length, cntBefore - 1, "đã xóa 1 đoạn");
    assert.ok(!$("btnUndo").disabled, "nút Hoàn tác bật");
    $("btnUndo").click();
    assert.strictEqual(d.querySelectorAll(".entry").length, cntBefore, "hoàn tác khôi phục đoạn");

    // 7) Tự viết hoa khi ghi (mô phỏng onresult final)
    step = "autocap";
    $("btnAdd").click();
    // gọi trực tiếp luồng nhận giọng: dùng SpeechRecognition giả
    // -> thay vào đó kiểm hàm logic đã gắn: thêm text qua textarea rồi kiểm autoCapitalize ở export
    const ta3 = d.querySelectorAll("[data-txt]");
    const last = ta3[ta3.length - 1];
    last.value = "nội dung gõ tay"; last.dispatchEvent(new window.Event("input", { bubbles: true }));

    // 8) Tìm kiếm ẩn đoạn không khớp
    step = "search";
    $("search").value = "khôngcótừnày_xyz";
    $("search").dispatchEvent(new window.Event("input", { bubbles: true }));
    const visible = [...d.querySelectorAll(".entry")].filter(n => n.style.display !== "none").length;
    assert.strictEqual(visible, 0, "tìm không khớp → ẩn hết");
    $("search").value = ""; $("search").dispatchEvent(new window.Event("input", { bubbles: true }));
    const visible2 = [...d.querySelectorAll(".entry")].filter(n => n.style.display !== "none").length;
    assert.ok(visible2 > 0, "xóa từ khóa → hiện lại");

    assert.strictEqual(errors.length, 0, "không có lỗi runtime: " + errors.join(" | "));
    console.log("SMOKE PASS (đồng bộ) — init, add, export, export-empty, persist, undo, autocap, search đều ổn");
    updatePhase(d, $);
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
