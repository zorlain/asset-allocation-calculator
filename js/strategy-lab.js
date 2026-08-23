/* ---------- 전략 탭: 팩터 백테스트 UI 연결 ---------- */

function factorDataAvailable() {
  return typeof FACTOR_DATA !== "undefined" && FACTOR_DATA.stocks && Object.keys(FACTOR_DATA.stocks).length > 0;
}

/* 전체 데이터에서 가장 이르고 늦은 월봉 날짜를 찾아 시작/종료 select 범위를 정한다 */
function priceDateRange() {
  let min = null;
  let max = null;
  Object.values(FACTOR_DATA.stocks).forEach((s) => {
    if (!s.prices || s.prices.length === 0) return;
    const first = s.prices[0].d;
    const last = s.prices[s.prices.length - 1].d;
    if (!min || first < min) min = first;
    if (!max || last > max) max = last;
  });
  return { min, max };
}

function fillYearMonthSelect(yearSel, monthSel, minDate, maxDate, defaultDate) {
  const minYear = Number(minDate.slice(0, 4));
  const maxYear = Number(maxDate.slice(0, 4));
  yearSel.innerHTML = "";
  for (let y = maxYear; y >= minYear; y--) {
    const opt = document.createElement("option");
    opt.value = String(y);
    opt.textContent = `${y}년`;
    yearSel.appendChild(opt);
  }
  monthSel.innerHTML = "";
  for (let m = 1; m <= 12; m++) {
    const opt = document.createElement("option");
    opt.value = String(m);
    opt.textContent = `${m}월`;
    monthSel.appendChild(opt);
  }
  const [dy, dm] = defaultDate.split("-");
  yearSel.value = dy;
  monthSel.value = String(Number(dm));
}

/* ---------- 팩터 설정: 배분·백테스트의 "자산 추가"와 같은 추가/제거 패턴 ---------- */
let addedFactors = [];
let expandedFactorGroup = null;

function factorRowHtml(key) {
  const meta = FACTOR_META[key] || { min: 0, max: 100, suffix: "" };
  const label = FACTOR_LABELS[key] || key;
  return `
    <div class="factor-active-row" data-factor-row="${key}">
      <div class="factor-active-row-head">
        <span class="factor-active-row-name">${label}</span>
        <button type="button" class="weight-row-remove" data-remove-factor="${key}" aria-label="팩터 제거">×</button>
      </div>
      <div class="factor-active-row-controls">
        <label class="factor-mode-toggle-label">
          <input type="checkbox" data-mode-toggle="${key}" />
          <span>백분위(%)로 설정</span>
        </label>
        <div class="factor-range">
          <input type="text" inputmode="numeric" data-range-min="${key}" value="${meta.min}" />
          <span>~</span>
          <input type="text" inputmode="numeric" data-range-max="${key}" value="${meta.max}" />
          <span data-suffix="${key}">${meta.suffix}</span>
        </div>
      </div>
    </div>
  `;
}

function setFactorMode(key, isPercentile) {
  const minInput = document.querySelector(`[data-range-min="${key}"]`);
  const maxInput = document.querySelector(`[data-range-max="${key}"]`);
  const suffixEl = document.querySelector(`[data-suffix="${key}"]`);
  if (isPercentile) {
    minInput.value = "0";
    maxInput.value = "100";
    if (suffixEl) suffixEl.textContent = "%";
  } else {
    const meta = FACTOR_META[key] || { min: 0, max: 100, suffix: "" };
    minInput.value = String(meta.min);
    maxInput.value = String(meta.max);
    if (suffixEl) suffixEl.textContent = meta.suffix;
  }
}

function addFactorRow(key) {
  if (addedFactors.includes(key) || !FACTOR_META[key]) return;
  addedFactors.push(key);
  const list = document.getElementById("factor-active-list");
  const wrap = document.createElement("div");
  wrap.innerHTML = factorRowHtml(key).trim();
  const row = wrap.firstElementChild;
  list.appendChild(row);

  row.querySelector(`[data-remove-factor="${key}"]`).addEventListener("click", () => removeFactorRow(key));
  row.querySelector(`[data-mode-toggle="${key}"]`).addEventListener("change", (e) => setFactorMode(key, e.target.checked));
}

function removeFactorRow(key) {
  addedFactors = addedFactors.filter((k) => k !== key);
  const row = document.querySelector(`[data-factor-row="${key}"]`);
  if (row) row.remove();
  renderFactorAddOptions();
}

