# Thiết kế — Web app biên bản họp bằng giọng nói

## 1. Mục tiêu
Một trang HTML đơn, mở bằng Chrome, nói tiếng Việt → máy gõ thành text, tổ chức
thành biên bản và xuất file Word (.doc) chuẩn LAVIPCO.

## 2. Kiến trúc
- 1 file `index.html` tự chứa (HTML + CSS + JS, không cần server/cài đặt).
- Phần **logic thuần** (không đụng DOM/trình duyệt) tách riêng để test bằng Node:
  `src/logic.js`. File HTML nhúng lại đúng các hàm này.
- Phần **UI + nhận giọng nói** (Web Speech API, DOM, localStorage) chỉ chạy trong
  trình duyệt, kiểm chứng thủ công.

## 3. Dữ liệu
- `meta`: {company, title, date(iso), time, place, chair, sec, att}
- `entries`: [ {id, time("HH:MM"), speaker, text} ] — mỗi đoạn một người nói/mục.

## 4. Module & hàm thuần (test được)
| Hàm | Vào → Ra | Ghi chú |
|-----|----------|---------|
| `fmtTime(sec)` | số giây → "MM:SS"/"HH:MM:SS" | đồng hồ |
| `dmy(iso)` | "2026-10-08" → "ngày 08 tháng 10 năm 2026" | rỗng → "" |
| `esc(s)` | chuỗi → chuỗi an toàn HTML | chống vỡ Word/XSS |
| `appendText(cur, chunk)` | ghép đoạn mới vào text cũ | 1 khoảng trắng, trim |
| `extractSpeech(results, idx)` | kết quả nhận diện → {finalText, interim} | lõi onresult |
| `bodyLines(entries)` | lọc đoạn có nội dung | bỏ đoạn rỗng |
| `fileStem(meta)` | → tên file an toàn | thiếu tiêu đề → "cuoc_hop" |
| `plainText(meta, entries)` | → biên bản dạng .txt | người nói rỗng → "Ý kiến N" |
| `wordHtml(meta, entries)` | → HTML cho .doc | Times New Roman, khối ký |

## 5. Hàm chỉ chạy trên trình duyệt (kiểm chứng thủ công)
- `buildRec()`: cấu hình SpeechRecognition (lang vi-VN, continuous, interimResults).
- Auto-restart khi `onend` mà vẫn đang ghi (chống Chrome tự ngắt sau khoảng lặng).
- Xử lý lỗi: not-allowed (quyền micro), network (rớt mạng), no-speech/aborted (bỏ qua).
- localStorage: lưu/nạp; bọc try/catch để không vỡ khi bị chặn.

## 6. Rủi ro & cách chặn
- Chrome ngắt nhận diện giữa chừng → auto-restart trong onend.
- Không hỗ trợ Web Speech API → báo rõ, vẫn cho gõ tay + xuất.
- Không cấp quyền micro → banner chỉ cách bật.
- Ký tự đặc biệt trong text → `esc()` trước khi nhúng Word.
- Mất dữ liệu khi reload → localStorage + cảnh báo beforeunload.

## 7. Thứ tự làm
B2 test (logic.js) → B3 code logic + dựng HTML → B4 review → B5 kiểm chứng.

---

## 8. Cách chạy test (tái lập)
Cần Node ≥ 18. Trong thư mục `src`:
- `node --test test.js` → test lõi `logic.js` (23 ca).
- `node --test test_inline.js` → test đúng khối logic **nhúng trong index.html**
  (trích tự động, chống lệch khi chép tay).
- `node src/smoke.js` (chạy từ thư mục gốc) → smoke test giao diện bằng jsdom:
  tải trang, thêm đoạn, gõ tay, xuất Word/txt, chặn xuất khi rỗng, tự lưu.
Khi sửa logic trong `index.html`, chạy lại `test_inline.js` để chắc không lệch.

## 9. Bài học & cạm bẫy (đã xử lý)
- **Web Speech API tự ngắt** sau khoảng lặng → phải tự khởi động lại trong `onend`.
  Nhưng restart trần dễ **kẹt "ghi giả"** nếu `start()` ném lỗi → dùng `tryStart()`
  có đếm số lần + giãn cách (backoff 400ms→5s), quá 10 lần thì hạ trạng thái + báo.
- **Lỗi `network`/`audio-capture`** (rớt mạng/mất micro) không được nuốt — phải hiện
  banner để người dùng biết; khi có lại thì tự chạy tiếp và tắt banner.
- **Đè mất chữ đang gõ**: khi ô text của đoạn đang ghi đang được focus thì KHÔNG
  gán `.value` (tránh nhảy con trỏ & nuốt IME tiếng Việt); nhả focus mới đồng bộ.
- **XSS/vỡ Word**: mọi trường người dùng + cả `e.time` (nạp từ localStorage) phải
  `esc()` trước khi nhúng innerHTML/Word.
- **`localStorage` lỗi im lặng** (đầy/ẩn danh) → cảnh báo để xuất Word kịp.
- **.doc = HTML + namespace Word**, font Times New Roman, khối ký bằng `<table>`;
  Word/LibreOffice mở được (đã kiểm bằng convert PDF).

## 10. Nợ kỹ thuật & hướng mở rộng (Bước 7)
- `render()` dựng lại toàn bộ DOM mỗi lần → nên render tăng dần nếu biên bản rất dài
  (hàng trăm đoạn). Hiện không ảnh hưởng lúc ghi (onresult không gọi render).
- Chưa phân biệt người nói tự động (giới hạn của 1 luồng micro) — tách thủ công.
- Phụ thuộc internet + Chrome. Hướng mở rộng nếu cần offline: dùng PhoWhisper/
  Transformers.js (nặng hơn), hoặc thu âm rồi nạp file để chuyển sau.
- Có thể thêm: chèn mục nghị quyết/kết luận riêng, đánh số điều, xuất PDF trực tiếp.

## 11. Nhật ký thay đổi
- v1.2: thêm Quốc hiệu – Tiêu ngữ (góc phải) + tên công ty (góc trái) theo bố cục 2 cột
  chuẩn NĐ 30/2020, có đường kẻ dưới mỗi khối. Quốc hiệu cỡ 12pt + nowrap để gọn 1 dòng
  trong MS Word (LibreOffice preview có thể ngắt do không honor bề rộng cột).
- v1.0: bản đầu (nói→text, tách người nói, sửa tay, xuất Word/txt, tự lưu).
- v1.1: tự xin quyền micro + GPS khi mở; nút "📍 GPS" lấy toạ độ điền vào Địa điểm
  kèm link Google Maps. Lưu ý: micro & GPS cần **secure context** (HTTPS như GitHub
  Pages, hoặc localhost/file://); trình duyệt yêu cầu thao tác người dùng để hiện prompt,
  nên app xin lại quyền ở lần chạm đầu tiên nếu lúc mở bị chặn.
