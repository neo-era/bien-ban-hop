// build.js — nhúng NGUYÊN VĂN src/logic.js và src/docx.js vào index.html.
// Bản đã test = bản chạy trong app (không còn chép tay, không thể lệch).
// Chạy: node src/build.js
"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const htmlPath = path.join(root, "index.html");

const BLOCKS = [
  { marker: "<!-- ===== LÕI THUẦN (đồng bộ với src/logic.js đã test) ===== -->", file: "logic.js" },
  { marker: "<!-- ===== Tạo .docx (OOXML) — nhúng từ src/docx.js ===== -->", file: "docx.js" },
];

let html = fs.readFileSync(htmlPath, "utf8");
for (const b of BLOCKS) {
  const i = html.indexOf(b.marker);
  if (i < 0) throw new Error("Không thấy marker: " + b.marker);
  const sStart = html.indexOf("<script>", i);
  const sEnd = html.indexOf("</script>", sStart);
  if (sStart < 0 || sEnd < 0) throw new Error("Không thấy <script> sau marker " + b.file);
  const code = fs.readFileSync(path.join(__dirname, b.file), "utf8").trim();
  if (code.includes("</script>")) throw new Error(b.file + " chứa '</script>' → sẽ vỡ trang");
  html = html.slice(0, sStart) + "<script>\n" + code + "\n" + html.slice(sEnd);
}
fs.writeFileSync(htmlPath, html);
console.log("build: đã nhúng logic.js + docx.js vào index.html");
