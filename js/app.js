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
/* 이벤트 위임 사용 - renderResult()가 나중에 동적으로 추가하는 info-btn(지표 설명)도 자동으로 동작한다 */
function initInfoTooltips() {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".info-btn");
    if (btn) {
      e.stopPropagation();
      const wasOpen = btn.classList.contains("open");
      document.querySelectorAll(".info-btn.open").forEach((b) => b.classList.remove("open"));
      if (!wasOpen) btn.classList.add("open");
      return;
    }
    document.querySelectorAll(".info-btn.open").forEach((b) => b.classList.remove("open"));
  });
}

/* ---------- 다크/라이트 모드 토글 ---------- */
function initThemeToggle() {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;

  const getTheme = () => document.documentElement.getAttribute("data-theme") || "dark";
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

/* ---------- 지표 설명 (어려운 용어에 물음표 툴팁 추가) ---------- */
const METRIC_INFO = {
  mdd: "투자 기간 중 고점 대비 자산이 가장 많이 떨어졌던 비율입니다. 0에 가까울수록 하락 시기의 타격이 작았다는 뜻입니다.",
  sharpe:
    "위험(변동성) 대비 초과수익을 보여주는 지표입니다. 현금성자산 대비 얼마나 더 벌었는지를 변동성으로 나눈 값으로, 높을수록 감수한 위험 대비 수익이 좋았다는 뜻입니다.",
  sortino:
    "샤프비율과 비슷하지만 상승 변동성은 빼고 하락 변동성만으로 위험을 계산합니다. 손실 위험 대비 수익 효율을 더 정확히 보여줍니다.",
  calmar:
    "연평균 수익률(CAGR)을 최대낙폭(MDD)으로 나눈 값입니다. 감내해야 했던 최악의 하락폭 대비 수익이 얼마나 좋았는지를 보여줍니다.",
};

function statLabelWithInfo(label, key) {
  const tip = METRIC_INFO[key];
  if (!tip) return label;
  return `${label}
    <button type="button" class="info-btn stat-info-btn" aria-label="자세히 보기">
      <span aria-hidden="true">ⓘ</span>
      <span class="info-tooltip">${tip}</span>
    </button>`;
}

/* ---------- 자산군 색상 (파이/라인 차트용) ---------- */
const TICKER_COLORS = {
  SPY: "#494fdf",
  QQQ: "#7c4fd8",
  SCHD: "#c25b8f",
  KOSPI: "#3a6ea5",
  KOSDAQ: "#6aa84f",
  EEM: "#21b3a4",
  TLT: "#f2665e",
  IEF: "#f2a341",
  GLD: "#d4af37",
  DBC: "#8d6a4f",
  VNQ: "#4fa8d8",
  BIL: "#9aa0a6",
};

/* ---------- 자산 추가/제거 (자산 추가 버튼을 눌러 목록에서 고른 자산만 행으로 표시) ---------- */
let addedTickers = [];

function isTickerActive(ticker) {
  const inp = document.querySelector(`.weight-input[data-ticker="${ticker}"]`);
  return !!inp && parsePercent(inp.value) > 0;
}

function getWeightsFromInputs() {
  const weights = {};
  document.querySelectorAll(".weight-input").forEach((inp) => {
    const v = parsePercent(inp.value);
    if (v > 0) weights[inp.dataset.ticker] = v / 100;
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

function updateRowActiveClass(ticker) {
  const inp = document.querySelector(`.weight-input[data-ticker="${ticker}"]`);
  if (!inp) return;
  const row = inp.closest(".weight-row");
  if (row) row.classList.toggle("inactive", parsePercent(inp.value) <= 0);
}

function clearSavedChipActive() {
  document.querySelectorAll(".saved-chip").forEach((chip) => chip.classList.remove("active"));
}

/* 사용자가 비중을 직접 건드리면 프리셋 상자를 "직접 입력" 상태로 되돌린다 */
function markPresetAsCustom() {
  deactivateSelectBox("preset-select", "직접 입력", "자산별 비중을 직접 설정");
  clearSavedChipActive();
}

function renderAssetAddOptions() {
  const dropdown = document.getElementById("asset-add-dropdown");
  if (!dropdown) return;
  const remaining = ASSET_ORDER.filter((t) => !addedTickers.includes(t));
  if (remaining.length === 0) {
    dropdown.innerHTML = `<div class="select-box-empty">추가할 수 있는 자산이 없습니다</div>`;
    return;
  }
  dropdown.innerHTML = remaining
    .map(
      (t) => `
        <button type="button" class="select-box-option" data-ticker="${t}" role="option">
          <div class="select-box-option-title">${ASSET_DATA.assets[t].name}</div>
        </button>
      `
    )
    .join("");
}

function bindWeightInput(inp) {
  inp.addEventListener("input", () => {
    updateRowActiveClass(inp.dataset.ticker);
    markPresetAsCustom();
    updateWeightTotal();
  });
}

function addAssetRow(ticker, value = 0) {
  if (!ASSET_DATA.assets[ticker] || addedTickers.includes(ticker)) return;
  addedTickers.push(ticker);

  const list = document.getElementById("weight-list");
  const row = document.createElement("div");
  row.className = "weight-row";
  row.dataset.ticker = ticker;
  row.innerHTML = `
    <span class="weight-row-name">${ASSET_DATA.assets[ticker].name}</span>
    <div class="weight-row-input-wrap">
      <input type="text" inputmode="decimal" class="weight-input" data-ticker="${ticker}" value="${value > 0 ? value : 0}" />
      <span class="weight-row-suffix">%</span>
    </div>
    <button type="button" class="weight-row-remove" data-ticker="${ticker}" aria-label="자산 제거">×</button>
  `;
  list.appendChild(row);

  bindWeightInput(row.querySelector(".weight-input"));
  row.querySelector(".weight-row-remove").addEventListener("click", () => {
    removeAssetRow(ticker);
    markPresetAsCustom();
  });

  updateRowActiveClass(ticker);
  renderAssetAddOptions();
}

function removeAssetRow(ticker) {
  const row = document.querySelector(`.weight-row[data-ticker="${ticker}"]`);
  if (row) row.remove();
  addedTickers = addedTickers.filter((t) => t !== ticker);
  renderAssetAddOptions();
  updateWeightTotal();
}

function applyWeightsToInputs(weights) {
  document.getElementById("weight-list").innerHTML = "";
  addedTickers = [];
  ASSET_ORDER.forEach((t) => {
    const w = weights[t] || 0;
    if (w > 0) addAssetRow(t, +(w * 100).toFixed(2));
  });
  updateWeightTotal();
}

function applyPreset(key) {
  const preset = PRESETS[key];
  if (!preset) return;
  applyWeightsToInputs(preset.weights);
}

function resetWeights() {
  document.getElementById("weight-list").innerHTML = "";
  addedTickers = [];
  renderAssetAddOptions();
  updateWeightTotal();
}

function initAssetAddSelect() {
  const toggle = document.getElementById("asset-add-toggle");
  const dropdown = document.getElementById("asset-add-dropdown");
  if (!toggle || !dropdown) return;

  renderAssetAddOptions();

  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = !dropdown.classList.contains("open");
    closeAllSelectBoxDropdowns();
    dropdown.classList.toggle("open", willOpen);
    toggle.setAttribute("aria-expanded", String(willOpen));
  });

  dropdown.addEventListener("click", (e) => {
    const opt = e.target.closest(".select-box-option");
    if (!opt) return;
    e.stopPropagation();
    addAssetRow(opt.dataset.ticker, 0);
    markPresetAsCustom();
    closeSelectBoxDropdown("asset-add-select");
  });

  document.addEventListener("click", () => closeSelectBoxDropdown("asset-add-select"));
}

/* ---------- 나만의 포트폴리오 저장 (localStorage) ---------- */
const SAVED_PORTFOLIOS_KEY = "aa-calc-saved-portfolios-v1";

function loadSavedPortfolios() {
  try {
    const raw = localStorage.getItem(SAVED_PORTFOLIOS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function persistSavedPortfolios(list) {
  try {
    localStorage.setItem(SAVED_PORTFOLIOS_KEY, JSON.stringify(list));
  } catch {
    /* localStorage 사용 불가 시 조용히 무시 */
  }
}

function summarizeWeights(weights) {
  return ASSET_ORDER.filter((t) => weights[t] > 0)
    .map((t) => `${t} ${(weights[t] * 100).toFixed(0)}%`)
    .join(" · ");
}

function renderSavedPortfolioChips() {
  const listEl = document.getElementById("saved-portfolio-list");
  if (!listEl) return;
  const saved = loadSavedPortfolios();
  if (saved.length === 0) {
    listEl.innerHTML = `<span class="saved-empty-hint" id="saved-empty-hint">저장된 포트폴리오가 없습니다.</span>`;
    return;
  }
  listEl.innerHTML = saved
    .map(
      (p) => `
        <div class="preset-chip saved-chip" data-saved-id="${p.id}" role="button" tabindex="0">
          <button type="button" class="saved-chip-delete" data-saved-id="${p.id}" aria-label="삭제">×</button>
          <div class="preset-chip-label">${p.name}</div>
          <div class="preset-chip-desc">${summarizeWeights(p.weights)}</div>
        </div>
      `
    )
    .join("");
}

function saveCurrentPortfolio(name) {
  const msgEl = document.getElementById("save-portfolio-msg");
  const trimmed = (name || "").trim();
  if (!trimmed) {
    if (msgEl) msgEl.textContent = "포트폴리오 이름을 입력해주세요.";
    return;
  }
  const total = weightSum();
  if (Math.abs(total - 100) > 0.05) {
    if (msgEl) msgEl.textContent = `체크한 자산의 비중 합이 100%일 때 저장할 수 있습니다. (현재 ${total.toFixed(1)}%)`;
    return;
  }
  const weights = getWeightsFromInputs();
  const list = loadSavedPortfolios();
  list.push({ id: String(Date.now()), name: trimmed, weights });
  persistSavedPortfolios(list);
  renderSavedPortfolioChips();
  if (msgEl) msgEl.textContent = `"${trimmed}" 저장했습니다.`;
  const nameInput = document.getElementById("save-portfolio-name");
  if (nameInput) nameInput.value = "";
}

function deleteSavedPortfolio(id) {
  const list = loadSavedPortfolios().filter((p) => p.id !== id);
  persistSavedPortfolios(list);
  renderSavedPortfolioChips();
}

function applySavedPortfolio(id) {
  const p = loadSavedPortfolios().find((x) => x.id === id);
  if (!p) return;
  applyWeightsToInputs(p.weights);
  deactivateSelectBox("preset-select", p.name, summarizeWeights(p.weights));
  document.querySelectorAll(".saved-chip").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.savedId === id);
  });
}

function initSavedPortfolios() {
  renderSavedPortfolioChips();

  const listEl = document.getElementById("saved-portfolio-list");
  if (listEl) {
    listEl.addEventListener("click", (e) => {
      const delBtn = e.target.closest(".saved-chip-delete");
      if (delBtn) {
        e.stopPropagation();
        deleteSavedPortfolio(delBtn.dataset.savedId);
        return;
      }
      const chip = e.target.closest(".saved-chip");
      if (chip) applySavedPortfolio(chip.dataset.savedId);
    });
    listEl.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const chip = e.target.closest(".saved-chip");
      if (!chip) return;
      e.preventDefault();
      applySavedPortfolio(chip.dataset.savedId);
    });
  }

  const saveBtn = document.getElementById("save-portfolio-btn");
  const nameInput = document.getElementById("save-portfolio-name");
  if (saveBtn && nameInput) {
    saveBtn.addEventListener("click", () => saveCurrentPortfolio(nameInput.value));
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") saveCurrentPortfolio(nameInput.value);
    });
    nameInput.addEventListener("input", () => {
      const msgEl = document.getElementById("save-portfolio-msg");
      if (msgEl) msgEl.textContent = "";
    });
  }
}