function renderFactorAddOptions() {
  const dropdown = document.getElementById("factor-add-dropdown");
  if (!dropdown) return;
  const remaining = FACTOR_ORDER.filter((k) => !addedFactors.includes(k));
  if (remaining.length === 0) {
    dropdown.innerHTML = `<div class="select-box-empty">추가할 수 있는 팩터가 없습니다</div>`;
    return;
  }
  dropdown.innerHTML = FACTOR_GROUP_ORDER.map((group) => {
    const keys = remaining.filter((k) => FACTOR_GROUP[k] === group);
    if (keys.length === 0) return "";
    const isOpen = expandedFactorGroup === group;
    const items = keys
      .map((k) => `
        <button type="button" class="select-box-option" data-factor-add="${k}" role="option">
          <div class="select-box-option-title">${FACTOR_LABELS[k]}</div>
        </button>
      `)
      .join("");
    return `
      <div class="asset-group-block${isOpen ? " open" : ""}">
        <button type="button" class="asset-group-header" data-group="${group}" aria-expanded="${isOpen}">
          <span>${FACTOR_GROUP_LABEL[group]}</span>
          <span class="asset-group-caret" aria-hidden="true">${isOpen ? "▾" : "▸"}</span>
        </button>
        <div class="asset-group-body">${items}</div>
      </div>
    `;
  }).join("");
}

function initFactorAddSelect() {
  const toggle = document.getElementById("factor-add-toggle");
  const dropdown = document.getElementById("factor-add-dropdown");
  if (!toggle || !dropdown) return;

  renderFactorAddOptions();

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
      expandedFactorGroup = expandedFactorGroup === group ? null : group;
      renderFactorAddOptions();
      return;
    }
    const optionBtn = e.target.closest("[data-factor-add]");
    if (optionBtn) {
      addFactorRow(optionBtn.dataset.factorAdd);
      renderFactorAddOptions();
      closeSelectBoxDropdown("factor-add-select");
    }
  });

  document.addEventListener("click", () => closeSelectBoxDropdown("factor-add-select"));
}

/* 기본은 팩터 실제 값(예: PER 배수) 범위, 행마다 "백분위(%)로 설정"을 켜면 후보군 내
   상대 순위(0~100%) 기준으로 바뀐다 - FACTOR_META의 unit에 맞춰 엔진에 넘긴다 */
function selectedFactorConfigs() {
  return addedFactors.map((key) => {
    const minInput = document.querySelector(`[data-range-min="${key}"]`);
    const maxInput = document.querySelector(`[data-range-max="${key}"]`);
    const modeToggle = document.querySelector(`[data-mode-toggle="${key}"]`);
    const isPercentile = !!(modeToggle && modeToggle.checked);
    const meta = FACTOR_META[key] || { min: -Infinity, max: Infinity };
    const fallbackMin = isPercentile ? 0 : meta.min;
    const fallbackMax = isPercentile ? 100 : meta.max;
    const min = toNumberOrDefault(minInput.value, fallbackMin);
    const max = toNumberOrDefault(maxInput.value, fallbackMax);
    return { key, mode: isPercentile ? "percentile" : "value", min: Math.min(min, max), max: Math.max(min, max) };
  });
}

function formatStratStat(x, digits = 1) {
  if (x === null || x === undefined || !Number.isFinite(x)) return "-";
  return formatSignedPct(x, digits);
}

/* 백테스트 실행 · 종목 추출 둘 다 같은 조건(팩터/필터/트레이딩 설정)을 쓰므로 공통으로 모은다.
   유효성 검사에 실패하면 null을 반환하고 strat-run-error에 이유를 표시한다. */
