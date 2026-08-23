/* ---------- 전략 탭: 개별종목 스크리너 ---------- */

function formatStockPrice(currency, price) {
  if (price === null || price === undefined || !Number.isFinite(price)) return "-";
  if (currency === "KRW") return `${Math.round(price).toLocaleString("ko-KR")}원`;
  return `$${price.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function formatMarketCap(currency, cap) {
  if (cap === null || cap === undefined || !Number.isFinite(cap)) return "-";
  if (currency === "KRW") {
    const eok = cap / 1e8;
    if (eok >= 10000) return `${(eok / 10000).toFixed(1)}조원`;
    return `${Math.round(eok).toLocaleString("ko-KR")}억원`;
  }
  if (cap >= 1e12) return `$${(cap / 1e12).toFixed(2)}조`;
  if (cap >= 1e9) return `$${(cap / 1e9).toFixed(1)}B`;
  return `$${(cap / 1e6).toFixed(0)}M`;
}

function stockMomentum(s) {
  if (!s.high52w || !s.price) return null;
  return s.price / s.high52w - 1;
}

/* 시가총액 정렬용: 통화가 섞여 있어 USD/KRW 최신 환율로 원화 환산값을 따로 계산 (표시는 원래 통화 그대로) */
function usdKrwRate() {
  const series = ASSET_DATA && ASSET_DATA.fx && ASSET_DATA.fx.USDKRW;
  if (!series || series.length === 0) return 1400;
  return series[series.length - 1].c;
}

function marketCapKrw(s, fxRate) {
  if (s.marketCap === null || s.marketCap === undefined) return null;
  return s.currency === "USD" ? s.marketCap * fxRate : s.marketCap;
}

function populateSectorOptions() {
  const sel = document.getElementById("scr-sector");
  if (!sel || typeof STOCK_DATA === "undefined") return;
  const sectors = new Set();
  Object.values(STOCK_DATA.stocks).forEach((s) => {
    if (s.sector) sectors.add(s.sector);
  });
  const sorted = [...sectors].sort((a, b) => a.localeCompare(b, "ko"));
  sorted.forEach((sector) => {
    const opt = document.createElement("option");
    opt.value = sector;
    opt.textContent = sector;
    sel.appendChild(opt);
  });
}

/* toNumber("")는 0을 반환해 "입력 안 함"과 "0 입력"을 구분하지 못하므로, 빈 입력은 NaN(필터 미적용)으로 처리 */
function scrFilterNum(id) {
  const raw = document.getElementById(id).value.trim();
  if (raw === "") return NaN;
  return toNumber(raw);
}

function runScreener() {
  if (typeof STOCK_DATA === "undefined") return;
  const tbody = document.getElementById("scr-result-body");
  const summaryEl = document.getElementById("scr-result-summary");
  if (!tbody) return;

  const market = document.getElementById("scr-market").value;
  const sector = document.getElementById("scr-sector").value;
  const sort = document.getElementById("scr-sort").value;
  const limit = Number(document.getElementById("scr-limit").value) || 50;
  const perMax = scrFilterNum("scr-per-max");
  const pbrMax = scrFilterNum("scr-pbr-max");
  const roeMin = scrFilterNum("scr-roe-min");
  const divMin = scrFilterNum("scr-div-min");
  const momentumMin = scrFilterNum("scr-momentum-min");

  const fxRate = usdKrwRate();
  let rows = Object.entries(STOCK_DATA.stocks).map(([ticker, s]) => ({ ticker, ...s, momentum: stockMomentum(s), marketCapKrw: marketCapKrw(s, fxRate) }));

  if (market !== "all") rows = rows.filter((s) => s.market === market);
  if (sector !== "all") rows = rows.filter((s) => s.sector === sector);
  if (Number.isFinite(perMax)) rows = rows.filter((s) => s.per !== null && s.per !== undefined && s.per > 0 && s.per <= perMax);
  if (Number.isFinite(pbrMax)) rows = rows.filter((s) => s.pbr !== null && s.pbr !== undefined && s.pbr > 0 && s.pbr <= pbrMax);
  if (Number.isFinite(roeMin)) rows = rows.filter((s) => s.roe !== null && s.roe !== undefined && s.roe >= roeMin);
  if (Number.isFinite(divMin)) rows = rows.filter((s) => s.dividendYield !== null && s.dividendYield !== undefined && s.dividendYield >= divMin);
  if (Number.isFinite(momentumMin)) rows = rows.filter((s) => s.momentum !== null && s.momentum * 100 >= momentumMin);

  const sorters = {
    marketCapDesc: (a, b) => (b.marketCapKrw ?? -Infinity) - (a.marketCapKrw ?? -Infinity),
    perAsc: (a, b) => (a.per ?? Infinity) - (b.per ?? Infinity),
    pbrAsc: (a, b) => (a.pbr ?? Infinity) - (b.pbr ?? Infinity),
    roeDesc: (a, b) => (b.roe ?? -Infinity) - (a.roe ?? -Infinity),
    dividendDesc: (a, b) => (b.dividendYield ?? -Infinity) - (a.dividendYield ?? -Infinity),
    high52Desc: (a, b) => (b.momentum ?? -Infinity) - (a.momentum ?? -Infinity),
    volumeDesc: (a, b) => (b.volume ?? -Infinity) - (a.volume ?? -Infinity),
  };
  rows.sort(sorters[sort] || sorters.marketCapDesc);

  const total = rows.length;
  rows = rows.slice(0, limit);

  if (summaryEl) {
    summaryEl.textContent = total === 0
      ? "조건에 맞는 종목이 없습니다. 필터를 완화해보세요."
      : `조건에 맞는 ${total}개 종목 중 ${rows.length}개 표시 (${sort === "marketCapDesc" ? "시가총액" : document.getElementById("scr-sort").selectedOptions[0].textContent} 기준)`;
  }

  tbody.innerHTML = rows.map((s) => {
    const clsChange = s.changePct === null || s.changePct === undefined ? "" : s.changePct >= 0 ? "positive" : "negative";
    const clsMomentum = s.momentum === null ? "" : s.momentum >= 0 ? "positive" : "negative";
    return `
      <tr>
        <td class="asset-name-cell">${s.name} <span class="ticker-tag">${s.ticker}</span></td>
        <td>${s.market === "US" ? "미국" : "한국"}</td>
        <td>${s.sector || "-"}</td>
        <td>${formatStockPrice(s.currency, s.price)}</td>
        <td class="${clsChange}">${s.changePct === null || s.changePct === undefined ? "-" : formatSignedPct(s.changePct / 100, 2)}</td>
        <td>${formatMarketCap(s.currency, s.marketCap)}</td>
        <td>${s.per === null || s.per === undefined ? "-" : s.per.toFixed(1)}</td>
        <td>${s.pbr === null || s.pbr === undefined ? "-" : s.pbr.toFixed(1)}</td>
        <td>${s.roe === null || s.roe === undefined ? "-" : s.roe.toFixed(1) + "%"}</td>
        <td>${s.dividendYield === null || s.dividendYield === undefined ? "-" : s.dividendYield.toFixed(2) + "%"}</td>
        <td class="${clsMomentum}">${s.momentum === null ? "-" : formatSignedPct(s.momentum, 1)}</td>
      </tr>
    `;
  }).join("");
}

function initScreener() {
  const btn = document.getElementById("scr-run-btn");
  if (!btn || typeof STOCK_DATA === "undefined") return;

  const asOfEl = document.getElementById("screener-asof");
  if (asOfEl) {
    asOfEl.textContent = `기준일: ${STOCK_DATA.updatedAt} (미국 S&P500 전체, 한국 코스피 시가총액 상위 200개, 실시간 시세 아님)`;
  }

  populateSectorOptions();
  btn.addEventListener("click", runScreener);
  runScreener();
}

document.addEventListener("DOMContentLoaded", initScreener);
