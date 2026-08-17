/* ---------- 공통 유틸 ---------- */
function toNumber(str) {
  const n = Number(String(str || "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : NaN;
}

function parsePercent(str) {
  const n = Number(String(str || "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/* toNumber는 빈 값/잘못된 입력이면 NaN을 주므로, 0처럼 유효한 값을 기본값으로 잘못 덮어쓰지
   않도록 ||가 아닌 명시적 NaN 체크로 기본값을 적용한다 */
function toNumberOrDefault(str, fallback) {
  const n = toNumber(str);
  return Number.isFinite(n) ? n : fallback;
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
/* 이벤트 위임 사용 - 나중에 동적으로 추가되는 info-btn에도 자동으로 동작한다 */
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

/* 자산 추가 드롭다운은 한국자산/해외자산 아코디언 형태 - 분류를 누르면 그 안의 세부 자산이 펼쳐짐 */
let expandedAssetGroup = null;

function renderAssetAddOptions() {
  const dropdown = document.getElementById("asset-add-dropdown");
  if (!dropdown) return;
  const remaining = ASSET_ORDER.filter((t) => !addedTickers.includes(t));
  if (remaining.length === 0) {
    dropdown.innerHTML = `<div class="select-box-empty">추가할 수 있는 자산이 없습니다</div>`;
    return;
  }

  dropdown.innerHTML = ASSET_GROUP_ORDER.map((group) => {
    const tickers = remaining.filter((t) => ASSET_GROUP[t] === group);
    if (tickers.length === 0) return "";
    const isOpen = expandedAssetGroup === group;
    const items = tickers
      .map(
        (t) => `
          <button type="button" class="select-box-option" data-ticker="${t}" role="option">
            <div class="select-box-option-title">${ASSET_DATA.assets[t].name}</div>
          </button>
        `
      )
      .join("");
    return `
      <div class="asset-group-block${isOpen ? " open" : ""}">
        <button type="button" class="asset-group-header" data-group="${group}" aria-expanded="${isOpen}">
          <span>${ASSET_GROUP_LABEL[group]}</span>
          <span class="asset-group-caret" aria-hidden="true">${isOpen ? "▾" : "▸"}</span>
        </button>
        <div class="asset-group-body">${items}</div>
      </div>
    `;
  }).join("");
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
  // 비중 숫자를 안 쓰는 동적 전략(모멘텀/변동성 타겟팅) 중에는 후보 자격 유지를 위해 기본값을 1로 채운다
  const candidatesOnly = list.classList.contains("candidates-only");
  const initialValue = value > 0 ? value : candidatesOnly ? 1 : 0;
  const row = document.createElement("div");
  row.className = "weight-row";
  row.dataset.ticker = ticker;
  row.innerHTML = `
    <span class="weight-row-name">${ASSET_DATA.assets[ticker].name}</span>
    <div class="weight-row-input-wrap">
      <input type="text" inputmode="decimal" class="weight-input" data-ticker="${ticker}" value="${initialValue}" />
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
    e.stopPropagation();

    const groupHeader = e.target.closest(".asset-group-header");
    if (groupHeader) {
      const group = groupHeader.dataset.group;
      expandedAssetGroup = expandedAssetGroup === group ? null : group;
      renderAssetAddOptions();
      return;
    }

    const opt = e.target.closest(".select-box-option");
    if (!opt) return;
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
  bindThousandsInput("bt-monthly");

  let earliestYear = 9999;
  ASSET_ORDER.forEach((t) => {
    const y = Number(ASSET_DATA.assets[t].series[0].d.slice(0, 4));
    if (y < earliestYear) earliestYear = y;
  });
  const latestYear = Number(ASSET_DATA.updatedAt.slice(0, 4));

  const startYearSel = document.getElementById("bt-start-year");
  const endYearSel = document.getElementById("bt-end-year");
  if (startYearSel && endYearSel) {
    let options = `<option value="">전체</option>`;
    for (let y = latestYear; y >= earliestYear; y--) {
      options += `<option value="${y}">${y}년</option>`;
    }
    startYearSel.innerHTML = options;
    endYearSel.innerHTML = options;
  }

  const startMonthSel = document.getElementById("bt-start-month");
  const endMonthSel = document.getElementById("bt-end-month");
  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1)
    .map((m) => `<option value="${m}">${m}월</option>`)
    .join("");
  if (startMonthSel) {
    startMonthSel.innerHTML = monthOptions;
    startMonthSel.value = "1";
    startMonthSel.disabled = true;
  }
  if (endMonthSel) {
    endMonthSel.innerHTML = monthOptions;
    endMonthSel.value = "12";
    endMonthSel.disabled = true;
  }

  if (startYearSel && startMonthSel) {
    startYearSel.addEventListener("change", () => {
      startMonthSel.disabled = !startYearSel.value;
    });
  }
  if (endYearSel && endMonthSel) {
    endYearSel.addEventListener("change", () => {
      endMonthSel.disabled = !endYearSel.value;
    });
  }
}

/* ---------- 적립식 투자 옵션 (체크 시 초기 투자금액 옆에 매달 적립액 필드를 추가로 노출) ---------- */
function initDcaToggle() {
  const cb = document.getElementById("opt-dca");
  const monthlyGroup = document.getElementById("bt-monthly-group");
  const investRow = document.getElementById("bt-invest-row");
  if (!cb || !monthlyGroup || !investRow) return;
  cb.addEventListener("change", () => {
    monthlyGroup.hidden = !cb.checked;
    investRow.classList.toggle("field-row-3", cb.checked);
  });
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

/* 전략에 따라 입력한 비중 숫자를 실제로 쓰는지 여부가 달라 자산 목록 UI를 맞춰 바꾼다
   (듀얼 모멘텀/변동성 타겟팅은 숫자를 안 쓰므로 입력칸을 아예 숨기고 후보 이름만 보여준다) */
function updateWeightInputVisibility() {
  const list = document.getElementById("weight-list");
  const hint = document.getElementById("candidates-only-hint");
  const meta = DYNAMIC_STRATEGIES[selectedDynamicStrategy];
  const hideNumbers = allocationMode === "dynamic" && meta && !meta.usesWeightNumber;
  if (list) list.classList.toggle("candidates-only", hideNumbers);
  if (hint) hint.hidden = !hideNumbers;

  if (hideNumbers) {
    // 후보 판정은 "입력값 > 0"으로 하므로, 숫자를 숨긴 동안에도 후보 자격이 유지되도록 채워둔다
    document.querySelectorAll(".weight-input").forEach((inp) => {
      if (parsePercent(inp.value) <= 0) inp.value = "1";
    });
  }
}

function setAllocationMode(mode) {
  allocationMode = mode;
  const staticPanel = document.getElementById("static-mode-panel");
  const dynamicPanel = document.getElementById("dynamic-mode-panel");
  if (staticPanel) staticPanel.hidden = mode !== "static";
  if (dynamicPanel) dynamicPanel.hidden = mode !== "dynamic";

  const bar = document.getElementById("weight-total-bar");
  if (bar) bar.hidden = mode === "dynamic";

  // 안전자산 선택지는 자산 목록 아래(패널 밖)에 있어 배분 방식 전환 시 별도로 갱신해야 한다
  const safeAssetGroup = document.getElementById("dynamic-safe-asset-group");
  if (safeAssetGroup) {
    const meta = DYNAMIC_STRATEGIES[selectedDynamicStrategy];
    safeAssetGroup.hidden = mode !== "dynamic" || !(meta && meta.usesSafeAsset);
  }

  updateWeightInputVisibility();
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

  const safeAssetGroup = document.getElementById("dynamic-safe-asset-group");
  if (safeAssetGroup) safeAssetGroup.hidden = !(meta && meta.usesSafeAsset);

  updateWeightInputVisibility();
}

/* ---------- 동적 배분 안전자산(신호 부진 시 대피 자산) 선택 ---------- */
function populateSafeAssetSelect(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = ASSET_GROUP_ORDER.map((group) => {
    const tickers = ASSET_ORDER.filter((t) => ASSET_GROUP[t] === group);
    if (tickers.length === 0) return "";
    const opts = tickers.map((t) => `<option value="${t}">${ASSET_DATA.assets[t].name}</option>`).join("");
    return `<optgroup label="${ASSET_GROUP_LABEL[group]}">${opts}</optgroup>`;
  }).join("");
  sel.value = "BIL";
}

function getSafeAssetValue(selectId) {
  const sel = document.getElementById(selectId);
  return (sel && sel.value) || "BIL";
}

function getDynamicSafeAsset() {
  return getSafeAssetValue("dynamic-safe-asset");
}

/* ---------- 정적 배분 계절성 옵션 (특정 기간에만 투자, 나머지는 안전자산) ---------- */
function initStaticSeasonalToggle() {
  const cb = document.getElementById("opt-seasonal");
  const panel = document.getElementById("static-seasonal-panel");
  if (!cb || !panel) return;
  cb.addEventListener("change", () => {
    panel.hidden = !cb.checked;
  });
}

/* ---------- 탭 1: 배분 계산기 + 백테스트 (계산은 result.html에서 수행, 여기서는 검증 후 새 창을 연다) ---------- */

/* "0"~"100" 문자열을 0~1 사이 비율로 변환. 비어있거나 숫자가 아니면 defaultFraction 사용 */
function clampPct(str, defaultFraction) {
  const v = toNumber(str);
  if (!Number.isFinite(v)) return defaultFraction;
  return Math.min(Math.max(v, 0), 100) / 100;
}

function showCalcError(msg) {
  const el = document.getElementById("calc-error-msg");
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
}

function clearCalcError() {
  const el = document.getElementById("calc-error-msg");
  if (el) el.hidden = true;
}

/* 현재 입력 상태를 쿼리스트링으로 직렬화 - result.html이 같은 설정으로 다시 계산할 때 사용 */
function buildResultUrl() {
  const params = new URLSearchParams();
  params.set("mode", allocationMode);
  params.set("amount", String(toNumberOrDefault(document.getElementById("bt-amount").value, 10000)));
  params.set("fee", String(toNumberOrDefault(document.getElementById("bt-fee").value, 0)));

  const dcaCb = document.getElementById("opt-dca");
  params.set("dca", dcaCb && dcaCb.checked ? "1" : "0");
  params.set("monthly", String(toNumberOrDefault(document.getElementById("bt-monthly").value, 0)));

  const startYear = document.getElementById("bt-start-year").value;
  const endYear = document.getElementById("bt-end-year").value;
  const startMonth = document.getElementById("bt-start-month").value || "1";
  const endMonth = document.getElementById("bt-end-month").value || "12";
  if (startYear) params.set("start", `${startYear}-${startMonth.padStart(2, "0")}`);
  if (endYear) params.set("end", `${endYear}-${endMonth.padStart(2, "0")}`);

  const divCb = document.getElementById("opt-reinvest-div");
  const fxCb = document.getElementById("opt-reflect-fx");
  params.set("adj", divCb && divCb.checked ? "1" : "0");
  params.set("fx", fxCb && fxCb.checked ? "1" : "0");

  const weights = getWeightsFromInputs();
  const w = Object.keys(weights)
    .map((t) => `${t}:${(weights[t] * 100).toFixed(4)}`)
    .join(",");
  params.set("w", w);

  if (allocationMode === "dynamic") {
    params.set("strategy", selectedDynamicStrategy || "");
    params.set("safeAsset", getDynamicSafeAsset());
    params.set("lookback", document.getElementById("dynamic-lookback").value || "12");
    params.set("dynRebalance", document.getElementById("dynamic-rebalance").value || "1");
    if (selectedDynamicStrategy === "momentum") {
      params.set("topn", document.getElementById("dynamic-topn").value || "1");
    }
  } else {
    params.set("rebalance", document.getElementById("static-rebalance").value || "1");

    const seasonalCb = document.getElementById("opt-seasonal");
    if (seasonalCb && seasonalCb.checked) {
      params.set("seasonal", "1");
      params.set("seasonStart", document.getElementById("static-season-start").value || "11");
      params.set("seasonEnd", document.getElementById("static-season-end").value || "4");
      params.set("seasonInPct", document.getElementById("static-season-in-pct").value || "100");
      params.set("seasonOutPct", document.getElementById("static-season-out-pct").value || "0");
      params.set("staticSafeAsset", getSafeAssetValue("static-safe-asset"));
    }
  }

  return `result.html?${params.toString()}`;
}

function setupAllocator() {
  document.getElementById("allocator-calc-btn").addEventListener("click", () => {
    clearCalcError();

    if (allocationMode === "static") {
      const total = weightSum();
      if (Math.abs(total - 100) > 0.05) {
        showCalcError(`비중 합계가 100%가 되어야 계산할 수 있습니다. (현재 ${total.toFixed(1)}%)`);
        return;
      }
    } else {
      if (!selectedDynamicStrategy) {
        showCalcError("동적 배분 전략을 선택해주세요.");
        return;
      }
      const safeAsset = getDynamicSafeAsset();
      const candidates = ASSET_ORDER.filter((t) => t !== safeAsset && isTickerActive(t));
      if (candidates.length === 0) {
        const safeAssetName = (ASSET_DATA.assets[safeAsset] || {}).name || safeAsset;
        showCalcError(`후보로 삼을 자산에 비중(%)을 1개 이상 입력해주세요. (안전자산으로 지정한 ${safeAssetName}은 대피처로 자동 사용되어 후보에서 제외됩니다)`);
        return;
      }
    }

    const dcaCb = document.getElementById("opt-dca");
    if (dcaCb && dcaCb.checked) {
      const monthly = toNumber(document.getElementById("bt-monthly").value);
      if (!Number.isFinite(monthly) || monthly <= 0) {
        showCalcError("매달 적립액을 0보다 크게 입력해주세요.");
        return;
      }
    } else {
      const amount = toNumber(document.getElementById("bt-amount").value);
      if (!Number.isFinite(amount) || amount <= 0) {
        showCalcError("초기 투자금액을 0보다 크게 입력해주세요.");
        return;
      }
    }

    window.open(buildResultUrl(), "_blank");
  });
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
  initDcaToggle();
  initAssetAddSelect();
  initSavedPortfolios();
  populateSafeAssetSelect("dynamic-safe-asset");
  populateSafeAssetSelect("static-safe-asset");
  initStaticSeasonalToggle();
  initSelectBox("mode-select", (data) => setAllocationMode(data.mode));
  initSelectBox("preset-select", handlePresetSelect);
  initSelectBox("strategy-select", (data) => selectDynamicStrategy(data.strategy));
  setupAllocator();
  updateWeightTotal();
  renderDashboard();
  renderCorrelationTable();
}

document.addEventListener("DOMContentLoaded", init);