/* ---------- 백테스트 설정 (수수료 / 리밸런싱 주기 / 기간) ---------- */
function initBacktestSettings() {
  bindThousandsInput("bt-amount");

  let earliestYear = 9999;
  ASSET_ORDER.forEach((t) => {
    const y = Number(ASSET_DATA.assets[t].series[0].d.slice(0, 4));
    if (y < earliestYear) earliestYear = y;
  });
  const latestYear = Number(ASSET_DATA.updatedAt.slice(0, 4));

  const startSel = document.getElementById("bt-start-year");
  const endSel = document.getElementById("bt-end-year");
  if (startSel && endSel) {
    let options = `<option value="">전체</option>`;
    for (let y = latestYear; y >= earliestYear; y--) {
      options += `<option value="${y}">${y}년</option>`;
    }
    startSel.innerHTML = options;
    endSel.innerHTML = options;
  }
}

/* ---------- 배당 재투자 / 환율 반영 옵션 ---------- */
function initDataOptionCheckboxes() {
  const divCb = document.getElementById("opt-reinvest-div");
  const fxCb = document.getElementById("opt-reflect-fx");
  if (!divCb || !fxCb) return;

  const apply = () => {
    setDataOptions({ useAdjClose: divCb.checked, reflectFx: fxCb.checked });
    renderDashboard();
    renderCorrelationTable();
  };

  divCb.addEventListener("change", apply);
  fxCb.addEventListener("change", apply);
}

