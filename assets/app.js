"use strict";
/* ===== KONFIGURASI ===== */
const CONFIG = {
  API_URL:
    "https://script.google.com/macros/s/AKfycbyX_KMqbOarGu1F4CTYXu-RFLfevMlHVHYk0AKIxeO2a9QYJQgTC8cKrx1qY24WsuPR/exec",
  CACHE_KEY: "dashboardData",
  CACHE_MS: 5 * 60 * 1000,
  PAGE_SIZE: 15,
  // Nama kolom di spreadsheet (ubah di sini jika header berubah)
  COLUMNS: {
    no: "NO",
    tanggal: "TANGGAL",
    noKetetapan: "NO. KETETAPAN",
    kodeRekening: "KODE REKENING",
    nama: "NAMA",
    keterangan: "KETERANGAN",
    periode: "PERIODE",
    alamat: "ALAMAT",
    nominal: "NOMINAL",
    sistemBayar: "SISTEM BAYAR",
    kategori: "KATEGORI",
    statusRekon: "STATUS REKON",
    idPenyewa: "ID PENYEWA",
  },
};
const DETAIL_COLS = [
  ["no", "NO"],
  ["tanggal", "TANGGAL"],
  ["noKetetapan", "NO. KETETAPAN"],
  ["kodeRekening", "KODE REKENING"],
  ["nama", "NAMA"],
  ["keterangan", "KETERANGAN"],
  ["periode", "PERIODE"],
  ["alamat", "ALAMAT"],
  ["nominal", "NOMINAL"],
  ["sistemBayar", "SISTEM BAYAR"],
  ["kategori", "KATEGORI"],
  ["statusRekon", "STATUS REKON"],
  ["idPenyewa", "ID PENYEWA"],
];
const $ = (id) => document.getElementById(id);
const state = {
  all: [],
  months: [],
  dates: [],
  q: "",
  page: 1,
  sort: { key: "dateKey", dir: 1 },
  charts: {},
  updated: null,
};

/* ===== FORMAT ===== */
const rp = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
const compact = new Intl.NumberFormat("id-ID", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const formatCurrency = (n) =>
  rp.format(n).replace(/\s/g, " ").replace("Rp ", "Rp ");
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
const MON_KEYS = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  mei: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  agu: 7,
  ags: 7,
  sep: 8,
  oct: 9,
  okt: 9,
  nov: 10,
  dec: 11,
  des: 11,
};
const pad = (n) => String(n).padStart(2, "0");
const formatDateId = (k) => {
  const [y, m, d] = k.split("-");
  return `${d} ${MONTHS_ID[+m - 1]} ${y}`;
};
const monthLabel = (k) => {
  const [y, m] = k.split("-");
  return `${MONTHS_ID[+m - 1]} ${y}`;
};

