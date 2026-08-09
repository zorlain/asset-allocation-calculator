/* ---------- 공통 유틸 ---------- */
function toNumber(str) {
  const n = Number(String(str || "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : NaN;
}

function parsePercent(str) {
  const n = Number(String(str || "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/* 입력창에 천단위 콤마 자동 포맷 */
function bindThousandsInput(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("input", () => {
    const raw = el.value.replace(/[^\d.]/g, "");
    const parts = raw.split(".");
    const intPart = parts[0] ? Number(parts[0]).toLocaleString("ko-KR") : "";
    el.value = parts.length > 1 ? `${intPart}.${parts[1]}` : intPart;
  });
}

/* ---------- 정보 툴팁 ---------- */
function initInfoTooltips() {
  document.querySelectorAll(".info-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const wasOpen = btn.classList.contains("open");
      document.querySelectorAll(".info-btn.open").forEach((b) => b.classList.remove("open"));
      if (!wasOpen) btn.classList.add("open");
    });
  });
  document.addEventListener("click", () => {
    document.querySelectorAll(".info-btn.open").forEach((b) => b.classList.remove("open"));
  });
}

/* ---------- 다크/라이트 모드 토글 ---------- */
function initThemeToggle() {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;

  const getTheme = () => document.documentElement.getAttribute("data-theme") || "light";
  const applyIcon = () => {
    btn.textContent = getTheme() === "dark" ? "☀️" : "🌙";
  };

  applyIcon();
  btn.addEventListener("click", () => {
    const next = getTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    applyIcon();
    refreshChartsForTheme();
  });
}

/* ---------- 탭 내비게이션 ---------- */
function initTabs() {
  const tabs = document.getElementById("tabs");
  tabs.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab-btn");
    if (!btn) return;
    const target = btn.dataset.tab;
    tabs.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
    document.querySelectorAll("[data-tab-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.tabPanel !== target;
    });
  });
}

/* ---------- 헤더 햄버거 메뉴 ---------- */
function initMenu() {
  const menu = document.getElementById("menu");
  const toggle = document.getElementById("menu-toggle");
  if (!menu || !toggle) return;
  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.classList.toggle("open");
  });
  document.addEventListener("click", () => menu.classList.remove("open"));
}

/* ---------- 자산군 색상 (파이/라인 차트용) ---------- */
const TICKER_COLORS = {
  SPY: "#494fdf",
  EEM: "#21b3a4",
  TLT: "#f2665e",
  IEF: "#f2a341",
  GLD: "#d4af37",
  DBC: "#8d6a4f",
  VNQ: "#4fa8d8",
  BIL: "#9aa0a6",
};

/* ---------- 비중 입력 상태 ---------- */
function getWeightsFromInputs() {
  const weights = {};
  document.querySelectorAll(".weight-input").forEach((inp) => {
    const t = inp.dataset.ticker;
    const v = parsePercent(inp.value);
    if (v > 0) weights[t] = v / 100;
  });
  return weights;
}

function weightSum() {
  let sum = 0;
  document.querySelectorAll(".weight-input").forEach((inp) => (sum += parsePercent(inp.value)));
  return sum;
}

function updateWeightTotal() {
  const bar = document.getElementById("weight-total-bar");
  const valueEl = document.getElementById("weight-total-value");
  if (!bar || !valueEl) return;
  const total = weightSum();
  valueEl.textContent = `${total.toFixed(1)}%`;
  const ok = Math.abs(total - 100) < 0.05;
  bar.classList.toggle("ok", ok);
  bar.classList.toggle("bad", !ok);
}

function applyPreset(key) {
  const preset = PRESETS[key];
  if (!preset) return;
  document.querySelectorAll(".weight-input").forEach((inp) => {
    const t = inp.dataset.ticker;
    const w = preset.weights[t] || 0;
    inp.value = w > 0 ? String(+(w * 100).toFixed(2)) : "0";
  });
  document.querySelectorAll(".preset-chip[data-preset]").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.preset === key);
  });
  updateWeightTotal();
}