/* 리밸런싱(정적) / 재평가(동적) 주기는 모드별로 별도 컨트롤을 사용한다 */
function getBacktestOptions(mode) {
  const feeAnnualPct = toNumber(document.getElementById("bt-fee").value) || 0;
  const rebalanceSelectId = mode === "dynamic" ? "dynamic-rebalance" : "static-rebalance";
  const rebalanceMonths = Number(document.getElementById(rebalanceSelectId).value);
  const startYear = document.getElementById("bt-start-year").value;
  const endYear = document.getElementById("bt-end-year").value;
  return {
    feeAnnualPct,
    rebalanceMonths,
    startDate: startYear ? `${startYear}-01` : null,
    endDate: endYear ? `${endYear}-12` : null,
  };
}

const REBALANCE_LABEL = {
  0: "리밸런싱 없음(바이앤홀드)",
  1: "매달 리밸런싱",
  3: "분기 리밸런싱",
  6: "반기 리밸런싱",
  12: "매년 리밸런싱",
};

const DYNAMIC_REBALANCE_LABEL = {
  1: "매달 재평가",
  3: "분기 재평가",
  6: "반기 재평가",
  12: "매년 재평가",
};

/* ---------- 상자 드롭다운 선택 공통 로직 (모드 / 프리셋 / 동적전략에서 재사용) ---------- */
function activateSelectBoxOption(rootId, optionEl) {
  const root = document.getElementById(rootId);
  if (!root) return;
  root.querySelectorAll(".select-box-option").forEach((o) => {
    const isActive = o === optionEl;
    o.classList.toggle("active", isActive);
    o.setAttribute("aria-selected", String(isActive));
  });
  if (!optionEl) return;
  const titleEl = root.querySelector(".select-box-title");
  const descEl = root.querySelector(".select-box-desc");
  const optTitle = optionEl.querySelector(".select-box-option-title");
  const optDesc = optionEl.querySelector(".select-box-option-desc");
  if (titleEl && optTitle) titleEl.textContent = optTitle.textContent;
  if (descEl && optDesc) descEl.textContent = optDesc.textContent;
}

