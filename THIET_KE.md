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
- v2.8: Quốc hiệu – Tiêu ngữ căn giữa trang (Word/.doc/.txt); dòng "địa danh, ngày…" căn phải; bỏ tên công ty ở đầu; Tên đơn vị chuyển vào dòng
  "Địa điểm: <Tên đơn vị>, <địa chỉ>" (`placeLine`, có bản sao trong docx.js; không lặp nếu địa chỉ đã chứa tên). Đã kiểm bằng Word thật (xuất PDF).
- v2.7: Dấu câu — đọc lệnh "dấu phẩy/chấm/hỏi/chấm hỏi/chấm than/hai chấm/chấm phẩy", "xuống dòng"; tự thêm dấu
  chấm khi ngắt nghỉ (công tắc trong Tùy chọn nhận dạng); xuất Word/.txt/Sao chép tự viết hoa đầu câu + sửa khoảng
  trắng quanh dấu (không đụng số, URL, viết tắt). Chi tiết: mục 12 "Thiết kế E".
- v2.6: iPhone "câu đầu ghi được, sau đó rất khó nhận dạng": iOS không mở thêm luồng micro (getUserMedia) nữa;
  chữ tạm Siri không chốt → tự ghi khi đứng yên 1,5 s; mọi máy: chữ tạm còn lại khi phiên kết thúc / Tạm dừng /
  Kết thúc được ghi (trước đây mất). Nhật ký chẩn đoán: giữ nhãn phiên bản ~1 s. Chi tiết: mục 12 "Thiết kế D".
- v2.5: Địa điểm từ GPS = địa chỉ cụ thể theo đơn vị hành chính 2 cấp (01/7/2025), không còn "GPS x, y" thô
  (Photon điền nhanh → Overpass chuẩn hóa Phường/Xã/Đặc khu). Từ chối 0,0 / ngoài VN / sai số >1 km; luôn lấy vị trí
  mới (bỏ maximumAge 60 s từng trả lại 0,0 cũ). Tự gỡ tọa độ thô đã lưu từ bản cũ. Dòng "địa danh, ngày…" trong Word
  chỉ ghi Tỉnh/TP (NĐ 30). Chi tiết + kết quả review: mục 12 "Thiết kế C".
- v2.4: (1) Chống lặp chữ — `createSpeechTracker` (logic.js, có test): bỏ câu Chrome gửi lại (trùng vị trí + nội dung);
  Android gửi dồn → chỉ lấy phần mới, nhưng chỉ khi có bằng chứng (thà lặp còn hơn mất chữ — xem mục 12).
  (2) Điện thoại ≤768px: chữ ô nhập 16px (iPhone khỏi tự phóng to), nút/✕ ≥44px. (3) Thanh ghi dính đáy ≤860px
  khi đã bắt đầu ghi: Tạm dừng/Ghi tiếp, Người nói, Kết luận, Phân công. (4) Xoay máy/đổi khổ → tính lại chiều cao
  ô chữ (trước đây bị cắt chữ). Review độc lập bắt 2 ca MẤT CHỮ + 1 ca lặp khi Ghi tiếp nhanh → đã sửa, có test.
- v2.3: BỎ ghi âm theo yêu cầu — chỉ nói → ra chữ trực tiếp (Web Speech, Chrome). Gỡ MediaRecorder/IndexedDB,
  nút ▶, thanh nghe lại, tùy chọn ghi âm, findSegment. Tự xóa database "bien_ban_audio" do v2.2 để lại.
  Giữ: Kết luận/Phân công, khối ký không xé trang, đồng hồ chốt giây + tự lưu ~5s, giữ câu cuối khi dừng,
  không cho Xóa hết khi đang ghi. E2E mới: src/e2e_live.py (kiểm cả việc không tạo bộ ghi âm, micro tắt hẳn).