function gatherStrategyOptions() {
  const errorEl = document.getElementById("strat-run-error");
  errorEl.hidden = true;

  const factorConfigs = selectedFactorConfigs();
  const factorErrorEl = document.getElementById("strat-factor-error");
  if (factorConfigs.length === 0) {
    factorErrorEl.hidden = false;
    return null;
  }
  factorErrorEl.hidden = true;

  const startDate = `${document.getElementById("strat-start-year").value}-${String(document.getElementById("strat-start-month").value).padStart(2, "0")}-01`;
  const endDate = `${document.getElementById("strat-end-year").value}-${String(document.getElementById("strat-end-month").value).padStart(2, "0")}-01`;
  if (startDate >= endDate) {
    errorEl.textContent = "시작 시점은 종료 시점보다 앞서야 합니다.";
    errorEl.hidden = false;
    return null;
  }

  const topN = Math.round(toNumber(document.getElementById("strat-topn").value));
  if (!Number.isFinite(topN) || topN < 1) {
    errorEl.textContent = "종목 수를 1개 이상 입력해주세요.";
    errorEl.hidden = false;
    return null;
  }

  const minMcapM = toNumber(document.getElementById("strat-min-mcap").value);
  const minMarketCap = Number.isFinite(minMcapM) && minMcapM > 0 ? minMcapM * 1e6 : 0;
  const smallCapPct = toNumber(document.getElementById("strat-smallcap-pct").value);

  return {
    factorConfigs,
    topN,
    rebalanceMonths: Number(document.getElementById("strat-rebalance").value),
    startDate,
    endDate,
    initialAmount: toNumberOrDefault(document.getElementById("strat-amount").value, 10000),
    txFeePct: toNumberOrDefault(document.getElementById("strat-fee").value, 0),
    minMarketCap,
    excludeLossLastQuarter: document.getElementById("strat-exclude-loss-quarter").checked,
    excludeLossTTM: document.getElementById("strat-exclude-loss-annual").checked,
    excludeDistressZone: document.getElementById("strat-exclude-distress").checked,
    excludeFinancials: document.getElementById("strat-exclude-financial").checked,
    excludeHoldingCompanies: document.getElementById("strat-exclude-holding").checked,
    excludePTP: document.getElementById("strat-exclude-ptp").checked,
    excludeChinese: document.getElementById("strat-exclude-china").checked,
    smallCapBottomPct: Number.isFinite(smallCapPct) ? Math.max(0, Math.min(100, smallCapPct)) : 0,
  };
}

/* 배분·백테스트처럼 결과를 새 창(factor-result.html)에서 보여준다. 팩터 조건이 많아서
   전부 쿼리스트링 하나에 압축해 담고, 새 창에서 다시 파싱해 동일한 조건으로 재계산한다. */
function buildFactorResultUrl(options) {
  const params = new URLSearchParams();
  params.set("f", options.factorConfigs.map((c) => `${c.key}:${c.mode}:${c.min}:${c.max}`).join("|"));
  params.set("topN", String(options.topN));
  params.set("rebalance", String(options.rebalanceMonths));
  params.set("start", options.startDate);
  params.set("end", options.endDate);
  params.set("amount", String(options.initialAmount));
  params.set("fee", String(options.txFeePct));
  params.set("minMcap", String(options.minMarketCap));
  params.set("smallCapPct", String(options.smallCapBottomPct));
  const excl = [];
  if (options.excludeLossLastQuarter) excl.push("lossQ");
  if (options.excludeLossTTM) excl.push("lossA");
  if (options.excludeDistressZone) excl.push("distress");
  if (options.excludeFinancials) excl.push("financial");
  if (options.excludeHoldingCompanies) excl.push("holding");
  if (options.excludePTP) excl.push("ptp");
  if (options.excludeChinese) excl.push("china");
  if (excl.length > 0) params.set("excl", excl.join(","));
  return "factor-result.html?" + params.toString();
}