function deactivateSelectBox(rootId, title, desc) {
  const root = document.getElementById(rootId);
  if (!root) return;
  root.querySelectorAll(".select-box-option").forEach((o) => {
    o.classList.remove("active");
    o.setAttribute("aria-selected", "false");
  });
  const titleEl = root.querySelector(".select-box-title");
  const descEl = root.querySelector(".select-box-desc");
  if (titleEl) titleEl.textContent = title;
  if (descEl) descEl.textContent = desc;
}

function closeSelectBoxDropdown(rootId) {
  const root = document.getElementById(rootId);
  if (!root) return;
  const dropdown = root.querySelector(".select-box-dropdown");
  const toggle = root.querySelector(".select-box-toggle");
  if (dropdown) dropdown.classList.remove("open");
  if (toggle) toggle.setAttribute("aria-expanded", "false");
}

function closeAllSelectBoxDropdowns() {
  document.querySelectorAll(".select-box-dropdown.open").forEach((d) => d.classList.remove("open"));
  document.querySelectorAll('.select-box-toggle[aria-expanded="true"]').forEach((t) => t.setAttribute("aria-expanded", "false"));
}

function initSelectBox(rootId, onSelect) {
  const root = document.getElementById(rootId);
  if (!root) return;
  const toggle = root.querySelector(".select-box-toggle");
  const dropdown = root.querySelector(".select-box-dropdown");
  if (!toggle || !dropdown) return;

  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = !dropdown.classList.contains("open");
    closeAllSelectBoxDropdowns();
    dropdown.classList.toggle("open", willOpen);
    toggle.setAttribute("aria-expanded", String(willOpen));
  });

  root.querySelectorAll(".select-box-option").forEach((opt) => {
    opt.addEventListener("click", (e) => {
      e.stopPropagation();
      activateSelectBoxOption(rootId, opt);
      closeSelectBoxDropdown(rootId);
      onSelect(opt.dataset, opt);
    });
  });

  document.addEventListener("click", () => closeSelectBoxDropdown(rootId));
}

