"use strict";
/* ===== DATA LAYER =====
 * Struktur sengaja dipisah dari app.js. Saat sumber data sudah ditentukan,
 * cukup ganti isi loadDocuments() agar mengembalikan array dengan bentuk
 * yang sama: { title, date, description, url }. "url" adalah alamat yang
 * dimuat langsung di dalam iframe pada tiap card.
 */
const DOCUMENTS = [
  {
    title: "Pratinjau Setoran — 2026",
    date: "2026-10-05",
    description: "Pencatatan data setor spreadsheet 2026",
    url: "https://docs.google.com/spreadsheets/d/1leZHZaWikCPbzUVKevGlYVDfkmZt3GxWfkSOuFoqtkE/edit?usp=sharing",
  },
  // {
  //   title: "Pratinjau Setoran — Februari 2026",
  //   date: "2026-02-28",
  //   description:
  //     "Ringkasan data spreadsheet bulan Februari 2026, 184 baris transaksi.",
  //   url: "https://docs.google.com/spreadsheets/d/1leZHZaWikCPbzUVKevGlYVDfkmZt3GxWfkSOuFoqtkE/edit?usp=sharing",
  // },
  // {
  //   title: "Pratinjau Setoran — Maret 2026",
  //   date: "2026-03-31",
  //   description:
  //     "Ringkasan data spreadsheet bulan Maret 2026, 208 baris transaksi.",
  //   url: "https://docs.google.com/spreadsheets/d/1leZHZaWikCPbzUVKevGlYVDfkmZt3GxWfkSOuFoqtkE/edit?usp=sharing",
  // },
];

async function loadDocuments() {
  // TODO: ganti dengan pengambilan data asli, contoh:
  // const res = await fetch(CONFIG.API_URL + '?action=documents');
  // return (await res.json()).data;
  return DOCUMENTS;
}

/* ===== FORMAT ===== */
const MONTHS_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];
function formatDateId(iso) {
  const [y, m, d] = iso.split("-");
  return `${+d} ${MONTHS_ID[+m - 1]} ${y}`;
}
const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );

/* ===== RENDERING LAYER ===== */
function renderDocuments(docs) {
  const grid = document.getElementById("docGrid");
  const empty = document.getElementById("docEmpty");
  if (!docs.length) {
    grid.hidden = true;
    empty.hidden = false;
    return;
  }
  grid.hidden = false;
  empty.hidden = true;
  grid.innerHTML = docs
    .map(
      (d) => `
    <article class="card doc-card">
      <h3>${esc(d.title)}</h3>
      <span class="doc-date">${formatDateId(d.date)}</span>
      <p class="doc-desc">${esc(d.description)}</p>
      <div class="doc-frame-wrap">
        <iframe src="${esc(d.url)}" title="${esc(
        d.title
      )}" loading="lazy"></iframe>
      </div>
    </article>
  `
    )
    .join("");
}

function show(which) {
  document.getElementById("skeleton").hidden = which !== "load";
  document.getElementById("error").hidden = which !== "error";
  document.getElementById("docApp").hidden = which !== "app";
}

async function init() {
  show("load");
  try {
    const docs = await loadDocuments();
    renderDocuments(docs);
    show("app");
  } catch (err) {
    document.getElementById("errMsg").textContent = String(err.message || err);
    show("error");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const saved = (() => {
    try {
      return localStorage.getItem("theme");
    } catch (e) {
      return null;
    }
  })();
  if (saved) document.documentElement.dataset.theme = saved;
  document.getElementById("btnTheme").onclick = () => {
    const t =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = t;
    try {
      localStorage.setItem("theme", t);
    } catch (e) {
      /* abaikan */
    }
  };
  document.getElementById("btnRetry").onclick = init;
  init();
});
