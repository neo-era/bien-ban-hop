# Biên bản họp bằng giọng nói

Web app ghi **biên bản cuộc họp trực tiếp** cho tiếng Việt: nói → máy tự gõ thành text, tách người nói,
**ghi âm song song để nghe lại từng đoạn**, chốt **Kết luận / Phân công**, và xuất **biên bản Word (.docx)**
chuẩn (Quốc hiệu – Tiêu ngữ, Times New Roman, bảng phân công, khối ký Thư ký / Chủ trì).

## Dùng
Mở bằng **Google Chrome** (máy tính hoặc Android), cho phép micro khi được hỏi.
- Nhận giọng nói dùng engine của Chrome → cần **internet**. Trên iPhone/Safari: không chuyển thành chữ
  nhưng **vẫn ghi âm** để nghe lại và gõ biên bản sau.
- Nội dung và ghi âm lưu **trong máy** (trình duyệt), không gửi đi đâu. App tự báo khi có phiên bản mới.
- Mẹo: micro hội nghị đa hướng đặt giữa bàn nhận đúng hơn nhiều so với micro điện thoại.

## Cấu trúc
- `index.html` — toàn bộ app (1 file, chạy standalone). **Đừng sửa tay khối logic/docx** — chúng được
  `src/build.js` nhúng nguyên văn từ `src/logic.js` và `src/docx.js`.
- `src/logic.js` — lõi xử lý thuần (ghép text, Kết luận/Phân công, tìm đoạn ghi âm, xuất txt…).
- `src/docx.js` — tạo file .docx (OOXML) thuần, không thư viện.
- `src/test*.js` — kiểm thử tự động; `src/smoke.js` — giao diện (jsdom);
  `src/e2e_*.py` — Chromium thật với micro giả.
- `version.json` — số phiên bản để app tự báo cập nhật.
- `THIET_KE.md` — thiết kế, nhật ký thay đổi, quy trình phát hành.

## Chạy kiểm thử
```bash
npm install        # jsdom cho smoke
npm test           # build + toàn bộ test logic/docx (kể cả bản nhúng trong index.html)
npm run smoke      # giao diện
npm run e2e        # Chromium thật (cần Python + Playwright)
```