/* ---------- 정적/동적 배분 모드 ---------- */
let allocationMode = "static";
let selectedDynamicStrategy = null;

function setAllocationMode(mode) {
  allocationMode = mode;
  const staticPanel = document.getElementById("static-mode-panel");
  const dynamicPanel = document.getElementById("dynamic-mode-panel");
  if (staticPanel) staticPanel.hidden = mode !== "static";
  if (dynamicPanel) dynamicPanel.hidden = mode !== "dynamic";

  const bar = document.getElementById("weight-total-bar");
  if (bar) bar.hidden = mode === "dynamic";
}

/* ---------- 프리셋 상자 (60/40, 영구, 올웨더, 직접 입력) ---------- */
function handlePresetSelect(data) {
  if (data.preset) {
    applyPreset(data.preset);
  } else if (data.action === "reset") {
    resetWeights();
  }
}

/* ---------- 동적 전략 상자 ---------- */
function selectDynamicStrategy(key) {
  selectedDynamicStrategy = key;
  const meta = DYNAMIC_STRATEGIES[key];
  const tipEl = document.getElementById("dynamic-strategy-tip");
  if (tipEl && meta) tipEl.textContent = meta.tip;
  const topNGroup = document.getElementById("dynamic-topn-group");
  if (topNGroup) topNGroup.hidden = !(meta && meta.showTopN);
}

/* ---------- 탭 1: 배분 계산기 + 백테스트 ---------- */
let pieChart = null;
let lineChart = null;
let lastResult = null; // bt (finalWeights 포함)

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

function renderResult(bt) {
  const resultEl = document.getElementById("allocator-result");
  const rebalanceLabel =
    bt.mode === "dynamic"
      ? DYNAMIC_REBALANCE_LABEL[bt.rebalanceMonths] || "매달 재평가"
      : REBALANCE_LABEL[bt.rebalanceMonths] || "매달 리밸런싱";
  const feeNote = bt.feeAnnualPct > 0 ? ` · 연 수수료 ${bt.feeAnnualPct}%` : "";
  const strategyNote = bt.mode === "dynamic" ? `${(DYNAMIC_STRATEGIES[bt.strategy] || {}).label || ""} · ` : "";
  const bestYearText = bt.bestYear ? `${bt.bestYear.year}년 ${formatSignedPct(bt.bestYear.return, 1)}` : "-";
  const worstYearText = bt.worstYear ? `${bt.worstYear.year}년 ${formatSignedPct(bt.worstYear.return, 1)}` : "-";
  const pieCaption = bt.mode === "dynamic" ? `<div class="chart-note">마지막 리밸런싱 시점 기준 비중</div>` : "";

  resultEl.innerHTML = `
    <div class="result-top">
      <div class="chart-wrap pie-wrap"><canvas id="pie-canvas"></canvas></div>
      <div class="quick-stats">
        <div class="quick-stat">
          <div class="quick-stat-label">연평균(CAGR)</div>
          <div class="quick-stat-value ${bt.cagr >= 0 ? "positive" : "negative"}">${formatSignedPct(bt.cagr, 2)}</div>
        </div>
        <div class="quick-stat">
          <div class="quick-stat-label">최대낙폭(MDD)</div>
          <div class="quick-stat-value negative">${formatPct(bt.mdd, 1)}</div>
        </div>
        <div class="quick-stat">
          <div class="quick-stat-label">연변동성</div>
          <div class="quick-stat-value">${formatPct(bt.annVol, 2)}</div>
        </div>
        <div class="quick-stat">
          <div class="quick-stat-label">샤프비율</div>
          <div class="quick-stat-value">${bt.sharpe.toFixed(2)}</div>
        </div>
      </div>
    </div>
    <div class="chart-legend" id="pie-legend"></div>
    ${pieCaption}

    <div class="result-hero">
      <div class="result-hero-label">최종 자산 (${bt.years.toFixed(1)}년 후 백테스트)</div>
      <div class="result-hero-value">${formatManwon(bt.finalValue)}</div>
      <div class="result-hero-sub">${bt.startDate} ~ ${bt.endDate} · 초기 투자금 ${formatManwon(bt.initialAmount)} · ${strategyNote}${rebalanceLabel}${feeNote}</div>
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
        <div class="result-stat-label">${statLabelWithInfo("최대낙폭 (MDD)", "mdd")}</div>
        <div class="result-stat-value negative">${formatPct(bt.mdd, 1)}</div>
      </div>
      <div class="result-stat">
        <div class="result-stat-label">${statLabelWithInfo("샤프비율", "sharpe")}</div>
        <div class="result-stat-value">${bt.sharpe.toFixed(2)}</div>
      </div>
      <div class="result-stat">
        <div class="result-stat-label">${statLabelWithInfo("소르티노비율", "sortino")}</div>
        <div class="result-stat-value">${bt.sortino.toFixed(2)}</div>
      </div>
      <div class="result-stat">
        <div class="result-stat-label">${statLabelWithInfo("칼마비율", "calmar")}</div>
        <div class="result-stat-value">${bt.calmar.toFixed(2)}</div>
      </div>
      <div class="result-stat">
        <div class="result-stat-label">월간 승률</div>
        <div class="result-stat-value">${formatPct(bt.winRate, 1)}</div>
      </div>
      <div class="result-stat">
        <div class="result-stat-label">데이터 개월 수</div>
        <div class="result-stat-value">${bt.months}개월</div>
      </div>
      <div class="result-stat">
        <div class="result-stat-label">최고의 해</div>
        <div class="result-stat-value positive">${bestYearText}</div>
      </div>
      <div class="result-stat">
        <div class="result-stat-label">최악의 해</div>
        <div class="result-stat-value negative">${worstYearText}</div>
      </div>
    </div>

    <h3 class="result-subheading">월별 수익률</h3>
    <div class="asset-table-wrap">
      <table class="asset-table monthly-table">
        ${buildMonthlyTable(bt)}
      </table>
    </div>
  `;
  renderPieChart(bt.finalWeights || {});
  renderLineChart(bt);
}

