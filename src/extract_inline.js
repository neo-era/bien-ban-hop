// Trích khối logic nhúng trong ../index.html ra logic_inline.js để test_inline.js dùng.
const fs = require("fs");
const html = fs.readFileSync(__dirname + "/../index.html", "utf8");
const m = html.match(/\(function \(root\) \{\s*"use strict";[\s\S]*?\}\)\(window\);/);
if (!m) { console.error("Không tìm thấy khối logic trong index.html"); process.exit(2); }
fs.writeFileSync(__dirname + "/logic_inline.js", "var window={};\n" + m[0] + "\nmodule.exports=window.BBLogic;\n");
console.log("Đã tạo logic_inline.js");