- v2.2: (1) GHI ÂM SONG SONG + NGHE LẠI: MediaRecorder 24kbps (~10MB/giờ) lưu IndexedDB; mỗi đoạn có nút ▶
  tua đúng lúc người đó nói (mốc aStart lấy từ kết quả tạm đầu tiên). Chạy được cả iPhone (không có nhận giọng
  vẫn ghi âm). Tải file ghi âm. (2) Nút ＋ Kết luận / ＋ Phân công (việc–người–hạn) → Word có mục KẾT LUẬN và
  bảng PHÂN CÔNG kẻ ô. (3) Sửa lỗi khối ký bị xé sang 2 trang (cantSplit + keepNext).
  Review độc lập bắt lỗi nghiêm trọng TRƯỚC khi phát hành, đã sửa + có E2E tái hiện:
  · Không đoán cuộc họp mới bằng đồng hồ=0 (tab tắt đột ngột → xóa sạch ghi âm) → dùng meetingId;
    ghi âm gắn mã cuộc họp; chỉ dọn khi đã >3 cuộc cũ; Hoàn tác Xóa hết lấy lại cả ghi âm.
  · Bấm nhanh khi chờ cấp micro tạo 2 bộ ghi/micro sáng mãi → mã lần gọi (AUD.gen).
  · Mốc đoạn ghi âm lấy lúc THỰC SỰ bắt đầu ghi; đồng hồ chốt giây khi tạm dừng, tự lưu mỗi ~5s;
    mở lại sau khi tắt đột ngột → kéo đồng hồ khớp ghi âm.
  · findSegment trả null ngoài vùng có ghi âm (không phát bừa); nạp ghi âm cũ gộp chứ không đè;
    báo khi IndexedDB đầy (onabort); giữ câu nói cuối khi bấm dừng; lọc ký tự điều khiển trong .docx.
  Build: src/build.js nhúng NGUYÊN VĂN logic.js + docx.js vào index.html (hết chép tay → hết lệch).
- v2.1: tự kiểm tra phiên bản mới (version.json trên GitHub raw) lúc mở, mỗi 30 phút và khi
  quay lại tab. Chạy web (GitHub Pages) → nút "Cập nhật ngay" tải lại ra bản mới (tạm dừng ghi,
  lưu trước). Chạy file trên máy → không tự ghi đè được (giới hạn trình duyệt) → "Mở bản mới" + link tải.
  "Để sau" không nhắc lại bản đó trong phiên. Mất mạng → bỏ qua lặng lẽ. Logic: cmpVersion (có test).
- v2.0 (tối ưu): render tăng dần (không dựng lại cả danh sách → mượt khi họp dài);
  tìm kiếm trong biên bản (giữ hiện đoạn đang ghi); hoàn tác xóa đoạn + xóa hết (undoStack ≤50);
  tự viết hoa đầu câu + từ điển sửa thuật ngữ (áp cho câu máy nhận, đệm chunk khi đang gõ tay
  để không mất/nhảy chữ); tự cuộn theo đoạn đang ghi (chỉ khi đang theo dõi gần cuối);
  lưu localStorage debounce 400ms + flush ở beforeunload/pagehide/visibilitychange.
  Logic mới: autoCapitalize, parseDict, applyDict (có test). Smoke mở rộng: undo, search, autocap.
- v1.3: xuất **.docx chuẩn (OOXML)** thay cho .doc-HTML để ĐIỆN THOẠI mở được
  (Google Docs/WPS/Word mobile từ chối .doc-HTML). Bộ tạo docx thuần, không thư viện
  ngoài: ZIP store + CRC32 + document.xml/styles.xml, có tblGrid + paragraph sau bảng cuối.
  Test: src/test_docx.js. .doc-HTML giữ làm fallback nếu trình duyệt không hỗ trợ.
- v1.2: thêm Quốc hiệu – Tiêu ngữ (góc phải) + tên công ty (góc trái) theo bố cục 2 cột
  chuẩn NĐ 30/2020, có đường kẻ dưới mỗi khối. Quốc hiệu cỡ 12pt + nowrap để gọn 1 dòng
  trong MS Word (LibreOffice preview có thể ngắt do không honor bề rộng cột).
