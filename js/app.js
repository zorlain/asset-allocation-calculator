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
function activateTab(target) {
  const tabs = document.getElementById("tabs");
  const btn = tabs.querySelector(`.tab-btn[data-tab="${target}"]`);
  if (!btn) return false;
  tabs.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
  document.querySelectorAll("[data-tab-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.tabPanel !== target;
  });
  return true;
}

function initTabs() {
  const tabs = document.getElementById("tabs");
  tabs.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab-btn");
    if (!btn) return;
    activateTab(btn.dataset.tab);
  });

  // 다른 사이트(예: 은퇴계산기 리다이렉트)에서 #retirement 처럼 해시로 들어오면 해당 탭을 바로 연다
  const hashTab = location.hash.replace("#", "");
  if (hashTab) activateTab(hashTab);
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
    syncOffensiveOverrideFromWeightList();
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
    syncOffensiveOverrideFromWeightList();
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

  // 안전자산 선택지·리스크 관리 섹션은 자산 목록 아래(패널 밖)에 있어 배분 방식 전환 시
  // 별도로 갱신해야 한다. 전략과 무관하게 동적 배분에서는 항상 노출(리스크 관리가 안전자산을
  // 쓸 수 있어 전략 자체가 안전자산을 안 쓰더라도 숨기지 않는다).
  const safeAssetGroup = document.getElementById("dynamic-safe-asset-group");
  if (safeAssetGroup) safeAssetGroup.hidden = mode !== "dynamic";
  const riskSection = document.getElementById("risk-management-section");
  if (riskSection) riskSection.hidden = mode !== "dynamic";

  // 전략 자산 역할 편집기(기준자산·전략 안전자산)도 자산 목록 아래(패널 밖)에 있어 별도로 갱신
  const meta = DYNAMIC_STRATEGIES[selectedDynamicStrategy];
  if (mode === "dynamic" && meta && meta.isNamedPreset) {
    renderPresetRoleEditor(selectedDynamicStrategy);
  } else {
    const roleEditor = document.getElementById("preset-role-editor");
    if (roleEditor) roleEditor.hidden = true;
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

/* 이름있는 전략(자산 구성이 고정된 프리셋)을 고르면 후보 목록을 자동으로 채우고, 신호 계산에
   필요한 최소 개월 수(lookback)를 숨겨진 필드에 심어둔다 - buildResultUrl이 그대로 읽어간다 */
const NAMED_PRESET_LOOKBACK = { gem: 12, gtaa: 10, vaa: 12, daa: 12, baa: 12, paa: 12, laa: 10 };

function applyDynamicStrategyPreset(key) {
  const preset = getEffectivePreset(key);
  if (!preset) return;
  document.getElementById("weight-list").innerHTML = "";
  addedTickers = [];
  const tickers = preset.offensive || preset.core || [];
  tickers.forEach((t) => addAssetRow(t, 1));
  renderAssetAddOptions();

  const lookbackInput = document.getElementById("dynamic-lookback");
  if (lookbackInput) lookbackInput.value = String(NAMED_PRESET_LOOKBACK[key] || 12);
}

/* ---------- 이름있는 전략의 위험자산(offensive/core) 목록을 자산 목록 UI(weight-list)에서
   추가/제거할 때, 그 변경분을 오버라이드에 반영한다 - 사용자가 실제로 손댔을 때만 호출되어야
   하므로 초기 프리셋 채우기(applyDynamicStrategyPreset)에서는 호출하지 않는다 */
function syncOffensiveOverrideFromWeightList() {
  const meta = DYNAMIC_STRATEGIES[selectedDynamicStrategy];
  if (allocationMode !== "dynamic" || !meta || !meta.isNamedPreset) return;
  const base = NAMED_STRATEGY_PRESETS[selectedDynamicStrategy];
  if (!base || addedTickers.length === 0) return;
  const field = base.core ? "core" : "offensive";
  const current = getEffectivePreset(selectedDynamicStrategy);
  setPresetOverride(selectedDynamicStrategy, { ...current, [field]: [...addedTickers] });
  renderPresetRoleEditor(selectedDynamicStrategy);
}

/* ---------- 이름있는 전략의 나머지 자산 역할(기준자산·안전자산 등) 편집 ----------
   위험자산(offensive/core)은 기존 자산 목록(weight-list)을 그대로 재사용하고, 여기서는 전략별로
   구조가 다른 나머지 역할만 그린다: GEM=안전자산(단일), GTAA=없음(전역 안전자산 사용),
   VAA/DAA/BAA/PAA=기준자산+안전자산(다중), LAA=상승/하락 전환자산(단일 2개) */
function assetSelectOptionsHtml() {
  return ASSET_GROUP_ORDER.map((group) => {
    const tickers = ASSET_ORDER.filter((t) => ASSET_GROUP[t] === group);
    if (tickers.length === 0) return "";
    const opts = tickers.map((t) => `<option value="${t}">${ASSET_DATA.assets[t].name}</option>`).join("");
    return `<optgroup label="${ASSET_GROUP_LABEL[group]}">${opts}</optgroup>`;
  }).join("");
}

function renderRoleChipBlock(key, field, label) {
  const preset = getEffectivePreset(key);
  const tickers = preset[field] || [];
  const excluded = ASSET_ORDER.filter((t) => !tickers.includes(t));
  const addOptions = excluded.length
    ? ASSET_GROUP_ORDER.map((group) => {
        const gTickers = excluded.filter((t) => ASSET_GROUP[t] === group);
        if (gTickers.length === 0) return "";
        const opts = gTickers.map((t) => `<option value="${t}">${ASSET_DATA.assets[t].name}</option>`).join("");
        return `<optgroup label="${ASSET_GROUP_LABEL[group]}">${opts}</optgroup>`;
      }).join("")
    : "";
  const chips = tickers.length
    ? tickers
        .map(
          (t) => `
        <span class="ticker-chip" data-ticker="${t}">
          ${ASSET_DATA.assets[t].name}
          <button type="button" class="ticker-chip-remove" data-role="${field}" data-ticker="${t}" aria-label="${ASSET_DATA.assets[t].name} 제거">×</button>
        </span>`
        )
        .join("")
    : `<span class="chip-empty-hint">없음</span>`;
  return `
    <div class="role-block" data-role="${field}">
      <div class="role-block-label">${label}</div>
      <div class="role-chip-list">${chips}</div>
      <select class="select-input role-add-select" data-role="${field}" ${excluded.length ? "" : "disabled"}>
        <option value="">${excluded.length ? "+ 자산 추가" : "추가할 자산 없음"}</option>
        ${addOptions}
      </select>
    </div>
  `;
}

function renderRoleSingleBlock(key, field, label) {
  const preset = getEffectivePreset(key);
  return `
    <div class="role-block" data-role="${field}">
      <div class="role-block-label">${label}</div>
      <select class="select-input role-single-select" data-role="${field}">${assetSelectOptionsHtml()}</select>
    </div>
  `;
}

function renderPresetRoleEditor(key) {
  const container = document.getElementById("preset-role-editor");
  if (!container) return;
  const base = NAMED_STRATEGY_PRESETS[key];
  if (!base) {
    container.hidden = true;
    return;
  }
  const preset = getEffectivePreset(key);

  let html = "";
  if (preset.kind === "momentum") {
    html += renderRoleSingleBlock(key, "defensiveAsset", "전략 안전자산 (상대모멘텀 열세 시 대피 자산)");
  } else if (preset.kind === "canaryBreadth") {
    if (preset.canary) html += renderRoleChipBlock(key, "canary", "기준자산 (캐너리 - 위험 신호 판단용)");
    html += renderRoleChipBlock(key, "defensive", "전략 안전자산 (방어 자산군)");
  } else if (preset.kind === "laa") {
    html += renderRoleSingleBlock(key, "switchOn", "전환자산 - 상승장일 때");
    html += renderRoleSingleBlock(key, "switchOff", "전환자산 - 하락장일 때 (안전자산)");
  }

  if (!html) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }

  const overridden = !!PRESET_OVERRIDES[key];
  html += `<button type="button" class="role-reset-btn" id="preset-role-reset" ${overridden ? "" : "disabled"}>이 전략을 기본 구성으로 되돌리기</button>`;
  container.innerHTML = html;
  container.hidden = false;

  container.querySelectorAll(".role-single-select").forEach((sel) => {
    sel.value = preset[sel.dataset.role];
  });

  bindPresetRoleEditorEvents(key);
}

