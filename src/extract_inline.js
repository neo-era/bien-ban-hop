// Trích khối logic NHÚNG trong ../index.html ra logic_inline.js để test_inline.js kiểm
// đúng mã đang chạy trong app (không phải bản src).
const fs = require("fs");
const html = fs.readFileSync(__dirname + "/../index.html", "utf8");
const marker = "<!-- ===== LÕI THUẦN (đồng bộ với src/logic.js đã test) ===== -->";
const i = html.indexOf(marker);
if (i < 0) { console.error("Không thấy marker khối logic"); process.exit(2); }
const s = html.indexOf("<script>", i) + "<script>".length;
const e = html.indexOf("</script>", s);
fs.writeFileSync(__dirname + "/logic_inline.js", html.slice(s, e));
// Sinh test_inline.js từ test.js (cùng bộ test, chỉ đổi nguồn) → không bao giờ lỗi thời
const t = fs.readFileSync(__dirname + "/test.js", "utf8").replace('require("./logic.js")', 'require("./logic_inline.js")');
fs.writeFileSync(__dirname + "/test_inline.js", "// TỰ SINH từ test.js bởi extract_inline.js — đừng sửa tay\n" + t);
console.log("Đã tạo logic_inline.js + test_inline.js");