- v1.0: bản đầu (nói→text, tách người nói, sửa tay, xuất Word/txt, tự lưu).
- v1.1: tự xin quyền micro + GPS khi mở; nút "📍 GPS" lấy toạ độ điền vào Địa điểm
  kèm link Google Maps. Lưu ý: micro & GPS cần **secure context** (HTTPS như GitHub
  Pages, hoặc localhost/file://); trình duyệt yêu cầu thao tác người dùng để hiện prompt,
  nên app xin lại quyền ở lần chạm đầu tiên nếu lúc mở bị chặn.


## 12. v2.4 — Chống lặp chữ (Android) + giao diện điện thoại

### Tiêu chí (đã duyệt)
- A1 Chrome gửi lại câu đã chốt ở cùng vị trí → không ghi lần 2.
- A2 Chrome gửi dồn (câu mới = câu cũ + phần mới) → chỉ thêm phần mới.
- A3 Người nói lặp thật ở câu mới ("được, được") → giữ nguyên.
- A4 Chrome máy tính chạy như cũ; test cũ pass.  A5 Sau tự khởi động lại không sót câu.
- B1 Ô nhập ≥16px khi ≤768px.  B2 Nút ≥44×44px trên điện thoại.  B3 Không tràn ngang 375/390/768/1280.
- B4 Máy tính 1280px không đổi.  B5 Không vỡ chức năng.
- Bố cục: thanh ghi dính đáy màn hình trên điện thoại (Tạm dừng/Ghi tiếp, Người nói mới, Kết luận, Phân công).

### Thiết kế A — `createSpeechTracker({cumulative})` trong logic.js (thuần, test được)
- `feed(results, resultIndex)` → `{finalText, interim}`; `reset()` khi bắt đầu phiên nhận diện mới.
- Câu chốt ở vị trí i: chuẩn hóa (thường, bỏ dấu câu, gộp khoảng trắng). **Trùng cả vị trí lẫn nội dung**
  với câu đã nhận ở vị trí đó → bỏ (A1). KHÔNG bỏ chỉ vì trùng vị trí: có bản Chrome đặt mọi câu mới ở vị trí 0
  (e2e_live mô phỏng đúng kiểu này) → bỏ theo vị trí sẽ mất câu thật.
- `cumulative` (bật khi userAgent là Android): chỉ cắt phần đầu khi CÓ BẰNG CHỨNG gửi dồn — câu chốt trước
  nằm ngay trước (vị trí i−1) trong cùng danh sách kết quả, và câu mới mở đầu bằng TRỌN câu đó (A2).
  Không cắt thì trả nguyên văn câu (giữ dấu câu như bản cũ). Máy tính tắt cờ này → hành vi như cũ (A4).
- **Nguyên tắc: thà lặp còn hơn mất chữ.** Bản nháp đầu cho phép khớp n−1 từ ("Chrome sửa từ cuối") và cắt
  khi mọi câu ở vị trí 0 → review độc lập chứng minh MẤT CHỮ ("giao cho anh Tuấn" → "giao cho anh Hùng làm
  báo cáo" mất "Hùng"; "vâng" → "vâng em hiểu rồi" mất "vâng") → đã bỏ cả hai.
- `reset()` chỉ ở `onend` (phiên thật sự kết thúc). Không reset ở `startRec`: bấm Ghi tiếp nhanh trước `onend`
  rồi Chrome gửi lại câu cuối → bị ghi 2 lần.
- Đánh đổi đã chấp nhận: nói lại y hệt câu vừa nói, ở cùng vị trí, trong cùng phiên → bị coi là lặp.
  Kiểu Android mỗi câu ở vị trí 0 mà câu sau chứa trọn câu trước → không cắt được (thà lặp).

### Thiết kế B — CSS `@media(max-width:768px)` + thanh `#mbar`
- Font ô nhập 16px, `.btn`/`.del` min 44px (chỉ trong media query → máy tính không đổi).
- `#mbar` cố định đáy, chỉ hiện ở ≤860px (bố cục 1 cột) khi `body.sess` (đã bắt đầu ghi, chưa Kết thúc/Xóa hết).
  Nút trên thanh gọi lại đúng nút gốc (`click()`) → không nhân đôi logic. Toast + chân trang đẩy lên tránh bị che.
  Hoàn tác "Xóa hết" (đồng hồ > 0) → hiện lại thanh. Tải lại trang → thanh ẩn tới khi bấm Ghi tiếp (cố ý).

### Thiết kế C — Địa điểm từ GPS theo đơn vị hành chính 2 cấp (01/7/2025)
Tiêu chí (đã duyệt): G1 không bao giờ ghi tọa độ thô vào Địa điểm/biên bản · G2 tọa độ 0,0 / ngoài VN /
sai số >1 km → báo, không ghi · G3 "số nhà đường, Phường/Xã/Đặc khu X, Tỉnh/Thành phố Y" (không quận/huyện) ·
G4 Photon hiện ngay, Overpass chạy song song rồi chuẩn hóa phường/xã — chỉ khi chưa sửa tay · G5 lúc mở app không
đè ô đã có chữ, chỉ bấm 📍 mới thay · G6 lỗi mạng → để trống + báo nhập tay, giữ link Google Maps · G7 test cũ pass.

- Hàm thuần (logic.js, có test): `checkFix(lat,lon,acc)`, `parsePhoton(json)`, `parseOverpass(json)`,
  `provinceName(s)`, `wardName(s)`, `formatPlace(parts)`, `cleanPlace(s)` (gỡ "GPS x, y" đã lưu từ bản cũ khi nạp).
- Nguồn (khảo sát 09/10/2026 từ máy anh): Nominatim bị từ chối kết nối → không dùng. Photon
  (`photon.komoot.io/reverse?lang=default`) ~2 s, đã có phường/xã MỚI nhưng hay thiếu tiền tố "Phường/Xã".
  Overpass `is_in` (admin_level 6 = phường/xã, 4 = tỉnh/TP; maps.mail.ru → overpass-api.de) chuẩn nhất, 20 s, hay lỗi.
  BigDataCloud trả nhiều phường cùng lúc gần ranh → bỏ.
- Thiếu tiền tố và Overpass lỗi → mặc định "Phường" (có thể sai ở vùng ven — anh rà lại trước khi xuất).
- Tỉnh/TP thiếu tiền tố: 6 TP trực thuộc TW (Hà Nội, Huế, Hải Phòng, Đà Nẵng, Cần Thơ, Hồ Chí Minh) → "Thành phố", còn lại "Tỉnh".
- Tọa độ được gửi tới Photon/Overpass (OSM) để tra địa chỉ.
- Dòng "địa danh, ngày…" (Word/.doc) chỉ lấy Tỉnh/TP (`datePlace`, có bản sao trong docx.js); mục "Địa điểm:" giữ đủ địa chỉ.
- Bẫy đã gặp: `getCurrentPosition` với `maximumAge:60000` trả lại vị trí 0,0 đã lưu tạm dù GPS đã bắt được → dùng 0.
- Review độc lập (đã sửa, có test): Photon để phường ở `county` (Cà Mau) / đặc khu ở `city` (Phú Quốc); điểm ở
  Campuchia lọt khung tọa độ → kiểm `countrycode` + ISO cấp quốc gia của Overpass; "Quận 1" từng thành "Phường Quận 1";
  "TP.HCM" thành "Tỉnh HCM"; cleanPlace ăn chữ ("Trạm GPS 3, 5 Lê Lợi"); hạn giờ không tính lúc đọc thân.
- Mở app mà tra lỗi → im lặng (không làm phiền mỗi lần mở); bấm 📍 mà lỗi → báo nhập tay.
- Hạn chế còn lại: từ máy anh overpass-api.de trả 406 cho mọi yêu cầu → thực tế chỉ còn maps.mail.ru (~15 s).
  Overpass lỗi + Photon thiếu tiền tố → tạm ghi "Phường" (vd Phú Quốc tạm "Phường", Overpass về mới thành "Đặc khu").

### Thiết kế D — iPhone: "câu đầu ghi được, sau đó rất khó nhận dạng" (v2.6)
Trên iPhone mọi trình duyệt dùng WebKit + nhận dạng của Apple (Siri), khác Chrome. Không giả lập được trên Windows.
Tiêu chí (đã duyệt): I1 iPhone không gọi `getUserMedia` khi bắt đầu/đang ghi · I2 chữ tạm chưa chốt được ghi khi
phiên kết thúc / Tạm dừng / Kết thúc (mọi máy) · I3 iPhone gửi dồn → chỉ thêm phần mới (thà lặp hơn mất chữ) ·
I4 nhật ký chẩn đoán (giữ nhãn phiên bản) để anh gửi về · I5 máy tính/Android không đổi, test cũ pass.
- Nghi vấn 1: `requestMic` mở rồi tắt luồng micro song song lúc nhận giọng nói khởi động → trên iOS tắt luồng đó
  làm phiên âm thanh của Siri bị cắt/yếu sau câu đầu. → iOS bỏ hẳn `requestMic` (Siri tự xin quyền micro).
- Nghi vấn 2: Siri hay để chữ ở dạng tạm (isFinal=false), chữ chỉ hiện ở thanh "Đang nghe…" rồi mất.
  → `tracker.flush()` trả phần chữ tạm chưa ghi; gọi ở onend, Tạm dừng, Kết thúc; riêng iOS còn gọi khi chữ tạm
  đứng yên 1,5 s.
- Sau khi flush, câu chốt/chữ tạm đến sau mà mở đầu bằng TRỌN phần đã flush → chỉ lấy đuôi (chống lặp câu cuối khi
  Chrome gửi trễ). `sameIndexGrow` (chỉ iOS): kết quả ở CÙNG vị trí lớn dần ("A" → "A B") → chỉ lấy đuôi.
- Review độc lập (đã sửa, có test): câu ngắn ("Vâng", "Đồng ý", "Được") bị cắt/bỏ → phần đã ghi <3 từ thì KHÔNG
  cắt (trừ lúc Tạm dừng/Kết thúc = `flush(true)`, khi đó mọi thứ đến sau chỉ là bản gửi trễ); vị trí có chữ tạm mới
  = vị trí bị dùng lại → quên câu chốt cũ ở đó; flush mang theo câu chốt ngay trước làm bằng chứng gửi dồn.
- Tự ghi khi đứng yên: 2,5 s, chỉ khi ≥3 từ, chỉ hẹn lại khi chữ tạm ĐỔI (Siri gửi lặp lúc im lặng). Siri sửa chữ
  sau khi đã tự ghi ("năm giờ" → "5 giờ") → có thể lặp một đoạn (đã chấp nhận: thà lặp).
- Nhật ký: giữ nhãn ~1 s hoặc chạm nhanh 5 lần (iOS giữ lâu dễ thành bôi đen chữ). Nhật ký chứa nội dung lời nói.

### Thiết kế E — Dấu chấm, phẩy (v2.7)
Chrome/Siri trả tiếng Việt không có dấu câu. Anh chọn: đọc lệnh + tự thêm dấu chấm khi ngắt nghỉ.
Tiêu chí (đã duyệt): P1 lệnh "dấu chấm/phẩy/hỏi/chấm hỏi/chấm than/hai chấm/chấm phẩy", "xuống dòng" → dấu, dính
chữ trước · P2 không nhầm "chấm điểm", "chấm công", "hai chấm năm", "phẩy" đứng riêng (lệnh phải có chữ "dấu") ·
P3 tự thêm "." cuối mỗi đoạn máy nghe được nếu chưa có dấu; công tắc trong Tùy chọn, mặc định bật · P4 viết hoa sau
. ? ! và đầu dòng · P5 không đụng phần gõ tay · P6 test cũ pass · P7 khi xuất Word/.txt/Sao chép: viết hoa đầu câu,
bỏ khoảng trắng trước dấu, thêm khoảng trắng sau dấu nếu thiếu — không đụng số (3,5 / 1.000) và viết tắt (TP.HCM);
chỉ chỉnh bản xuất, không đổi nội dung trong app.
- Hàm thuần (logic.js): `voicePunct(text)` (lệnh → dấu, theo từ, cụm dài khớp trước), `autoPeriod(text)`,
  `tidyText(text)` (P7). `appendText` không chèn khoảng trắng trước dấu / sau xuống dòng; `autoCapitalize` viết hoa
  cả sau xuống dòng.
- Xuất: index.html đưa `entries` đã `tidyText` cho cả 3 đường xuất → không phải sửa docx.js.
- Xử lý TỪNG đoạn máy nghe ngay khi đến (`queueChunk`), kể cả lúc anh đang gõ tay → đoạn nào cũng có dấu chấm.
  Viết hoa chỉ phần máy vừa nghe (`capChunk`), không chạy lại trên cả ô → không đụng chữ gõ tay (P5).
- Review độc lập (đã sửa, có test): "xuống dòng" nói riêng bị mất; "đánh/đóng/con/có dấu chấm…", "xuống dòng sông"
  bị biến thành dấu; lặp dấu ".." / ".," khi đoạn sau mở bằng lệnh (dấu đọc lệnh thay dấu cuối cũ); xuất Word phá
  URL/email/tên file/v.v. và viết hoa sau "TP." "A." "..."; đổi "iPhone" → "IPhone", "a) mục" → "A) mục".
  Tự kiểm thêm: "tiến độ, Nhất là" (viết hoa sau phẩy thay chấm) → sửa.
- Hạn chế: iPhone tự ghi khi đứng yên có thể tách "dấu | chấm" nếu người nói ngừng giữa lệnh >2,5 s → ra chữ thường.

## 13. Quy trình phát hành bản mới (để app tự báo cập nhật)
1. Sửa `APP_VERSION` trong index.html (nhãn trên header tự theo).
2. Sửa `version.json` → `"version"` cùng số + `"notes"` mô tả ngắn.
3. `npm test` + `npm run smoke` + `npm run e2e` → pass hết.
4. Commit + push nhánh `sub1`. Máy đang mở app sẽ thấy thông báo trong ≤30 phút hoặc khi mở lại.
