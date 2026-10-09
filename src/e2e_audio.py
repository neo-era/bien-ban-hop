# E2E thật trên Chromium: micro giả + SpeechRecognition giả.
# Kiểm: ghi âm song song, mốc nghe lại, tua đúng chỗ (webm không có duration),
#       lưu IndexedDB qua tải lại trang, Kết luận/Phân công, xuất .docx.
import asyncio, os, sys, zipfile, io
from playwright.async_api import async_playwright

HTML = "file://" + os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "index.html"))

FAKE_SR = r"""
(() => {
  // Bộ nhận giọng giả: phát câu theo lịch, đúng cấu trúc sự kiện của Web Speech API
  const SCRIPT = [
    [600,  "khai mạc cuộc họp", false], [1800, "khai mạc cuộc họp", true],
    [4200, "báo cáo tiến độ khảo sát", false], [5400, "báo cáo tiến độ khảo sát", true],
    [7600, "thống nhất triển khai quý bốn", false], [8800, "thống nhất triển khai quý bốn", true],
  ];
  class FakeSR {
    constructor(){ this.timers=[]; }
    start(){
      const t0 = performance.now() - (window.__srElapsed||0);
      window.__srStart = t0;
      SCRIPT.forEach(([at, text, fin]) => {
        const wait = at - (performance.now() - t0);
        if (wait < 0) return;
        this.timers.push(setTimeout(() => {
          const r = [{0:{transcript:text}, isFinal:fin, length:1}];
          this.onresult && this.onresult({ resultIndex:0, results:r });
        }, wait));
      });
    }
    stop(){ window.__srElapsed = performance.now() - window.__srStart; this.timers.forEach(clearTimeout); setTimeout(()=>this.onend&&this.onend(),10); }
    abort(){ this.stop(); }
  }
  window.SpeechRecognition = FakeSR; window.webkitSpeechRecognition = FakeSR;
  window.fetch = () => Promise.reject(new Error("offline")); // không gọi mạng khi test
})();
"""

def ok(cond, msg):
    print(("  ✅ " if cond else "  ❌ ") + msg)
    if not cond: ok.fail += 1
ok.fail = 0

