# Biên bản họp bằng giọng nói

Web app ghi **biên bản cuộc họp trực tiếp** cho tiếng Việt: nói → máy tự gõ thành
text, tách người nói, sửa tay, và xuất **biên bản Word (.doc)** chuẩn (Times New Roman,
có khối ký Thư ký / Chủ trì), kèm `.txt` và sao chép.

## Dùng
Mở `index.html` bằng **Google Chrome** (máy tính hoặc Android), cho phép micro khi được hỏi.
- Cần **internet** (nhận giọng nói dùng công cụ sẵn của Chrome) và **Chrome** (Safari/Firefox chưa hỗ trợ tốt tiếng Việt).
- Dữ liệu tự lưu trong trình duyệt; không gửi đi đâu.

## Cấu trúc
- `index.html` — toàn bộ app (1 file, chạy standalone).
- `src/logic.js` — lõi xử lý thuần (ghép text, xuất Word/txt…), có test.
- `src/test.js`, `src/test_inline.js` — kiểm thử tự động (23 ca × 2).
- `src/smoke.js` — smoke test giao diện bằng jsdom.
- `THIET_KE.md` — thiết kế, bài học, nợ kỹ thuật.

## Chạy test
```bash
npm install        # cần cho smoke test (jsdom)
npm test           # 46/46 ca (logic.js + bản nhúng trong index.html)
npm run smoke      # kiểm giao diện
```
