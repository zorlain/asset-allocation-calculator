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

function populateSectorChecks() {
  const wrap = document.getElementById("strat-sector-checks");
  if (!wrap) return;
  const sectors = new Set();
  Object.values(FACTOR_DATA.stocks).forEach((s) => sectors.add(sicToSector(s.sic)));
  const sorted = [...sectors].sort((a, b) => a.localeCompare(b, "ko"));
  if (sorted.length === 0) {
    wrap.innerHTML = `<p class="card-desc-short">업종 분류 데이터가 아직 없습니다 (전체 종목 대상으로 진행됩니다).</p>`;
    return;
  }
  wrap.innerHTML = sorted
    .map((sector) => `<label class="checkbox-label"><input type="checkbox" data-owner-org="${sector}" checked /><span>${sector}</span></label>`)
    .join("");
}

/* 각 입력칸 값은 팩터마다 실제 단위(PER는 배, ROE는 %, 이격도는 이동평균=100 기준 %)로
   그대로 받는다 - FACTOR_META의 unit에 맞춰 raw 팩터값과 비교 가능한 형태로 엔진에 넘긴다 */
function selectedFactorConfigs() {
  return [...document.querySelectorAll('[data-factor]')]
    .filter((el) => el.checked)
    .map((el) => {
      const key = el.dataset.factor;
      const minInput = document.querySelector(`[data-range-min="${key}"]`);
      const maxInput = document.querySelector(`[data-range-max="${key}"]`);
      const meta = FACTOR_META[key] || { min: -Infinity, max: Infinity };
      const min = toNumberOrDefault(minInput.value, meta.min);
      const max = toNumberOrDefault(maxInput.value, meta.max);
      return { key, min: Math.min(min, max), max: Math.max(min, max) };
    });
}

function updateFactorGroupCounts() {
  document.querySelectorAll(".factor-group-block").forEach((block) => {
    const checked = block.querySelectorAll('[data-factor]:checked').length;
    const countEl = block.querySelector(".factor-group-count");
    if (countEl) countEl.textContent = checked > 0 ? `(${checked}개 선택됨)` : "";
  });
}

/* 체크 안 된 팩터의 범위 입력칸은 비활성화해서 "이 값은 지금 안 쓰인다"를 시각적으로 알려준다 */
function syncFactorRangeDisabled() {
  document.querySelectorAll('[data-factor]').forEach((el) => {
    const key = el.dataset.factor;
    const minInput = document.querySelector(`[data-range-min="${key}"]`);
    const maxInput = document.querySelector(`[data-range-max="${key}"]`);
    if (minInput) minInput.disabled = !el.checked;
    if (maxInput) maxInput.disabled = !el.checked;
  });
}

function excludedOwnerOrgs() {
  const unchecked = [...document.querySelectorAll('[data-owner-org]')].filter((el) => !el.checked).map((el) => el.dataset.ownerOrg);
  return unchecked.length > 0 ? new Set(unchecked) : null;
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
    excludeOwnerOrgs: excludedOwnerOrgs(),
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
  params.set("f", options.factorConfigs.map((c) => `${c.key}:${c.min}:${c.max}`).join("|"));
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
  if (options.excludeOwnerOrgs) params.set("sectorExcl", [...options.excludeOwnerOrgs].join("|"));
  return "factor-result.html?" + params.toString();
}

function runStockExtraction() {
  const options = gatherStrategyOptions();
  if (!options) return;

  const { min: minDate, max: asOfDate } = priceDateRange();
  const universe = Object.keys(FACTOR_DATA.stocks).filter((t) => {
    const stock = FACTOR_DATA.stocks[t];
    if (options.excludeOwnerOrgs && options.excludeOwnerOrgs.has(sicToSector(stock.sic))) return false;
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

  populateSectorChecks();

  const { min, max } = priceDateRange();
  const safeMin = min && min > "2011-01-01" ? min : "2011-01-01";
  const startYearSel = document.getElementById("strat-start-year");
  const startMonthSel = document.getElementById("strat-start-month");
  const endYearSel = document.getElementById("strat-end-year");
  const endMonthSel = document.getElementById("strat-end-month");
  fillYearMonthSelect(startYearSel, startMonthSel, safeMin, max, safeMin);
  fillYearMonthSelect(endYearSel, endMonthSel, safeMin, max, max);

  syncFactorRangeDisabled();
  updateFactorGroupCounts();
  document.querySelectorAll('[data-factor]').forEach((el) => el.addEventListener("change", () => {
    syncFactorRangeDisabled();
    updateFactorGroupCounts();
  }));

  document.querySelectorAll('[data-group-toggle]').forEach((header) => {
    header.addEventListener("click", () => {
      const block = header.closest(".factor-group-block");
      const isOpen = block.classList.toggle("open");
      header.setAttribute("aria-expanded", String(isOpen));
      header.querySelector(".factor-group-caret").textContent = isOpen ? "▾" : "▸";
    });
  });

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