function updatePresetRoleField(key, field, value) {
  const current = getEffectivePreset(key);
  setPresetOverride(key, { ...current, [field]: value });
  renderPresetRoleEditor(key);
}

function bindPresetRoleEditorEvents(key) {
  const container = document.getElementById("preset-role-editor");
  if (!container) return;

  container.querySelectorAll(".role-add-select").forEach((sel) => {
    sel.addEventListener("change", () => {
      const field = sel.dataset.role;
      const ticker = sel.value;
      if (!ticker) return;
      const current = getEffectivePreset(key);
      const list = current[field] || [];
      if (list.includes(ticker)) return;
      updatePresetRoleField(key, field, [...list, ticker]);
    });
  });

  container.querySelectorAll(".ticker-chip-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      const field = btn.dataset.role;
      const current = getEffectivePreset(key);
      const list = (current[field] || []).filter((t) => t !== btn.dataset.ticker);
      if (list.length === 0) return; // 최소 1개는 유지 (0개면 신호 계산이 불가능해짐)
      updatePresetRoleField(key, field, list);
    });
  });

  container.querySelectorAll(".role-single-select").forEach((sel) => {
    sel.addEventListener("change", () => updatePresetRoleField(key, sel.dataset.role, sel.value));
  });

  const resetBtn = document.getElementById("preset-role-reset");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      clearPresetOverride(key);
      applyDynamicStrategyPreset(key);
      renderPresetRoleEditor(key);
    });
  }
}