function resetWeights() {
  document.querySelectorAll(".weight-input").forEach((inp) => (inp.value = "0"));
  document.querySelectorAll(".preset-chip[data-preset]").forEach((chip) => chip.classList.remove("active"));
  updateWeightTotal();
}

function initWeightInputs() {
  document.querySelectorAll(".weight-input").forEach((inp) => {
    inp.addEventListener("input", () => {
      document.querySelectorAll(".preset-chip[data-preset]").forEach((chip) => chip.classList.remove("active"));
      updateWeightTotal();
    });
  });

  document.querySelectorAll(".preset-chip[data-preset]").forEach((chip) => {
    chip.addEventListener("click", () => applyPreset(chip.dataset.preset));
  });

  const resetBtn = document.getElementById("preset-reset");
  if (resetBtn) resetBtn.addEventListener("click", resetWeights);
}

/* ---------- 탭 1: 배분 계산기 + 백테스트 ---------- */
let pieChart = null;
let lineChart = null;
let lastResult = null; // { weights, bt }

function renderPieChart(weights) {
  const canvas = document.getElementById("pie-canvas");
  if (!canvas || typeof Chart === "undefined") return;
  const labels = [];
  const data = [];
  const colors = [];
  ASSET_ORDER.forEach((t) => {
    if (weights[t] > 0) {
      labels.push(ASSET_DATA.assets[t].name);
      data.push(+(weights[t] * 100).toFixed(1));
      colors.push(TICKER_COLORS[t]);
    }
  });

  if (pieChart) pieChart.destroy();
  pieChart = new Chart(canvas.getContext("2d"), {
    type: "doughnut",
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
    options: {
      cutout: "62%",
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.parsed}%` } },
      },
    },
  });

  const legendEl = document.getElementById("pie-legend");
  if (legendEl) {
    legendEl.innerHTML = labels
      .map(
        (l, i) =>
          `<span class="chart-legend-item"><span class="chart-legend-dot" style="background:${colors[i]}"></span>${l} ${data[i]}%</span>`
      )
      .join("");
  }
}

function renderLineChart(bt) {
  const canvas = document.getElementById("line-canvas");
  if (!canvas || typeof Chart === "undefined") return;
  const labels = ["시작", ...bt.dates];
  const style = getComputedStyle(document.documentElement);
  const accent = style.getPropertyValue("--chart-fill").trim() || "#494fdf";
  const gridColor = style.getPropertyValue("--border").trim() || "rgba(0,0,0,0.1)";
  const textMuted = style.getPropertyValue("--text-muted").trim() || "#888888";

  if (lineChart) lineChart.destroy();
  lineChart = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          data: bt.values,
          borderColor: accent,
          backgroundColor: accent,
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.15,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => formatManwon(ctx.parsed.y) } },
      },
      scales: {
        x: { ticks: { color: textMuted, maxTicksLimit: 8, autoSkip: true }, grid: { display: false } },
        y: { ticks: { color: textMuted, callback: (v) => formatManwon(v) }, grid: { color: gridColor } },
      },
    },
  });
}

function renderResult(weights, bt) {
  const resultEl = document.getElementById("allocator-result");
  resultEl.innerHTML = `
    <div class="chart-wrap pie-wrap"><canvas id="pie-canvas"></canvas></div>
    <div class="chart-legend" id="pie-legend"></div>
    <div class="result-hero">
      <div class="result-hero-label">최종 자산 (${bt.years.toFixed(1)}년 후 백테스트)</div>
      <div class="result-hero-value">${formatManwon(bt.finalValue)}</div>
      <div class="result-hero-sub">${bt.startDate} ~ ${bt.endDate} · 초기 투자금 ${formatManwon(bt.initialAmount)} · 매달 리밸런싱 가정</div>
    </div>
    <div class="chart-wrap line-wrap"><canvas id="line-canvas"></canvas></div>
    <div class="result-grid">
      <div class="result-stat">
        <div class="result-stat-label">연평균 수익률 (CAGR)</div>
        <div class="result-stat-value ${bt.cagr >= 0 ? "positive" : "negative"}">${formatSignedPct(bt.cagr, 2)}</div>
      </div>
      <div class="result-stat">
        <div class="result-stat-label">연변동성</div>
        <div class="result-stat-value">${formatPct(bt.annVol, 2)}</div>
      </div>
      <div class="result-stat">
        <div class="result-stat-label">최대낙폭 (MDD)</div>
        <div class="result-stat-value negative">${formatPct(bt.mdd, 1)}</div>
      </div>
      <div class="result-stat">
        <div class="result-stat-label">샤프비율</div>
        <div class="result-stat-value">${bt.sharpe.toFixed(2)}</div>
      </div>
    </div>
  `;
  renderPieChart(weights);
  renderLineChart(bt);
}

function setupAllocator() {
  bindThousandsInput("bt-amount");
  document.getElementById("allocator-calc-btn").addEventListener("click", () => {
    const resultEl = document.getElementById("allocator-result");
    const total = weightSum();
    if (Math.abs(total - 100) > 0.05) {
      resultEl.innerHTML = `<p class="result-placeholder">비중 합계가 100%가 되어야 계산할 수 있습니다. (현재 ${total.toFixed(1)}%)</p>`;
      lastResult = null;
      return;
    }
    const weights = getWeightsFromInputs();
    const amount = toNumber(document.getElementById("bt-amount").value) || 1000;
    const bt = runBacktest(weights, amount);
    if (!bt) {
      resultEl.innerHTML = `<p class="result-placeholder">선택한 자산 조합의 공통 데이터 구간을 찾을 수 없습니다.</p>`;
      lastResult = null;
      return;
    }
    bt.initialAmount = amount;
    lastResult = { weights, bt };
    renderResult(weights, bt);
  });
}

/* 테마 전환 시 이미 그려진 차트가 있으면 새 테마 색상으로 다시 그린다 */
function refreshChartsForTheme() {
  if (!lastResult) return;
  renderPieChart(lastResult.weights);
  renderLineChart(lastResult.bt);
}

/* ---------- 탭 2: 자산 현황 ---------- */
function renderDashboard() {
  const asOfEl = document.getElementById("dashboard-asof");
  if (asOfEl) asOfEl.textContent = `기준일: ${ASSET_DATA.updatedAt} 종가 기준 (실시간 시세 아님)`;

  const tbody = document.getElementById("asset-table-body");
  if (!tbody) return;
  tbody.innerHTML = ASSET_ORDER.map((t) => {
    const s = assetStandaloneStats(t);
    const cls1m = s.oneMonthReturn === null ? "" : s.oneMonthReturn >= 0 ? "positive" : "negative";
    const cls1y = s.oneYearReturn === null ? "" : s.oneYearReturn >= 0 ? "positive" : "negative";
    return `
      <tr>
        <td class="asset-name-cell">${ASSET_ICON[t]} ${s.name}</td>
        <td>${formatUsd(s.lastClose)}</td>
        <td class="${cls1m}">${formatSignedPct(s.oneMonthReturn, 1)}</td>
        <td class="${cls1y}">${s.oneYearReturn === null ? "-" : formatSignedPct(s.oneYearReturn, 1)}</td>
        <td>${formatSignedPct(s.cagr, 1)}</td>
        <td>${formatPct(s.annVol, 1)}</td>
      </tr>
    `;
  }).join("");
}

/* ---------- 초기화 ---------- */
function init() {
  initThemeToggle();
  initMenu();
  initTabs();
  initInfoTooltips();
  initWeightInputs();
  setupAllocator();
  applyPreset("6040");
  renderDashboard();
}

document.addEventListener("DOMContentLoaded", init);
