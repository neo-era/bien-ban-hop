# E2E tái hiện các lỗi reviewer độc lập đã nêu cho v2.2 — phải ĐẠT hết mới phát hành.
import asyncio, os, sys, json
from playwright.async_api import async_playwright

HTML = "file://" + os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "index.html"))

INIT = r"""
(() => {
  // --- SpeechRecognition giả, kịch bản đặt được từ test qua window.__setScript ---
  window.__script = [[600,"khai mạc",false],[1500,"khai mạc",true],[3000,"ý kiến hai",false],[3800,"ý kiến hai",true]];
  window.__setScript = (s) => { window.__script = s; window.__srElapsed = 0; };
  class FakeSR {
    constructor(){ this.timers=[]; }
    start(){ const t0=performance.now()-(window.__srElapsed||0); window.__srStart=t0;
      window.__script.forEach(([at,text,fin])=>{ const w=at-(performance.now()-t0); if(w<0)return;
        this.timers.push(setTimeout(()=>{ this.onresult&&this.onresult({resultIndex:0,results:[{0:{transcript:text},isFinal:fin,length:1}]}); },w)); }); }
    stop(){ window.__srElapsed=performance.now()-window.__srStart; this.timers.forEach(clearTimeout); setTimeout(()=>this.onend&&this.onend(),10); }
    abort(){ this.stop(); }
  }
  window.SpeechRecognition=FakeSR; window.webkitSpeechRecognition=FakeSR;
  window.fetch=()=>Promise.reject(new Error("offline"));
  // --- theo dõi mọi luồng micro được mở; tuỳ chọn làm chậm cấp quyền ---
  window.__streams=[]; const real=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia=(c)=>real(c).then(s=>{window.__streams.push(s);
    const d=+(localStorage.getItem("__gumDelay")||0); return d?new Promise(r=>setTimeout(()=>r(s),d)):s;});
  // --- giả lập "tab bị tắt đột ngột": đồng hồ đã lưu bị cũ (=0) ---
  if (location.search.includes("crashsim")) { try{ const d=JSON.parse(localStorage.getItem("bien_ban_hop_v1")); d.elapsed=0; localStorage.setItem("bien_ban_hop_v1",JSON.stringify(d)); }catch(e){} }
})();
"""

fails = 0
def ok(c, m):
    global fails
    print(("  ✅ " if c else "  ❌ ") + m)
    if not c: fails += 1

async def dl_names(page):
    names = []
    def on(d): names.append(d.suggested_filename)
    page.on("download", on)
    await page.click("#btnDlAudio"); await page.wait_for_timeout(1800)
    page.remove_listener("download", on)
    return names