function buildMonthlyTable(bt) {
  const rows = monthlyReturnsTable(bt.dates, bt.monthlyReturns);
  const monthHeaders = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];
  const headerRow = `<tr><th>연도</th>${monthHeaders.map((m) => `<th>${m}</th>`).join("")}<th>연간</th></tr>`;
  const bodyRows = rows
    .map((row) => {
      const cells = row.months
        .map((r) => (r === null ? `<td>-</td>` : `<td class="${r >= 0 ? "positive" : "negative"}">${formatSignedPct(r, 1)}</td>`))
        .join("");
      const annualCls = row.annual >= 0 ? "positive" : "negative";
      return `<tr><td class="asset-name-cell">${row.year}</td>${cells}<td class="${annualCls}" style="font-weight:800">${formatSignedPct(row.annual, 1)}</td></tr>`;
    })
    .join("");
  return `<thead>${headerRow}</thead><tbody>${bodyRows}</tbody>`;
}

function runStaticCalc(amount, options) {
  const resultEl = document.getElementById("allocator-result");
  const total = weightSum();
  if (Math.abs(total - 100) > 0.05) {
    resultEl.innerHTML = `<p class="result-placeholder">비중 합계가 100%가 되어야 계산할 수 있습니다. (현재 ${total.toFixed(1)}%)</p>`;
    return null;
  }
  const weights = getWeightsFromInputs();
  const bt = runBacktest(weights, amount, options);
  if (!bt) {
    resultEl.innerHTML = `<p class="result-placeholder">선택한 자산 조합·기간의 공통 데이터 구간을 찾을 수 없습니다.</p>`;
    return null;
  }
  return bt;
}