async def main():
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            "/tmp/claude-0/e2e_profile", headless=True, accept_downloads=True,
            args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream",
                  "--autoplay-policy=no-user-gesture-required"])
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.on("dialog", lambda d: asyncio.ensure_future(d.accept("Bà Nguyễn Thị Hồng A")))
        await page.add_init_script(FAKE_SR)
        await page.goto(HTML); await page.wait_for_timeout(800)

        print("1) Ghi + ghi âm song song")
        await page.click("#btnRec"); await page.wait_for_timeout(3000)
        st = await page.text_content("#statusTxt")
        ok("ghi âm" in st, f"trạng thái: '{st}'")
        await page.click("#btnSpeaker"); await page.wait_for_timeout(3200)
        await page.click("#btnKL"); await page.wait_for_timeout(3300)
        await page.click("#btnRec")  # tạm dừng
        await page.wait_for_timeout(1500)

        texts = await page.eval_on_selector_all("[data-txt]", "els=>els.map(e=>e.value)")
        print("   các đoạn:", texts)
        ok(len(texts) == 3, "có 3 đoạn (ý kiến, ý kiến người 2, kết luận)")
        ok(texts and texts[0].startswith("Khai mạc"), "tự viết hoa đầu câu")
        ok(await page.locator(".entry.k-ketluan").count() == 1 and "Thống nhất" in texts[-1], "câu nói rơi đúng vào mục KẾT LUẬN")
        spk = await page.eval_on_selector_all("[data-spk]", "els=>els.map(e=>e.value)")
        ok("Bà Nguyễn Thị Hồng A" in spk, "đổi người nói ghi đúng tên")

        print("2) Nút ▶ + tua đúng chỗ")
        vis = await page.eval_on_selector_all("[data-play]", "els=>els.map(e=>e.style.display!=='none')")
        ok(all(vis) and len(vis) == 3, f"cả 3 đoạn có nút ▶ ({vis})")
        ok(await page.is_visible("#playerBar"), "hiện thanh nghe lại")
        plays = page.locator("[data-play]")
        await plays.nth(1).click(); await page.wait_for_timeout(1800)
        st2 = await page.evaluate("()=>{const a=document.getElementById('player');return {t:a.currentTime,p:a.paused,d:a.duration,src:a.src.slice(0,5)}}")
        print("   player:", st2)
        ok(st2["src"] == "blob:", "nguồn phát là bản ghi trong máy")
        ok(not st2["p"], "đang phát")
        # đoạn 2 bắt đầu ~4.2s → tua về ~2.2s rồi phát ~1.8s → khoảng 2.5–6s
        ok(2.0 <= st2["t"] <= 6.5, f"tua đúng vùng đoạn 2 (t={st2['t']:.1f}s, kỳ vọng ~2–6s)")
        await plays.nth(0).click(); await page.wait_for_timeout(800)
        t0 = await page.evaluate("()=>document.getElementById('player').currentTime")
        ok(t0 < 2.5, f"bấm ▶ đoạn 1 → tua về đầu (t={t0:.1f}s)")

        print("3) Tải lại trang — ghi âm còn trong máy")
        await page.reload(); await page.wait_for_timeout(1500)
        vis2 = await page.eval_on_selector_all("[data-play]", "els=>els.map(e=>e.style.display!=='none')")
        ok(len(vis2) == 3 and all(vis2), f"sau tải lại vẫn có ▶ ({vis2})")
        await page.locator("[data-play]").nth(2).click(); await page.wait_for_timeout(1500)
        st3 = await page.evaluate("()=>{const a=document.getElementById('player');return {t:a.currentTime,p:a.paused}}")
        ok(not st3["p"] and st3["t"] > 4.0, f"phát lại đoạn Kết luận sau tải lại (t={st3['t']:.1f}s)")

        print("4) Phân công + xuất Word")
        await page.click("#btnPC"); await page.wait_for_timeout(200)
        last = page.locator(".entry.k-phancong").last
        await last.locator("[data-txt]").fill("Lập dự toán")
        await last.locator("[data-who]").fill("Tổ dự toán")
        await last.locator("[data-due]").fill("20/10/2026")
        async with page.expect_download() as dl:
            await page.click("#btnWord")
        d = await dl.value
        path = await d.path()
        ok(d.suggested_filename.endswith(".docx"), f"tải {d.suggested_filename}")
        xml = zipfile.ZipFile(path).read("word/document.xml").decode()
        ok("KẾT LUẬN CUỘC HỌP" in xml and "Thống nhất triển khai" in xml, "Word có mục Kết luận")
        ok("PHÂN CÔNG NHIỆM VỤ" in xml and "Tổ dự toán" in xml and "20/10/2026" in xml, "Word có bảng Phân công")

        print("5) Tải file ghi âm")
        async with page.expect_download() as dl2:
            await page.click("#btnDlAudio")
        a = await dl2.value
        ap = await a.path()
        size = os.path.getsize(ap)
        ok(a.suggested_filename.endswith((".webm", ".ogg", ".m4a")) and size > 5000, f"tải {a.suggested_filename} ({size} byte)")

        print("6) Cuộc họp mới → chỉ tải ghi âm của cuộc mới (cuộc cũ giữ lại để Hoàn tác)")
        page.remove_listener("dialog", page.listeners("dialog")[0]) if hasattr(page, "listeners") else None
        await page.click("#btnClear"); await page.wait_for_timeout(300)
        await page.click("#btnRec"); await page.wait_for_timeout(2500); await page.click("#btnRec"); await page.wait_for_timeout(800)
        async with page.expect_download() as dl3:
            await page.click("#btnDlAudio")
        a3 = await dl3.value
        ok("_ghi_am." in a3.suggested_filename, f"chỉ còn 1 file ghi âm mới ({a3.suggested_filename})")

        ok(not errs, f"không lỗi JS ({errs[:2]})")
        await ctx.close()
    print("\nKẾT QUẢ:", "ĐẠT" if ok.fail == 0 else f"{ok.fail} mục chưa đạt")
    sys.exit(1 if ok.fail else 0)

asyncio.run(main())
