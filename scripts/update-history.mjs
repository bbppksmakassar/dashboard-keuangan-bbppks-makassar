// Memperbarui history.json dari realisasi.pdf dan ikpa.pdf.
// Dijalankan oleh GitHub Actions (lihat .github/workflows/update-history.yml) dari root repo:
//   npm install pdfjs-dist@3.11.174 --no-save && node scripts/update-history.mjs
// Parser dan fungsi snapshot diambil langsung dari index.html supaya hasilnya identik dengan dashboard.
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import vm from "vm";

const root = process.cwd();
const html = readFileSync(join(root, "index.html"), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const code = script.slice(0, script.indexOf("/* ---------- state ---------- */"));

const mod = await import(pathToFileURL(join(root, "node_modules/pdfjs-dist/legacy/build/pdf.js")).href);
const pdfjsLib = mod.default || mod;
pdfjsLib.GlobalWorkerOptions.workerSrc = join(root, "node_modules/pdfjs-dist/legacy/build/pdf.worker.min.js");

const sb = {
  pdfjsLib, console, window: {},
  Chart: { register() {}, defaults: { font: {}, plugins: { tooltip: {} } } },
  setInterval() {}, setTimeout() {},
  document: { getElementById: () => null }, localStorage: { getItem: () => null, setItem() {} },
};
vm.createContext(sb);
vm.runInContext(code, sb);
pdfjsLib.GlobalWorkerOptions.workerSrc = join(root, "node_modules/pdfjs-dist/legacy/build/pdf.worker.min.js");

const asFile = (path) => {
  const b = readFileSync(path);
  return { name: path, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
};

const histPath = join(root, "history.json");
let hist = { realisasi: {}, ikpa: {} };
if (existsSync(histPath)) {
  try { const j = JSON.parse(readFileSync(histPath, "utf8")); hist = { realisasi: j.realisasi || {}, ikpa: j.ikpa || {} }; } catch (e) {}
}

if (existsSync(join(root, "realisasi.pdf"))) {
  const t = await sb.parseRealisasiPdf(asFile(join(root, "realisasi.pdf")));
  const iso = sb.idDateToIso(t.printedDate);
  if (iso) { hist.realisasi[iso] = sb.buildRealisasiSnapshot(t); console.log("realisasi:", iso); }
  else console.warn("Tanggal cetak realisasi.pdf tidak terbaca, dilewati:", t.printedDate);
}
if (existsSync(join(root, "ikpa.pdf"))) {
  const { records, printedDate } = await sb.parseIkpaPdf(asFile(join(root, "ikpa.pdf")));
  const iso = sb.idDateToIso(printedDate);
  if (iso) { hist.ikpa[iso] = sb.buildIkpaSnapshot(records); console.log("ikpa:", iso); }
  else console.warn("Tanggal cetak ikpa.pdf tidak terbaca, dilewati:", printedDate);
}

// Simpan hanya tanggal data terbaru + snapshot sebelumnya (hari kerja sebelumnya).
sb.pruneHistoryDates(hist.realisasi);
sb.pruneHistoryDates(hist.ikpa);
writeFileSync(histPath, JSON.stringify(hist) + "\n");
console.log("history.json diperbarui. Tanggal realisasi:", Object.keys(hist.realisasi), "ikpa:", Object.keys(hist.ikpa));