/* ===== DATA LAYER ===== */
function parseNominal(v) {
  if (typeof v === "number") return v;
  let s = String(v ?? "").replace(/[^\d.,-]/g, "");
  if (!s) return 0;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", "."); // 1.234,50
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s) || s.split(".").length > 2)
    s = s.replace(/\./g, ""); // 389.600
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
function parseDate(raw) {
  const s = String(raw ?? "").trim();
  let y, m, d, x;
  if ((x = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) {
    y = +x[1];
    m = +x[2] - 1;
    d = +x[3];
  } else if (
    (x = s.match(/(\d{1,2})[\s\/.-]+([A-Za-z]+|\d{1,2})[\s\/.-]+(\d{4})/))
  ) {
    d = +x[1];
    y = +x[3];
    m = /^\d+$/.test(x[2])
      ? +x[2] - 1
      : MON_KEYS[x[2].slice(0, 3).toLowerCase()];
  }
  if (m === undefined || isNaN(y) || y === undefined) return null;
  const dateObject = new Date(y, m, d);
  if (dateObject.getMonth() !== m) return null;
  return {
    rawDate: s,
    dateObject,
    year: y,
    month: m + 1,
    monthName: MONTHS_ID[m],
    dateKey: `${y}-${pad(m + 1)}-${pad(d)}`,
    monthKey: `${y}-${pad(m + 1)}`,
  };
}
function normalizeData(rows) {
  const C = CONFIG.COLUMNS,
    out = [];
  rows.forEach((r, i) => {
    const dt = parseDate(r[C.tanggal]);
    if (!dt) return; // baris tanpa tanggal valid dilewati
    const o = { ...dt, nominal: parseNominal(r[C.nominal]) };
    Object.keys(C).forEach((k) => {
      if (k !== "tanggal" && k !== "nominal")
        o[k] = String(r[C[k]] ?? "").trim();
    });
    o.no = o.no || String(i + 1);
    o.kodeRekening = o.kodeRekening || "(Tanpa kode)";
    o.kategori = o.kategori || "(Tanpa kategori)";
    o._search = [
      o.nama,
      o.noKetetapan,
      o.alamat,
      o.keterangan,
      o.idPenyewa,
      o.kodeRekening,
    ]
      .join(" ")
      .toLowerCase();
    out.push(o);
  });
  return out;
}
async function loadData(force) {
  if (!force) {
    try {
      const c = JSON.parse(localStorage.getItem(CONFIG.CACHE_KEY) || "null");
      if (c && Date.now() - c.ts < CONFIG.CACHE_MS) {
        state.updated = new Date(c.ts);
        return c.rows;
      }
    } catch (e) {
      /* cache tidak tersedia */
    }
  }
  if (!/^https?:\/\//.test(CONFIG.API_URL))
    throw new Error(
      "API_URL di app.js belum diisi dengan URL Web App Apps Script."
    );
  let res;
  try {
    res = await fetch(CONFIG.API_URL);
  } catch (e) {
    throw new Error(
      'Tidak bisa menghubungi Web App. Periksa URL, koneksi, dan akses "Anyone" pada deployment.'
    );
  }
  if (!res.ok)
    throw new Error(
      "Web App membalas HTTP " + res.status + ". Periksa URL deployment."
    );
  const text = await res.text();
  let j;
  try {
    j = JSON.parse(text);
  } catch (e) {
    throw new Error(
      'Balasan bukan JSON (biasanya halaman login Google). Set deployment: Execute as "Me", akses "Anyone", lalu deploy versi baru.'
    );
  }
  if (j.ok === false) throw new Error(j.error || "Respons tidak valid");
  const rows = j.data || j;
  if (!Array.isArray(rows)) throw new Error("Format data tidak dikenali");
  state.updated = new Date();
  try {
    localStorage.setItem(
      CONFIG.CACHE_KEY,
      JSON.stringify({ ts: Date.now(), rows })
    );
  } catch (e) {
    /* abaikan */
  }
  return rows;
}

/* ===== FILTER LAYER ===== */
const getUniqueMonths = (d) => [...new Set(d.map((r) => r.monthKey))].sort();
const getAvailableDates = (d, months) =>
  [
    ...new Set(
      d.filter((r) => months.includes(r.monthKey)).map((r) => r.dateKey)
    ),
  ].sort();
const filterByMonth = (d, months) =>
  months.length ? d.filter((r) => months.includes(r.monthKey)) : d;
const filterByDate = (d, dates) =>
  dates.length ? d.filter((r) => dates.includes(r.dateKey)) : d;
const scopes = () => {
  const monthData = filterByMonth(state.all, state.months);
  return { monthData, dateData: filterByDate(monthData, state.dates) };
};

/* ===== CALCULATION LAYER ===== */
const calculateTotal = (d) => d.reduce((s, r) => s + r.nominal, 0);
function groupBy(d, key) {
  const m = new Map();
  d.forEach((r) => m.set(r[key], (m.get(r[key]) || 0) + r.nominal));
  return [...m].map(([k, v]) => ({ k, v }));
}
const groupByAccountCode = (d) =>
  groupBy(d, "kodeRekening").sort((a, b) => b.v - a.v);
const groupByCategory = (d) => groupBy(d, "kategori").sort((a, b) => b.v - a.v);
const groupByDate = (d) =>
  groupBy(d, "dateKey").sort((a, b) => a.k.localeCompare(b.k));

/* ===== UI: MULTI SELECT ===== */
function createMulti(root, placeholder, onChange) {
  root.classList.add("ms");
  root.innerHTML = `<div class="ms-btn" tabindex="0" role="combobox" aria-expanded="false"></div><div class="ms-panel" hidden><input type="search" placeholder="Cari…"><div class="ms-act"><button type="button" data-a="all">Pilih semua</button><button type="button" data-a="clear">Hapus semua</button></div><div class="ms-list"></div></div>`;
  const btn = root.querySelector(".ms-btn"),
    panel = root.querySelector(".ms-panel"),
    search = panel.querySelector("input"),
    list = panel.querySelector(".ms-list");
  let options = [],
    selected = new Set(),
    disabled = false;
  const labelOf = (v) => (options.find((o) => o.value === v) || {}).label || v;
  function drawBtn() {
    btn.innerHTML = selected.size
      ? [...selected]
          .map(
            (v) =>
              `<span class="chip">${labelOf(
                v
              )}<b data-x="${v}" aria-label="Hapus">×</b></span>`
          )
          .join("")
      : `<span class="ph">${placeholder}</span>`;
  }
  function drawList() {
    const q = search.value.toLowerCase();
    list.innerHTML =
      options
        .filter((o) => o.label.toLowerCase().includes(q))
        .map(
          (o) =>
            `<label><input type="checkbox" value="${o.value}" ${
              selected.has(o.value) ? "checked" : ""
            }>${o.label}</label>`
        )
        .join("") ||
      '<div class="ph" style="padding:8px">Tidak ada pilihan</div>';
  }
  const open = (o) => {
    if (disabled && o) return;
    panel.hidden = !o;
    btn.setAttribute("aria-expanded", o);
    if (o) {
      search.value = "";
      drawList();
      search.focus();
    }
  };
  const commit = () => {
    drawBtn();
    drawList();
    onChange([...selected].sort());
  };
  btn.addEventListener("click", (e) => {
    if (e.target.dataset.x) {
      selected.delete(e.target.dataset.x);
      commit();
      return;
    }
    open(panel.hidden);
  });
  btn.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open(panel.hidden);
    }
  });
  list.addEventListener("change", (e) => {
    e.target.checked
      ? selected.add(e.target.value)
      : selected.delete(e.target.value);
    commit();
  });
  search.addEventListener("input", drawList);
  panel.querySelector(".ms-act").addEventListener("click", (e) => {
    const a = e.target.dataset.a;
    if (!a) return;
    a === "all"
      ? options.forEach((o) => selected.add(o.value))
      : selected.clear();
    commit();
  });
  document.addEventListener("click", (e) => {
    if (!root.contains(e.target)) open(false);
  });
  drawBtn();
  return {
    setOptions(opts) {
      options = opts;
      const ok = new Set(opts.map((o) => o.value));
      selected = new Set([...selected].filter((v) => ok.has(v)));
      drawBtn();
      drawList();
      return [...selected].sort();
    },
    setDisabled(d) {
      disabled = d;
      root.classList.toggle("dis", d);
      if (d) {
        selected.clear();
        open(false);
        drawBtn();
      }
    },
    clear() {
      selected.clear();
      drawBtn();
      drawList();
    },
  };
}
let msMonth, msDate;
function updateDateOptions() {
  const avail = getAvailableDates(state.all, state.months);
  msDate.setDisabled(!state.months.length);
  state.dates = state.months.length
    ? msDate.setOptions(
        avail.map((k) => ({ value: k, label: formatDateId(k) }))
      )
    : [];
}

