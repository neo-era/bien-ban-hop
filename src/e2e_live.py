# E2E Chromium thật: nói → ra chữ trực tiếp (SpeechRecognition giả), KHÔNG ghi âm.
import asyncio, os, sys, zipfile
from playwright.async_api import async_playwright

HTML = "file://" + os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "index.html"))
INIT = r"""
(() => {
  const SCRIPT = [[500,"khai mạc cuộc",false],[900,"khai mạc cuộc họp",false],[1500,"khai mạc cuộc họp",true],
                  [3600,"báo cáo tiến độ",true],[6000,"thống nhất triển khai quý bốn",true]];
  class FakeSR { constructor(){this.t=[];}
    start(){const t0=performance.now()-(window.__srE||0);window.__srS=t0;
      SCRIPT.forEach(([at,tx,fin])=>{const w=at-(performance.now()-t0);if(w<0)return;
        this.t.push(setTimeout(()=>this.onresult&&this.onresult({resultIndex:0,results:[{0:{transcript:tx},isFinal:fin,length:1}]}),w));});}
    stop(){window.__srE=performance.now()-window.__srS;this.t.forEach(clearTimeout);setTimeout(()=>this.onend&&this.onend(),10);}
    abort(){this.stop();} }
  window.SpeechRecognition=FakeSR; window.webkitSpeechRecognition=FakeSR;
  window.fetch=()=>Promise.reject(new Error("offline"));
  window.__recorders=0;
  if (window.MediaRecorder){ const R=window.MediaRecorder; window.MediaRecorder=function(...a){window.__recorders++;return new R(...a);}; window.MediaRecorder.isTypeSupported=R.isTypeSupported; }
  window.__streams=[]; const g=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia=(c)=>g(c).then(s=>{window.__streams.push(s);return s;});
})();
"""
fails = 0
def ok(c, m):
    global fails
    print(("  ✅ " if c else "  ❌ ") + m)
    if not c: fails += 1

async def main():
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context("/tmp/claude-0/e2e_live", headless=True, accept_downloads=True,
            args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
        page = ctx.pages[0]; errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.on("dialog", lambda d: asyncio.ensure_future(d.accept("Bà Nguyễn Thị Hồng A")))
        await page.add_init_script(INIT)
        # Giả lập máy đã dùng v2.2: có sẵn database ghi âm cũ
        await page.goto(HTML)
        await page.evaluate("""()=>new Promise(r=>{const q=indexedDB.open('bien_ban_audio',1);
          q.onupgradeneeded=()=>{q.result.createObjectStore('segs',{keyPath:'id'});q.result.createObjectStore('chunks',{autoIncrement:true});};
          q.onsuccess=()=>{q.result.close();r();};})""")
        await page.reload(); await page.wait_for_timeout(1200)

        print("1) Dọn ghi âm cũ của v2.2")
        dbs = await page.evaluate("()=>indexedDB.databases?indexedDB.databases().then(l=>l.map(d=>d.name)):[]")
        ok("bien_ban_audio" not in dbs, f"database ghi âm cũ đã xóa ({dbs})")
        ok(await page.locator("#optRec").count() == 0 and await page.locator("#playerBar").count() == 0, "không còn tùy chọn/thanh ghi âm")

        print("2) Nói → ra chữ trực tiếp")
        await page.click("#btnRec"); await page.wait_for_timeout(1000)
        live = await page.text_content("#liveTxt")
        ok("khai mạc" in live, f"chữ tạm hiện ngay khi đang nói: '{live}'")
        st = await page.text_content("#statusTxt")
        ok(st == "Đang ghi", f"trạng thái '{st}' (không còn '+ ghi âm')")
        await page.wait_for_timeout(1000)
        await page.click("#btnSpeaker"); await page.wait_for_timeout(2200)
        await page.click("#btnKL"); await page.wait_for_timeout(2600)
        ok(await page.evaluate("()=>window.__recorders") == 0, "không tạo bộ ghi âm nào")
        await page.click("#btnStop"); await page.wait_for_timeout(800)
        texts = await page.eval_on_selector_all("[data-txt]", "e=>e.map(x=>x.value)")
        print("   các đoạn:", texts)
        ok(texts == ["Khai mạc cuộc họp", "Báo cáo tiến độ", "Thống nhất triển khai quý bốn"], "đủ 3 đoạn, viết hoa đầu câu, đúng thứ tự")
        ok(await page.locator(".entry.k-ketluan").count() == 1, "câu chốt rơi vào mục KẾT LUẬN")
        ok(await page.locator("[data-play]").count() == 0, "không còn nút ▶")
        livemic = await page.evaluate("()=>window.__streams.filter(s=>s.getTracks().some(t=>t.readyState==='live')).length")
        ok(livemic == 0, f"Kết thúc → không micro nào còn mở ({livemic})")

        print("3) Phân công + xuất Word")
        await page.click("#btnPC"); await page.wait_for_timeout(200)
        last = page.locator(".entry.k-phancong").last
        await last.locator("[data-txt]").fill("Lập dự toán")
        await last.locator("[data-who]").fill("Tổ dự toán")
        await last.locator("[data-due]").fill("20/10/2026")
        async with page.expect_download() as dl:
            await page.click("#btnWord")
        d = await dl.value
        xml = zipfile.ZipFile(await d.path()).read("word/document.xml").decode()
        ok(d.suggested_filename.endswith(".docx"), d.suggested_filename)
        ok("KẾT LUẬN CUỘC HỌP" in xml and "PHÂN CÔNG NHIỆM VỤ" in xml and "Tổ dự toán" in xml, "Word có Kết luận + bảng Phân công")
        ok("Bà Nguyễn Thị Hồng A" in xml, "tên người nói vào Word")

        print("4) Tải lại trang — nội dung còn")
        await page.reload(); await page.wait_for_timeout(1000)
        ok(await page.locator(".entry").count() == 4, "4 đoạn vẫn còn")

        ok(not errs, f"không lỗi JS {errs[:2]}")
        await ctx.close()
    print("\nKẾT QUẢ:", "ĐẠT" if fails == 0 else f"{fails} mục chưa đạt")
    sys.exit(1 if fails else 0)

asyncio.run(main())