async def main():
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context("/tmp/claude-0/e2e_rev", headless=True, accept_downloads=True,
            args=["--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream","--autoplay-policy=no-user-gesture-required"])
        page = ctx.pages[0]; errs=[]
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.on("dialog", lambda d: asyncio.ensure_future(d.accept()))
        await page.add_init_script(INIT)
        await page.goto(HTML); await page.wait_for_timeout(1000)

        print("A) Tab tắt đột ngột (đồng hồ lưu = 0) → KHÔNG mất ghi âm")
        await page.click("#btnRec"); await page.wait_for_timeout(5500)   # ghi ~5.5s, KHÔNG tạm dừng
        await page.goto(HTML + "?crashsim=1"); await page.wait_for_timeout(1500)
        timer = await page.text_content("#timer")
        secs = int(timer.split(":")[-1]) + 60*int(timer.split(":")[-2])
        ok(secs >= 4, f"đồng hồ tự khớp lại theo ghi âm ({timer})")
        vis = await page.eval_on_selector_all("[data-play]", "e=>e.map(x=>x.style.display!=='none')")
        ok(len(vis) >= 1 and all(vis), f"▶ vẫn còn trên các đoạn cũ ({vis})")
        await page.click("#btnRec"); await page.wait_for_timeout(2500); await page.click("#btnRec"); await page.wait_for_timeout(800)
        names = await dl_names(page)
        ok(len(names) == 2, f"ghi âm cũ còn nguyên + đoạn mới = 2 file ({names})")

        print("B) Xóa hết lúc đang tạm dừng → cuộc mới không phát tiếng cuộc cũ")
        await page.evaluate("()=>window.__setScript([[500,'cuộc mới',false],[1200,'cuộc mới',true]])")
        await page.click("#btnClear"); await page.wait_for_timeout(400)
        ok(await page.text_content("#timer") == "00:00", "đồng hồ về 0")
        ok(not await page.is_visible("#playerBar"), "không còn thanh nghe lại của cuộc cũ")
        await page.click("#btnRec"); await page.wait_for_timeout(3000); await page.click("#btnRec"); await page.wait_for_timeout(800)
        texts = await page.eval_on_selector_all("[data-txt]", "e=>e.map(x=>x.value)")
        ok(texts == ["Cuộc mới"], f"chỉ có nội dung cuộc mới ({texts})")
        await page.locator("[data-play]").first.click(); await page.wait_for_timeout(1500)
        dur = await page.evaluate("()=>document.getElementById('player').duration")
        ok(dur < 5, f"▶ phát bản ghi của cuộc MỚI (dài {dur:.1f}s, cuộc cũ ~8s)")
        names = await dl_names(page)
        ok(len(names) == 1, f"tải ghi âm chỉ ra file cuộc mới ({names})")

        print("C) Hoàn tác Xóa hết → lấy lại cả ghi âm cuộc cũ")
        # Hoàn tác chỉ áp cho lần Xóa hết gần nhất; trong cuộc mới chưa xoá đoạn nào nên Hoàn tác = khôi phục cuộc cũ
        await page.click("#btnUndo"); await page.wait_for_timeout(600)
        texts = await page.eval_on_selector_all("[data-txt]", "e=>e.map(x=>x.value)")
        ok("Khai mạc" in texts, f"nội dung cuộc cũ quay lại ({texts})")
        vis = await page.eval_on_selector_all("[data-play]", "e=>e.map(x=>x.style.display!=='none')")
        ok(any(vis), "▶ của cuộc cũ hoạt động lại")
        names = await dl_names(page)
        ok(len(names) == 2, f"ghi âm cuộc cũ còn đủ ({names})")

        print("D) Bấm Bắt đầu/Tạm dừng liên tục khi micro chậm cấp quyền → 1 bộ ghi, micro tắt sạch")
        await page.evaluate("()=>{localStorage.setItem('__gumDelay','1500');window.__streams=[];}")
        await page.click("#btnRec"); await page.wait_for_timeout(200)
        await page.click("#btnRec"); await page.wait_for_timeout(200)
        await page.click("#btnRec"); await page.wait_for_timeout(2500)   # cả 2 lời xin quyền đều xong
        live = await page.evaluate("()=>window.__streams.filter(s=>s.getTracks().some(t=>t.readyState==='live')).length")
        ok(live == 1, f"chỉ 1 luồng micro đang mở (thực tế {live})")
        await page.click("#btnStop"); await page.wait_for_timeout(1200)
        live2 = await page.evaluate("()=>window.__streams.filter(s=>s.getTracks().some(t=>t.readyState==='live')).length")
        ok(live2 == 0, f"Kết thúc → micro tắt hết (còn {live2})")
        await page.evaluate("()=>localStorage.removeItem('__gumDelay')")

        print("E) Không cho Xóa hết khi đang ghi")
        await page.click("#btnRec"); await page.wait_for_timeout(800)
        n0 = await page.locator(".entry").count()
        await page.click("#btnClear"); await page.wait_for_timeout(300)
        ok(await page.locator(".entry").count() == n0, "đang ghi → không xoá")
        await page.click("#btnStop"); await page.wait_for_timeout(600)

        ok(not errs, f"không lỗi JS {errs[:2]}")
        await ctx.close()
    print("\nKẾT QUẢ:", "ĐẠT" if fails == 0 else f"{fails} mục chưa đạt")
    sys.exit(1 if fails else 0)

asyncio.run(main())