/* ===== UI RENDERING LAYER ===== */
const css = (n) =>
  getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const PALETTE = () => [
  css("--primary"),
  css("--accent"),
  "#5b7c99",
  "#8a6bb0",
  "#c0524a",
  "#4f9a6a",
  "#9aa5a9",
];
function drawChart(id, cfg) {
  if (state.charts[id]) state.charts[id].destroy();
  Chart.defaults.color = css("--muted");
  Chart.defaults.borderColor = css("--border");
  state.charts[id] = new Chart($(id), cfg);
}
const tip = {
  callbacks: {
    label: (c) => " " + formatCurrency(c.parsed.y ?? c.parsed.x ?? c.parsed),
  },
};
function renderSummary() {
  const { monthData, dateData } = scopes();
  $("kAll").textContent = formatCurrency(calculateTotal(state.all));
  $("kAllN").textContent = `${state.all.length} transaksi`;
  $("kMonth").textContent = formatCurrency(calculateTotal(monthData));
  $("kMonthN").textContent = state.months.length
    ? state.months.map(monthLabel).join(", ")
    : "Semua bulan";
  $("kDate").textContent = formatCurrency(calculateTotal(dateData));
  $("kDateN").textContent = state.dates.length
    ? `${state.dates.length} tanggal dipilih`
    : state.months.length
    ? "Belum ada tanggal, memakai bulan aktif"
    : "Semua data";
  $("kTx").textContent = dateData.length.toLocaleString("id-ID") + " transaksi";
  $("kCov").textContent = `${
    new Set(dateData.map((r) => r.kodeRekening)).size
  } kode rekening · ${new Set(dateData.map((r) => r.kategori)).size} kategori`;
}
function tableRows(el, g) {
  el.innerHTML = g
    .map(
      (x) => `<tr><td>${x.k}</td><td class="r">${formatCurrency(x.v)}</td></tr>`
    )
    .join("");
}
function renderAccountCodeChart(dateData) {
  const g = groupByAccountCode(dateData),
    top = g.slice(0, 10);
  $("boxAcc").style.height = Math.max(160, top.length * 34 + 40) + "px";
  drawChart("cAcc", {
    type: "bar",
    data: {
      labels: top.map((x) => (x.k.length > 30 ? x.k.slice(0, 29) + "…" : x.k)),
      datasets: [
        {
          data: top.map((x) => x.v),
          backgroundColor: css("--primary"),
          borderRadius: 6,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (i) => top[i[0].dataIndex].k,
            label: (c) => " " + formatCurrency(c.parsed.x),
          },
        },
      },
      scales: {
        x: { ticks: { callback: (v) => compact.format(v) } },
        y: { grid: { display: false } },
      },
    },
  });
  tableRows($("tAcc"), g);
}
function renderCategoryChart(dateData) {
  const g = groupByCategory(dateData);
  drawChart("cCat", {
    type: "doughnut",
    data: {
      labels: g.map((x) => x.k),
      datasets: [
        {
          data: g.map((x) => x.v),
          backgroundColor: PALETTE(),
          borderColor: css("--card"),
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      animation: { duration: 400 },
      plugins: {
        legend: { position: "right" },
        tooltip: {
          callbacks: {
            label: (c) => ` ${c.label}: ${formatCurrency(c.parsed)}`,
          },
        },
      },
    },
  });
  tableRows($("tCat"), g);
}
function renderDateChart(monthData) {
  const g = groupByDate(monthData),
    sel = new Set(state.dates);
  $("trendHint").textContent = sel.size ? "· tanggal terpilih ditandai" : "";
  $("boxTrend").style.minWidth = Math.max(100, g.length * 30) + "px";
  const on = css("--accent"),
    off = css("--primary");
  drawChart("cTrend", {
    type: "bar",
    data: {
      labels: g.map(
        (x) =>
          formatDateId(x.k).slice(0, 6) +
          (state.months.length !== 1 ? " " + x.k.slice(2, 4) : "")
      ),
      datasets: [
        {
          data: g.map((x) => x.v),
          borderRadius: 5,
          backgroundColor: g.map((x) =>
            !sel.size || sel.has(x.k) ? (sel.size ? on : off) : off + "55"
          ),
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (i) => formatDateId(g[i[0].dataIndex].k),
            label: (c) => " " + formatCurrency(c.parsed.y),
          },
        },
      },
      scales: {
        y: { ticks: { callback: (v) => compact.format(v) } },
        x: { grid: { display: false } },
      },
    },
  });
}
function detailRows() {
  const { dateData } = scopes(),
    q = state.q.trim().toLowerCase(),
    { key, dir } = state.sort;
  const rows = q
    ? dateData.filter((r) => r._search.includes(q))
    : dateData.slice();
  const num = key === "nominal" || key === "no";
  rows.sort(
    (a, b) =>
      (num
        ? parseFloat(a[key]) - parseFloat(b[key])
        : String(a[key]).localeCompare(String(b[key]), "id", {
            numeric: true,
          })) * dir || a.dateKey.localeCompare(b.dateKey)
  );
  return rows;
}
function renderDetailTable() {
  const has = state.dates.length > 0;
  $("detailEmpty").hidden = has;
  $("detailBox").hidden = !has;
  $("btnCsv").disabled = !has;
  $("q").disabled = !has;
  if (!has) return;
  const rows = detailRows(),
    pages = Math.max(1, Math.ceil(rows.length / CONFIG.PAGE_SIZE));
  state.page = Math.min(state.page, pages);
  const slice = rows.slice(
    (state.page - 1) * CONFIG.PAGE_SIZE,
    state.page * CONFIG.PAGE_SIZE
  );
  const arrow = (k) =>
    state.sort.key === (k === "tanggal" ? "dateKey" : k)
      ? state.sort.dir > 0
        ? " ▲"
        : " ▼"
      : "";
  $("tDetail").tHead.innerHTML =
    "<tr>" +
    DETAIL_COLS.map(([k, l]) => `<th data-k="${k}">${l}${arrow(k)}</th>`).join(
      ""
    ) +
    "</tr>";
  const esc = (s) =>
    String(s).replace(
      /[&<>"]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
    );
  $("tDetail").tBodies[0].innerHTML = slice.length
    ? slice
        .map(
          (r) =>
            "<tr>" +
            DETAIL_COLS.map(([k]) => {
              if (k === "tanggal") return `<td>${formatDateId(r.dateKey)}</td>`;
              if (k === "nominal")
                return `<td class="r">${formatCurrency(r.nominal)}</td>`;
              return `<td class="${
                [
                  "keterangan",
                  "alamat",
                  "statusRekon",
                  "kodeRekening",
                  "periode",
                ].includes(k)
                  ? "wrap"
                  : ""
              }">${esc(r[k])}</td>`;
            }).join("") +
            "</tr>"
        )
        .join("")
    : `<tr><td colspan="13" style="text-align:center;color:var(--muted)">Tidak ada data yang cocok dengan pencarian.</td></tr>`;
  $(
    "pInfo"
  ).textContent = `${rows.length} baris · halaman ${state.page} dari ${pages}`;
  $("pPrev").disabled = state.page <= 1;
  $("pNext").disabled = state.page >= pages;
}
function renderAll() {
  const { monthData, dateData } = scopes();
  renderSummary();
  const empty = dateData.length === 0;
  $("emptyAll").hidden = !empty;
  $("charts").hidden = empty;
  if (!empty) {
    renderAccountCodeChart(dateData);
    renderCategoryChart(dateData);
    renderDateChart(monthData);
  }
  renderDetailTable();
}
function resetFilter() {
  state.months = [];
  state.dates = [];
  state.q = "";
  state.page = 1;
  $("q").value = "";
  msMonth.clear();
  msDate.clear();
  updateDateOptions();
  renderAll();
}
function exportCsv() {
  const rows = detailRows(),
    esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [DETAIL_COLS.map((c) => esc(c[1])).join(",")].concat(
    rows.map((r) =>
      DETAIL_COLS.map(([k]) => esc(k === "tanggal" ? r.dateKey : r[k])).join(
        ","
      )
    )
  );
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" })
  );
  a.download = "detail-setoran.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ===== BOOT ===== */
function show(which) {
  $("skeleton").hidden = which !== "load";
  $("error").hidden = which !== "error";
  $("app").hidden = which !== "app";
}
async function init(force) {
  show("load");
  $("btnRefresh").disabled = true;
  try {
    const raw = await loadData(force);
    state.all = normalizeData(raw);
    if (!state.all.length) {
      try {
        localStorage.removeItem(CONFIG.CACHE_KEY);
      } catch (e) {
        /* abaikan */
      }
      const found = raw.length
        ? Object.keys(raw[0]).join(", ")
        : "(tidak ada baris data)";
      throw new Error(
        `Tidak ada baris valid. Kolom terbaca: ${found}. Kolom yang dicari: ${CONFIG.COLUMNS.tanggal}, ${CONFIG.COLUMNS.nominal}, dst. Periksa nama sheet di Code.gs dan CONFIG.COLUMNS.`
      );
    }
    const months = getUniqueMonths(state.all);
    state.months = msMonth.setOptions(
      months.map((k) => ({ value: k, label: monthLabel(k) }))
    );
    updateDateOptions();
    $("updated").textContent =
      "Pembaruan terakhir: " +
      state.updated.toLocaleString("id-ID", {
        dateStyle: "medium",
        timeStyle: "short",
      });
    show("app");
    renderAll();
  } catch (err) {
    $("errMsg").textContent = String(err.message || err);
    show("error");
  } finally {
    $("btnRefresh").disabled = false;
  }
}
document.addEventListener("DOMContentLoaded", () => {
  const fy = $("fYear");
  if (fy) fy.textContent = new Date().getFullYear();
  const saved = (() => {
    try {
      return localStorage.getItem("theme");
    } catch (e) {
      return null;
    }
  })();
  if (saved) document.documentElement.dataset.theme = saved;
  msMonth = createMulti($("fMonth"), "Semua bulan", (v) => {
    state.months = v;
    state.page = 1;
    updateDateOptions();
    renderAll();
  });
  msDate = createMulti($("fDate"), "Pilih bulan dahulu", (v) => {
    state.dates = v;
    state.page = 1;
    renderAll();
  });
  msDate.setDisabled(true);
  $("btnReset").onclick = resetFilter;
  $("btnRefresh").onclick = () => init(true);
  $("btnRetry").onclick = () => init(true);
  $("btnPrint").onclick = () => window.print();
  $("btnCsv").onclick = exportCsv;
  $("btnTheme").onclick = () => {
    const t =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = t;
    try {
      localStorage.setItem("theme", t);
    } catch (e) {
      /* abaikan */
    }
    if (!$("app").hidden) renderAll();
  };
  let timer;
  $("q").addEventListener("input", (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.q = e.target.value;
      state.page = 1;
      renderDetailTable();
    }, 200);
  });
  $("tDetail").addEventListener("click", (e) => {
    const k = e.target.closest("th")?.dataset.k;
    if (!k) return;
    const key = k === "tanggal" ? "dateKey" : k;
    state.sort = { key, dir: state.sort.key === key ? -state.sort.dir : 1 };
    renderDetailTable();
  });
  $("pPrev").onclick = () => {
    state.page--;
    renderDetailTable();
  };
  $("pNext").onclick = () => {
    state.page++;
    renderDetailTable();
  };
  init(false);
});