/* ---------- 동적 전략 상자 ---------- */
function selectDynamicStrategy(key) {
  selectedDynamicStrategy = key;
  const meta = DYNAMIC_STRATEGIES[key];
  const tipEl = document.getElementById("dynamic-strategy-tip");
  if (tipEl && meta) tipEl.textContent = meta.tip;

  const isNamedPreset = !!(meta && meta.isNamedPreset);
  const topNGroup = document.getElementById("dynamic-topn-group");
  if (topNGroup) topNGroup.hidden = isNamedPreset || !(meta && meta.showTopN);
  const lookbackRow = document.getElementById("dynamic-lookback-row");
  if (lookbackRow) lookbackRow.hidden = isNamedPreset || !(meta && meta.showLookback);
  const namedHint = document.getElementById("named-preset-hint");
  if (namedHint) namedHint.hidden = !isNamedPreset;

  if (isNamedPreset) {
    applyDynamicStrategyPreset(key);
    renderPresetRoleEditor(key);
  } else {
    const roleEditor = document.getElementById("preset-role-editor");
    if (roleEditor) {
      roleEditor.hidden = true;
      roleEditor.innerHTML = "";
    }
  }

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

/* ---------- 동적 배분 리스크 관리 (전략이 정한 비중을 재조정) ---------- */
let selectedRiskMode = "none";

function selectRiskMode(mode) {
  selectedRiskMode = mode;
  const volGroup = document.getElementById("risk-target-vol-group");
  if (volGroup) volGroup.hidden = mode !== "volTarget";
}

function initRiskModeSelect() {
  initSelectBox("risk-mode-select", (data) => selectRiskMode(data.risk));
}

function initTargetVolChips() {
  const wrap = document.getElementById("target-vol-presets");
  const input = document.getElementById("risk-target-vol");
  if (!wrap || !input) return;
  wrap.addEventListener("click", (e) => {
    const chip = e.target.closest(".target-vol-chip");
    if (!chip) return;
    input.value = chip.dataset.vol;
    wrap.querySelectorAll(".target-vol-chip").forEach((c) => c.classList.toggle("active", c === chip));
  });
  input.addEventListener("input", () => {
    wrap.querySelectorAll(".target-vol-chip").forEach((c) => c.classList.toggle("active", c.dataset.vol === input.value));
  });
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
    if (selectedDynamicStrategy === "momentum" || selectedDynamicStrategy === "relMomentum") {
      params.set("topn", document.getElementById("dynamic-topn").value || "2");
    }
    const meta = DYNAMIC_STRATEGIES[selectedDynamicStrategy];
    if (meta && meta.isNamedPreset && PRESET_OVERRIDES[selectedDynamicStrategy]) {
      params.set("presetOverride", JSON.stringify(PRESET_OVERRIDES[selectedDynamicStrategy]));
    }

    params.set("riskMode", selectedRiskMode || "none");
    if (selectedRiskMode === "volTarget") {
      params.set("targetVol", document.getElementById("risk-target-vol").value || "10");
    }
    const maxWeight = document.getElementById("risk-max-weight").value;
    if (maxWeight) params.set("maxWeightPct", maxWeight);
    const minCash = document.getElementById("risk-min-cash").value;
    if (minCash) params.set("minCashPct", minCash);
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

/* ---------- 입력 상태 자동 저장/복원 ----------
   결과창(새 탭)에서 뒤로가기를 누르면 처음부터 다시 입력해야 하는 불편을 없애기 위해, 페이지를
   벗어날 때마다(계산 버튼 클릭·다른 페이지로 이동 등) 현재 입력 상태를 저장해두고 다시 방문했을
   때 그대로 복원한다. buildResultUrl()이 이미 모든 입력을 쿼리스트링으로 직렬화하므로 그 포맷을
   그대로 재사용한다(모바일 인앱 브라우저 등 새 탭이 아니라 같은 탭에서 이동하는 경우를 대비). */
const AUTOSAVE_KEY = "aa-calc-autosave-v1";

function saveStateSnapshot() {
  try {
    localStorage.setItem(AUTOSAVE_KEY, buildResultUrl().replace(/^result\.html\?/, ""));
  } catch {
    /* localStorage 사용 불가 시 조용히 무시 */
  }
}

function applyWeightsFromParam(wParam) {
  document.getElementById("weight-list").innerHTML = "";
  addedTickers = [];
  if (!wParam) return;
  wParam.split(",").forEach((pair) => {
    const [ticker, pct] = pair.split(":");
    if (ticker && ASSET_DATA.assets[ticker]) addAssetRow(ticker, Number(pct) || 0);
  });
}

function restoreSavedState() {
  let raw;
  try {
    raw = localStorage.getItem(AUTOSAVE_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  const params = new URLSearchParams(raw);
  const strategy = params.get("strategy");

  if (strategy && params.has("presetOverride")) {
    try {
      setPresetOverride(strategy, JSON.parse(params.get("presetOverride")));
    } catch {
      /* 무시하고 기본 구성으로 진행 */
    }
  }

  const mode = params.get("mode") === "dynamic" ? "dynamic" : "static";
  document.querySelector(`#mode-select [data-mode="${mode}"]`)?.click();

  if (mode === "dynamic") {
    if (strategy) document.querySelector(`#strategy-select [data-strategy="${strategy}"]`)?.click();
    const meta = DYNAMIC_STRATEGIES[strategy];
    if (!(meta && meta.isNamedPreset)) applyWeightsFromParam(params.get("w"));

    const safeSel = document.getElementById("dynamic-safe-asset");
    if (safeSel && params.get("safeAsset")) safeSel.value = params.get("safeAsset");
    if (params.has("lookback")) document.getElementById("dynamic-lookback").value = params.get("lookback");
    if (params.has("dynRebalance")) document.getElementById("dynamic-rebalance").value = params.get("dynRebalance");
    if (params.has("topn")) document.getElementById("dynamic-topn").value = params.get("topn");

    const riskMode = params.get("riskMode") || "none";
    document.querySelector(`#risk-mode-select [data-risk="${riskMode}"]`)?.click();
    if (params.has("targetVol")) document.getElementById("risk-target-vol").value = params.get("targetVol");
    if (params.has("maxWeightPct")) document.getElementById("risk-max-weight").value = params.get("maxWeightPct");
    if (params.has("minCashPct")) document.getElementById("risk-min-cash").value = params.get("minCashPct");
  } else {
    applyWeightsFromParam(params.get("w"));
    if (params.has("rebalance")) document.getElementById("static-rebalance").value = params.get("rebalance");

    const seasonalCb = document.getElementById("opt-seasonal");
    if (seasonalCb) {
      seasonalCb.checked = params.get("seasonal") === "1";
      seasonalCb.dispatchEvent(new Event("change"));
    }
    if (params.has("seasonStart")) document.getElementById("static-season-start").value = params.get("seasonStart");
    if (params.has("seasonEnd")) document.getElementById("static-season-end").value = params.get("seasonEnd");
    if (params.has("seasonInPct")) document.getElementById("static-season-in-pct").value = params.get("seasonInPct");
    if (params.has("seasonOutPct")) document.getElementById("static-season-out-pct").value = params.get("seasonOutPct");
    const staticSafeSel = document.getElementById("static-safe-asset");
    if (staticSafeSel && params.get("staticSafeAsset")) staticSafeSel.value = params.get("staticSafeAsset");
  }

  if (params.has("amount")) document.getElementById("bt-amount").value = Number(params.get("amount")).toLocaleString("ko-KR");
  if (params.has("fee")) document.getElementById("bt-fee").value = params.get("fee");

  const dcaCb = document.getElementById("opt-dca");
  if (dcaCb) {
    dcaCb.checked = params.get("dca") === "1";
    dcaCb.dispatchEvent(new Event("change"));
  }
  if (params.has("monthly")) document.getElementById("bt-monthly").value = Number(params.get("monthly")).toLocaleString("ko-KR");

  const start = params.get("start");
  if (start) {
    const [y, m] = start.split("-");
    const startYearSel = document.getElementById("bt-start-year");
    if (startYearSel) {
      startYearSel.value = y;
      startYearSel.dispatchEvent(new Event("change"));
    }
    const startMonthSel = document.getElementById("bt-start-month");
    if (startMonthSel) startMonthSel.value = String(Number(m));
  }
  const end = params.get("end");
  if (end) {
    const [y, m] = end.split("-");
    const endYearSel = document.getElementById("bt-end-year");
    if (endYearSel) {
      endYearSel.value = y;
      endYearSel.dispatchEvent(new Event("change"));
    }
    const endMonthSel = document.getElementById("bt-end-month");
    if (endMonthSel) endMonthSel.value = String(Number(m));
  }

  const divCb = document.getElementById("opt-reinvest-div");
  const fxCb = document.getElementById("opt-reflect-fx");
  if (divCb) divCb.checked = params.get("adj") === "1";
  if (fxCb) fxCb.checked = params.get("fx") === "1";
  if (divCb?.checked || fxCb?.checked) {
    setDataOptions({ useAdjClose: !!(divCb && divCb.checked), reflectFx: !!(fxCb && fxCb.checked) });
    renderDashboard();
    renderCorrelationTable();
  }

  updateWeightTotal();
  updateWeightInputVisibility();
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
      if (selectedRiskMode === "volTarget") {
        const targetVol = toNumber(document.getElementById("risk-target-vol").value);
        if (!Number.isFinite(targetVol) || targetVol <= 0) {
          showCalcError("목표 변동성을 0보다 크게 입력해주세요.");
          return;
        }
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

    saveStateSnapshot();
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

/* ---------- 은퇴계산기 (은퇴자산계산기에서 통합) ---------- */

/* 자산이 매달 인출되어 소진되는 과정을 시뮬레이션 (연 단위로 인출액이 증가) */
function simulateDepletion(startAsset, initialMonthlyWithdrawal, annualRatePct, inflationPct, capYears) {
  const monthlyRate = annualRatePct / 100 / 12;
  let balance = startAsset;
  let withdrawal = initialMonthlyWithdrawal;
  const yearly = [Math.round(balance)];

  for (let y = 1; y <= capYears; y++) {
    for (let m = 0; m < 12; m++) {
      balance = balance * (1 + monthlyRate) - withdrawal;
      if (balance <= 0) {
        yearly.push(0);
        return { depleted: true, years: y - 1 + (m + 1) / 12, yearly };
      }
    }
    yearly.push(Math.round(balance));
    withdrawal = withdrawal * (1 + inflationPct / 100);
  }
  return { depleted: false, years: capYears, finalBalance: balance, yearly };
}

/* ---------- 연도별 자산 증감 막대그래프 ---------- */
function renderGrowthChart(yearly, title, maxBars = 16) {
  const years = yearly.length - 1;
  const step = Math.max(1, Math.ceil(years / maxBars));

  const points = [];
  for (let y = 0; y <= years; y += step) points.push({ year: y, value: yearly[y] });
  if (points[points.length - 1].year !== years) points.push({ year: years, value: yearly[years] });

  const maxValue = Math.max(...points.map((p) => p.value), 1);

  const bars = points
    .map((p) => {
      const heightPct = Math.max(2, (p.value / maxValue) * 100);
      return `
        <div class="growth-chart-col">
          <div class="growth-chart-value">${formatManwon(p.value)}</div>
          <div class="growth-chart-bar" style="height:${heightPct}%"></div>
          <div class="growth-chart-label">${p.year}년</div>
        </div>
      `;
    })
    .join("");

  return `
    <div class="growth-chart">
      <div class="growth-chart-title">${title || "연도별 예상 자산 성장"}</div>
      <div class="growth-chart-bars">${bars}</div>
    </div>
  `;
}

let goalState = null; // 1단계 결과: { target, years, rate, inflation, monthlySpend, futureMonthlySpend }
let savingState = null; // 2단계 결과: { currentAsset, requiredSaving }

/* ---------- 1단계: 목표 자산 계산 ---------- */
function recalcGoal() {
  const resultEl = document.getElementById("goal-result");
  if (!resultEl) return;
  const monthlySpend = toNumber(document.getElementById("goal-spend").value);
  const rate = toNumber(document.getElementById("goal-rate").value);
  const years = Math.round(toNumber(document.getElementById("goal-years").value));
  const inflation = toNumber(document.getElementById("goal-inflation").value);

  if (!monthlySpend || monthlySpend <= 0 || !Number.isFinite(rate) || !years || years <= 0 || !Number.isFinite(inflation)) {
    resultEl.innerHTML = `<p class="result-placeholder">월 생활비, 예상 연 수익률, 은퇴 시기, 인플레이션을 모두 입력합니다.</p>`;
    goalState = null;
    refreshDownstreamFromGoal();
    return;
  }

  const realWithdrawalRate = rate - inflation;
  if (realWithdrawalRate <= 0) {
    resultEl.innerHTML = `<p class="result-placeholder">예상 연 수익률이 인플레이션보다 높아야 계산할 수 있습니다.</p>`;
    goalState = null;
    refreshDownstreamFromGoal();
    return;
  }

  const futureMonthlySpend = monthlySpend * Math.pow(1 + inflation / 100, years);
  const target = (futureMonthlySpend * 12) / (realWithdrawalRate / 100);

  goalState = { target, years, rate, inflation, monthlySpend, futureMonthlySpend };

  resultEl.innerHTML = `
    <div class="result-hero">
      <div class="result-hero-label">${years}년 후 낙원을 이루기 위한 자산</div>
      <div class="result-hero-value">${formatManwon(target)}</div>
      <div class="result-hero-sub">실질 인출률 ${realWithdrawalRate.toFixed(1)}% (수익률 ${rate}% − 인플레이션 ${inflation}%) 기준</div>
    </div>
    <div class="result-grid">
      <div class="result-stat">
        <div class="result-stat-label">현재 기준 월 생활비</div>
        <div class="result-stat-value">${formatManwon(monthlySpend)}</div>
      </div>
      <div class="result-stat">
        <div class="result-stat-label">${years}년 후 월 생활비(인플레 반영)</div>
        <div class="result-stat-value">${formatManwon(futureMonthlySpend)}</div>
      </div>
    </div>
  `;

  refreshDownstreamFromGoal();
}

/* 하위 계산의 자동 채움 값을 최신 goalState 기준으로 갱신하고 연쇄 재계산 */
function refreshDownstreamFromGoal() {
  const depletionContext = document.getElementById("depletion-context");
  if (!depletionContext) return;

  if (!goalState) {
    depletionContext.textContent = "먼저 위에서 목표 자산을 계산합니다.";
    document.getElementById("saving-result").innerHTML = "";
    document.getElementById("depletion-result").innerHTML = "";
    savingState = null;
    return;
  }

  const depletionAssetEl = document.getElementById("depletion-asset");
  const depletionWithdrawalEl = document.getElementById("depletion-withdrawal");
  if (!depletionAssetEl.value) depletionAssetEl.value = Math.round(goalState.target).toLocaleString("ko-KR");
  if (!depletionWithdrawalEl.value) depletionWithdrawalEl.value = Math.round(goalState.futureMonthlySpend).toLocaleString("ko-KR");
  depletionContext.textContent = `수익률 ${goalState.rate}% · 인플레이션 ${goalState.inflation}% 기준으로 계산합니다. 값은 직접 바꿀 수 있습니다.`;

  recalcSaving();
  recalcDepletion();
}

function setupGoal() {
  if (!document.getElementById("goal-spend")) return;
  bindThousandsInput("goal-spend");
  ["goal-spend", "goal-rate", "goal-years", "goal-inflation"].forEach((id) => {
    document.getElementById(id).addEventListener("input", recalcGoal);
  });
}

/* ---------- 2단계: 필요 월 저축액 ---------- */
function recalcSaving() {
  const resultEl = document.getElementById("saving-result");
  if (!resultEl) return;

  if (!goalState) {
    resultEl.innerHTML = "";
    savingState = null;
    return;
  }

  const currentAsset = toNumber(document.getElementById("saving-current-asset").value) || 0;
  const monthlyRate = goalState.rate / 100 / 12;
  const months = goalState.years * 12;
  const futureValueOfCurrent = currentAsset * Math.pow(1 + monthlyRate, months);

  if (futureValueOfCurrent >= goalState.target) {
    savingState = { currentAsset, requiredSaving: 0 };
    resultEl.innerHTML = `
      <div class="result-hero">
        <div class="result-hero-label">필요 월 저축액</div>
        <div class="result-hero-value positive">0원</div>
        <div class="result-hero-sub">현재 자산만으로도 ${goalState.years}년 후 목표(${formatManwon(goalState.target)})에 도달합니다.</div>
      </div>
    `;
    return;
  }

  const requiredSaving =
    monthlyRate === 0
      ? (goalState.target - futureValueOfCurrent) / months
      : (goalState.target - futureValueOfCurrent) / ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate);

  savingState = { currentAsset, requiredSaving };

  resultEl.innerHTML = `
    <div class="result-hero">
      <div class="result-hero-label">목표 달성을 위한 필요 월 저축액</div>
      <div class="result-hero-value">${formatManwon(requiredSaving)}</div>
      <div class="result-hero-sub">${goalState.years}년 후 ${formatManwon(goalState.target)} 목표 기준</div>
    </div>
  `;
}

function setupSaving() {
  if (!document.getElementById("saving-current-asset")) return;
  bindThousandsInput("saving-current-asset");
  document.getElementById("saving-current-asset").addEventListener("input", recalcSaving);
}

/* ---------- 은퇴 후 자산 소진 검증 ---------- */
function recalcDepletion() {
  const resultEl = document.getElementById("depletion-result");
  if (!resultEl) return;
  if (!goalState) {
    resultEl.innerHTML = `<p class="result-placeholder">먼저 위에서 목표 자산을 계산합니다.</p>`;
    return;
  }

  const retireAsset = toNumber(document.getElementById("depletion-asset").value);
  const withdrawal = toNumber(document.getElementById("depletion-withdrawal").value);
  const rate = goalState.rate;
  const inflation = goalState.inflation;

  if (!retireAsset || retireAsset <= 0 || !withdrawal || withdrawal <= 0) {
    resultEl.innerHTML = `<p class="result-placeholder">은퇴 시점 자산과 월 인출액을 입력합니다.</p>`;
    return;
  }

  const capYears = 60;
  const result = simulateDepletion(retireAsset, withdrawal, rate, inflation, capYears);

  if (result.depleted) {
    resultEl.innerHTML = `
      <div class="result-hero">
        <div class="result-hero-label">자산 소진까지 예상 기간</div>
        <div class="result-hero-value negative">약 ${result.years.toFixed(1)}년</div>
        <div class="result-hero-sub">이 시점 이후에도 같은 조건으로 인출을 지속하면 자산이 바닥날 것으로 예상됩니다.</div>
      </div>
      ${renderGrowthChart(result.yearly, "연도별 예상 자산 잔액", 6)}
    `;
  } else {
    resultEl.innerHTML = `
      <div class="result-hero">
        <div class="result-hero-label">${capYears}년 후 잔액</div>
        <div class="result-hero-value positive">${formatManwon(result.finalBalance)}</div>
        <div class="result-hero-sub">${capYears}년 동안 자산이 소진되지 않을 것으로 예상됩니다.</div>
      </div>
      ${renderGrowthChart(result.yearly, "연도별 예상 자산 잔액", 6)}
    `;
  }
}

function setupDepletion() {
  if (!document.getElementById("depletion-asset")) return;
  bindThousandsInput("depletion-asset");
  bindThousandsInput("depletion-withdrawal");
  document.getElementById("depletion-asset").addEventListener("input", recalcDepletion);
  document.getElementById("depletion-withdrawal").addEventListener("input", recalcDepletion);
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
  initRiskModeSelect();
  initTargetVolChips();
  initSelectBox("mode-select", (data) => setAllocationMode(data.mode));
  initSelectBox("preset-select", handlePresetSelect);
  initSelectBox("strategy-select", (data) => selectDynamicStrategy(data.strategy));
  setupAllocator();
  updateWeightTotal();
  renderDashboard();
  renderCorrelationTable();

  setupGoal();
  setupSaving();
  setupDepletion();
  recalcGoal();

  restoreSavedState();
  window.addEventListener("pagehide", saveStateSnapshot);
}

document.addEventListener("DOMContentLoaded", init);