function runDynamicCalc(amount, options) {
  const resultEl = document.getElementById("allocator-result");
  if (!selectedDynamicStrategy) {
    resultEl.innerHTML = `<p class="result-placeholder">동적 배분 전략을 선택해주세요.</p>`;
    return null;
  }
  const candidates = ASSET_ORDER.filter((t) => t !== "BIL" && isTickerActive(t));
  if (candidates.length === 0) {
    resultEl.innerHTML = `<p class="result-placeholder">후보로 삼을 자산에 비중(%)을 1개 이상 입력해주세요. (현금성자산 BIL은 대피처로 자동 사용되어 후보에서 제외됩니다)</p>`;
    return null;
  }

  const lookback = Math.max(1, Math.round(toNumber(document.getElementById("dynamic-lookback").value)) || 12);
  const params = { lookback };

  if (selectedDynamicStrategy === "momentum") {
    const topN = Math.round(toNumber(document.getElementById("dynamic-topn").value)) || 1;
    params.topN = Math.min(Math.max(1, topN), candidates.length);
  } else if (selectedDynamicStrategy === "trend") {
    const rawWeights = getWeightsFromInputs();
    const totalW = candidates.reduce((sum, t) => sum + (rawWeights[t] || 0), 0);
    const baseWeights = {};
    if (totalW > 0) {
      candidates.forEach((t) => (baseWeights[t] = (rawWeights[t] || 0) / totalW));
    } else {
      const eq = 1 / candidates.length;
      candidates.forEach((t) => (baseWeights[t] = eq));
    }
    params.baseWeights = baseWeights;
  }

  const bt = runDynamicBacktest(selectedDynamicStrategy, params, candidates, "BIL", amount, options);
  if (!bt) {
    resultEl.innerHTML = `<p class="result-placeholder">선택한 조건으로는 충분한 과거 데이터를 찾을 수 없습니다. 기준 기간을 줄이거나 백테스트 기간을 조정해보세요.</p>`;
    return null;
  }
  return bt;
}

function setupAllocator() {
  document.getElementById("allocator-calc-btn").addEventListener("click", () => {
    const amount = toNumber(document.getElementById("bt-amount").value) || 10000;
    const options = getBacktestOptions(allocationMode);
    const bt = allocationMode === "static" ? runStaticCalc(amount, options) : runDynamicCalc(amount, options);
    lastResult = bt;
    if (bt) renderResult(bt);
  });
}

/* 테마 전환 시 이미 그려진 차트가 있으면 새 테마 색상으로 다시 그린다 */
function refreshChartsForTheme() {
  if (!lastResult) return;
  renderPieChart(lastResult.finalWeights || {});
  renderLineChart(lastResult);
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
        <td class="asset-name-cell">${s.name}</td>
        <td>${formatAssetPrice(t, s.lastClose)}</td>
        <td class="${cls1m}">${formatSignedPct(s.oneMonthReturn, 1)}</td>
        <td class="${cls1y}">${s.oneYearReturn === null ? "-" : formatSignedPct(s.oneYearReturn, 1)}</td>
        <td>${formatSignedPct(s.cagr, 1)}</td>
        <td>${formatPct(s.annVol, 1)}</td>
      </tr>
    `;
  }).join("");
}

/* ---------- 자산 간 상관관계 표 ---------- */
function corrColor(v) {
  const t = Math.max(-1, Math.min(1, v));
  if (t >= 0) return `rgba(216, 49, 79, ${(t * 0.35).toFixed(3)})`;
  return `rgba(44, 158, 68, ${(-t * 0.35).toFixed(3)})`;
}

function renderCorrelationTable() {
  const table = document.getElementById("corr-table");
  if (!table) return;
  const matrix = correlationMatrix(ASSET_ORDER);

  const headerCells = ASSET_ORDER.map((t) => `<th title="${ASSET_DATA.assets[t].name}">${t}</th>`).join("");
  const rows = ASSET_ORDER.map((a) => {
    const cells = ASSET_ORDER.map((b) => {
      const v = matrix[a][b];
      const bg = a === b ? "transparent" : corrColor(v);
      return `<td style="background:${bg}">${v.toFixed(2)}</td>`;
    }).join("");
    return `<tr><th class="corr-row-label" title="${ASSET_DATA.assets[a].name}">${a}</th>${cells}</tr>`;
  }).join("");

  table.innerHTML = `<thead><tr><th></th>${headerCells}</tr></thead><tbody>${rows}</tbody>`;
}

/* ---------- 초기화 ---------- */
function init() {
  initThemeToggle();
  initMenu();
  initTabs();
  initInfoTooltips();
  initBacktestSettings();
  initDataOptionCheckboxes();
  initAssetAddSelect();
  initSavedPortfolios();
  initSelectBox("mode-select", (data) => setAllocationMode(data.mode));
  initSelectBox("preset-select", handlePresetSelect);
  initSelectBox("strategy-select", (data) => selectDynamicStrategy(data.strategy));
  setupAllocator();
  applyPreset("6040");
  renderDashboard();
  renderCorrelationTable();
}

document.addEventListener("DOMContentLoaded", init);