function runStockExtraction() {
  const options = gatherStrategyOptions();
  if (!options) return;

  const { min: minDate, max: asOfDate } = priceDateRange();
  const universe = Object.keys(FACTOR_DATA.stocks).filter((t) => {
    const stock = FACTOR_DATA.stocks[t];
    if (options.excludeFinancials && isFinancialStock(stock)) return false;
    if (options.excludeHoldingCompanies && isHoldingCompany(stock)) return false;
    if (options.excludePTP && isLikelyPTP(stock)) return false;
    if (options.excludeChinese && isChineseCompany(stock)) return false;
    return true;
  });

  let snapshots = universe
    .map((ticker) => ({ ticker, factors: stockFactorSnapshot(ticker, FACTOR_DATA.stocks[ticker], asOfDate) }))
    .filter((s) => {
      if (options.minMarketCap > 0 && (!s.factors.marketCap || s.factors.marketCap < options.minMarketCap)) return false;
      if (options.excludeLossTTM && s.factors.netIncomeTTM !== null && s.factors.netIncomeTTM <= 0) return false;
      if (options.excludeLossLastQuarter) {
        const lastQ = lastQuarterNetIncomeAsOf(FACTOR_DATA.stocks[s.ticker].quarters, asOfDate);
        if (lastQ !== null && lastQ <= 0) return false;
      }
      if (options.excludeDistressZone && isDistressZone(s.factors)) return false;
      return true;
    });

  if (options.smallCapBottomPct > 0) {
    const capSorted = snapshots.filter((s) => Number.isFinite(s.factors.marketCap)).sort((a, b) => a.factors.marketCap - b.factors.marketCap);
    const cutIndex = Math.floor((capSorted.length * options.smallCapBottomPct) / 100);
    const excluded = new Set(capSorted.slice(0, cutIndex).map((s) => s.ticker));
    snapshots = snapshots.filter((s) => !excluded.has(s.ticker));
  }

  const ranked = rankByFactors(snapshots, options.factorConfigs).slice(0, options.topN);

  const summaryEl = document.getElementById("strat-extract-summary");
  summaryEl.textContent = `기준일: ${asOfDate} · 조건에 맞는 종목 ${ranked.length}개 (상위 ${options.topN}개 제한)`;

  const body = document.getElementById("strat-extract-body");
  body.innerHTML = ranked
    .map((r) => {
      const stock = FACTOR_DATA.stocks[r.ticker];
      const name = stock.name || r.ticker;
      const price = priceAsOf(stock.prices, asOfDate);
      return `
        <tr>
          <td class="asset-name-cell">${name} <span class="ticker-tag">${r.ticker}</span></td>
          <td>${sicToSector(stock.sic)}</td>
          <td>${price !== null ? "$" + price.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "-"}</td>
          <td>${r.factors.marketCap ? formatMarketCapShort(r.factors.marketCap) : "-"}</td>
          <td>${r.composite.toFixed(1)}</td>
        </tr>
      `;
    })
    .join("");

  const card = document.getElementById("strat-extract-card");
  card.hidden = false;
  card.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function formatMarketCapShort(cap) {
  if (cap >= 1e12) return `$${(cap / 1e12).toFixed(2)}조`;
  if (cap >= 1e9) return `$${(cap / 1e9).toFixed(1)}B`;
  return `$${(cap / 1e6).toFixed(0)}M`;
}

function initStrategyLab() {
  const btn = document.getElementById("strat-run-btn");
  if (!btn) return;
  if (!factorDataAvailable()) {
    document.getElementById("strat-asof").textContent = "팩터 데이터를 아직 수집 중입니다. 잠시 후 다시 시도해주세요.";
    btn.disabled = true;
    return;
  }

  const count = Object.keys(FACTOR_DATA.stocks).length;
  document.getElementById("strat-asof").textContent = `기준일: ${FACTOR_DATA.updatedAt} · 대상 종목 ${count}개 (S&P500 기준, SEC EDGAR 공시데이터)`;

  const { min, max } = priceDateRange();
  const safeMin = min && min > "2011-01-01" ? min : "2011-01-01";
  const startYearSel = document.getElementById("strat-start-year");
  const startMonthSel = document.getElementById("strat-start-month");
  const endYearSel = document.getElementById("strat-end-year");
  const endMonthSel = document.getElementById("strat-end-month");
  fillYearMonthSelect(startYearSel, startMonthSel, safeMin, max, safeMin);
  fillYearMonthSelect(endYearSel, endMonthSel, safeMin, max, max);

  ["per", "pbr", "roe", "momentum6m"].forEach(addFactorRow);
  initFactorAddSelect();

  const selectAll = document.getElementById("strat-select-all-filters");
  const genFilters = [...document.querySelectorAll(".strat-gen-filter")];
  selectAll.addEventListener("change", () => {
    genFilters.forEach((el) => { el.checked = selectAll.checked; });
  });
  genFilters.forEach((el) => el.addEventListener("change", () => {
    selectAll.checked = genFilters.every((f) => f.checked);
  }));

  btn.addEventListener("click", () => {
    const options = gatherStrategyOptions();
    if (!options) return;
    window.open(buildFactorResultUrl(options), "_blank");
  });

  const extractBtn = document.getElementById("strat-extract-btn");
  if (extractBtn) extractBtn.addEventListener("click", runStockExtraction);
}

document.addEventListener("DOMContentLoaded", initStrategyLab);
