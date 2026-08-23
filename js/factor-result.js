/* ---------- factor-result.html 전용: 쿼리스트링으로 넘어온 팩터 전략 조건을 다시 계산해서 보여준다 ---------- */

function parseFactorParams() {
  const params = new URLSearchParams(window.location.search);
  const factorConfigs = (params.get("f") || "")
    .split("|")
    .filter(Boolean)
    .map((chunk) => {
      const [key, min, max] = chunk.split(":");
      return { key, min: Number(min), max: Number(max) };
    });

  const exclList = (params.get("excl") || "").split(",").filter(Boolean);
  const sectorExclRaw = params.get("sectorExcl");
  const excludeOwnerOrgs = sectorExclRaw ? new Set(sectorExclRaw.split("|")) : null;

  return {
    factorConfigs,
    topN: Number(params.get("topN")) || 20,
    rebalanceMonths: Number(params.get("rebalance")) || 3,
    startDate: params.get("start"),
    endDate: params.get("end"),
    initialAmount: Number(params.get("amount")) || 10000,
    txFeePct: Number(params.get("fee")) || 0,
    minMarketCap: Number(params.get("minMcap")) || 0,
    smallCapBottomPct: Number(params.get("smallCapPct")) || 0,
    excludeLossLastQuarter: exclList.includes("lossQ"),
    excludeLossTTM: exclList.includes("lossA"),
    excludeDistressZone: exclList.includes("distress"),
    excludeFinancials: exclList.includes("financial"),
    excludeHoldingCompanies: exclList.includes("holding"),
    excludePTP: exclList.includes("ptp"),
    excludeChinese: exclList.includes("china"),
    excludeOwnerOrgs,
  };
}

const FACTOR_LABELS = {
  marketCap: "시가총액", per: "PER", pbr: "PBR", psr: "PSR", evSales: "EV/Sales", evEbit: "EV/EBIT",
  por: "POR", pgpr: "PGPR", evGp: "EV/GP", ncavToPrice: "NCAV/시가총액", peg: "PEG",
  roe: "ROE", roa: "ROA", gpa: "GP/A", debtToEquity: "부채비율", currentRatio: "유동비율",
  rndToSales: "R&D/매출", altmanZ: "Altman Z-score", roic: "ROIC", rocE: "ROCE", gpe: "GP/E",
  gpm: "매출총이익률", opm: "영업이익률", npm: "순이익률", assetTurnover: "총자산회전율",
  opIncomeToDebt: "영업이익/차입금", debtToAssets: "차입금비율", retentionRatio: "유보율",
  revenueGrowthYoY: "매출액성장률(YoY)", netIncomeGrowthYoY: "순이익성장률(YoY)",
  grossProfitGrowthYoY: "매출총이익성장률(YoY)", opIncomeGrowthYoY: "영업이익성장률(YoY)",
  assetGrowthYoY: "자산성장률(YoY)", equityGrowthYoY: "자본성장률(YoY)", cashGrowthYoY: "현금성자산성장률(YoY)",
  debtGrowthYoY: "차입금성장률(YoY)", rndGrowthYoY: "R&D성장률(YoY)",
  momentum1m: "1개월 모멘텀", momentum3m: "3개월 모멘텀", momentum6m: "6개월 모멘텀", momentum12m: "12개월 모멘텀",
  maDisparity3m: "3개월 이평 이격도", maDisparity6m: "6개월 이평 이격도", maDisparity12m: "12개월 이평 이격도",
  goldenCross: "골든크로스", rsi6: "RSI(6개월)", rsi12: "RSI(12개월)", beta: "베타",
};
const FILTER_LABELS = {
  lossQ: "적자기업 제외(분기)", lossA: "적자기업 제외(년간)", distress: "관리종목 제외(근사)",
  financial: "금융주 제외", holding: "지주사 제외", ptp: "PTP 제외", china: "중국기업 제외",
};

function formatFactorRange(cfg) {
  const meta = FACTOR_META[cfg.key] || {};
  const label = FACTOR_LABELS[cfg.key] || cfg.key;
  return `${label} ${cfg.min}~${cfg.max}${meta.suffix || ""}`;
}

function fmtPct(x, digits = 1) {
  if (x === null || x === undefined || !Number.isFinite(x)) return "-";
  const sign = x > 0 ? "+" : "";
  return `${sign}${(x * 100).toFixed(digits)}%`;
}

function fmtUsd(x) {
  if (x === null || x === undefined || !Number.isFinite(x)) return "-";
  return `$${Math.round(x).toLocaleString("en-US")}`;
}

/* SPY 매수-보유 벤치마크: 전략과 같은 기간, 같은 초기금액으로 단순 보유했을 때 */
function computeSpyBenchmark(startDate, endDate, initialAmount) {
  if (typeof ASSET_DATA === "undefined" || !ASSET_DATA.assets.SPY) return null;
  const series = ASSET_DATA.assets.SPY.series;
  const byMonth = new Map(series.map((p) => [p.d, p.c]));
  const startMonth = startDate.slice(0, 7);
  const endMonth = endDate.slice(0, 7);
  const p0 = byMonth.get(startMonth);
  const p1 = byMonth.get(endMonth);
  if (!p0 || !p1) return null;
  const finalValue = initialAmount * (p1 / p0);
  const years = (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24 * 365.25);
  const cagr = years > 0 ? Math.pow(finalValue / initialAmount, 1 / years) - 1 : 0;
  return { finalValue, totalReturn: finalValue / initialAmount - 1, cagr };
}

let growthChart = null;
let ddChart = null;

function renderGrowthChart(bt, spyBench) {
  const canvas = document.getElementById("factor-growth-canvas");
  if (!canvas || typeof Chart === "undefined") return;
  const style = getComputedStyle(document.documentElement);
  const accent = style.getPropertyValue("--chart-fill").trim() || "#494fdf";
  const gridColor = style.getPropertyValue("--border").trim() || "rgba(0,0,0,0.1)";
  const textMuted = style.getPropertyValue("--text-muted").trim() || "#888888";

  const labels = ["시작", ...bt.dates];
  const datasets = [{
    label: "전략",
    data: bt.valuesFlat,
    borderColor: accent,
    backgroundColor: accent,
    borderWidth: 2.5,
    pointRadius: 0,
    tension: 0.15,
    fill: false,
  }];

  if (spyBench) {
    const n = bt.valuesFlat.length;
    const spySeries = Array.from({ length: n }, (_, i) => {
      const t = i / (n - 1);
      return bt.initialAmount * Math.pow(spyBench.finalValue / bt.initialAmount, t);
    });
    datasets.push({
      label: "S&P500 매수보유",
      data: spySeries,
      borderColor: "#9aa0a6",
      backgroundColor: "#9aa0a6",
      borderWidth: 1.5,
      borderDash: [4, 3],
      pointRadius: 0,
      tension: 0.1,
      fill: false,
    });
  }

  if (growthChart) growthChart.destroy();
  growthChart = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: true, labels: { color: textMuted, boxWidth: 12, font: { size: 11 } } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmtUsd(ctx.parsed.y)}` } },
      },
      scales: {
        x: { ticks: { color: textMuted, maxTicksLimit: 8, autoSkip: true }, grid: { display: false } },
        y: { ticks: { color: textMuted, callback: (v) => fmtUsd(v) }, grid: { color: gridColor } },
      },
    },
  });
}

function renderDdChart(bt) {
  const canvas = document.getElementById("factor-dd-canvas");
  if (!canvas || typeof Chart === "undefined") return;
  const style = getComputedStyle(document.documentElement);
  const negative = style.getPropertyValue("--negative").trim() || "#ff5c5c";
  const gridColor = style.getPropertyValue("--border").trim() || "rgba(0,0,0,0.1)";
  const textMuted = style.getPropertyValue("--text-muted").trim() || "#888888";
  const series = bt.drawdownSeries || [];

  if (ddChart) ddChart.destroy();
  ddChart = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels: series.map((s) => s.date),
      datasets: [{
        data: series.map((s) => s.dd * 100),
        borderColor: negative,
        backgroundColor: `color-mix(in srgb, ${negative} 18%, transparent)`,
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.1,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => `${ctx.parsed.y.toFixed(1)}%` } },
      },
      scales: {
        x: { ticks: { color: textMuted, maxTicksLimit: 8, autoSkip: true }, grid: { display: false } },
        y: { ticks: { color: textMuted, callback: (v) => `${v}%` }, grid: { color: gridColor }, max: 0 },
      },
    },
  });
}

function runFromParams() {
  const resultEl = document.getElementById("factor-result");
  const options = parseFactorParams();

  if (!options.factorConfigs || options.factorConfigs.length === 0 || !options.startDate || !options.endDate) {
    resultEl.innerHTML = `<p class="result-placeholder">불러올 결과가 없습니다. 전략 탭에서 조건을 설정하고 다시 시도해주세요.</p>`;
    return;
  }
  if (typeof FACTOR_DATA === "undefined" || !FACTOR_DATA.stocks || Object.keys(FACTOR_DATA.stocks).length === 0) {
    resultEl.innerHTML = `<p class="result-placeholder">팩터 데이터를 불러오지 못했습니다.</p>`;
    return;
  }

  const bt = runFactorBacktest({ ...options, universe: Object.keys(FACTOR_DATA.stocks) });
  const metrics = factorBacktestMetrics(bt);
  const spyBench = computeSpyBenchmark(options.startDate, options.endDate, options.initialAmount);

  const filterSummary = [
    ...(options.excludeLossLastQuarter ? [FILTER_LABELS.lossQ] : []),
    ...(options.excludeLossTTM ? [FILTER_LABELS.lossA] : []),
    ...(options.excludeDistressZone ? [FILTER_LABELS.distress] : []),
    ...(options.excludeFinancials ? [FILTER_LABELS.financial] : []),
    ...(options.excludeHoldingCompanies ? [FILTER_LABELS.holding] : []),
    ...(options.excludePTP ? [FILTER_LABELS.ptp] : []),
    ...(options.excludeChinese ? [FILTER_LABELS.china] : []),
    ...(options.minMarketCap > 0 ? [`최소 시가총액 $${(options.minMarketCap / 1e6).toLocaleString()}백만`] : []),
    ...(options.smallCapBottomPct > 0 ? [`소형주 하위 ${options.smallCapBottomPct}% 제외`] : []),
    ...(options.excludeOwnerOrgs ? [`업종 제외 ${options.excludeOwnerOrgs.size}개`] : []),
  ].join(" · ") || "없음";

  const periodRows = bt.dates.map((d, i) => {
    const ret = bt.monthlyReturns[i];
    const picks = (bt.selections[i] || { picks: [] }).picks;
    return `
      <tr>
        <td class="asset-name-cell">${d}</td>
        <td class="${ret >= 0 ? "positive" : "negative"}">${fmtPct(ret)}</td>
        <td>${fmtUsd(bt.valuesFlat[i + 1])}</td>
        <td>${picks.length}개</td>
      </tr>
    `;
  }).join("");

  const lastSelection = bt.selections[bt.selections.length - 1];
  const picksRows = (lastSelection ? lastSelection.picks : []).map((p) => {
    const stock = FACTOR_DATA.stocks[p.ticker];
    const name = (stock && stock.name) || p.ticker;
    const sector = stock ? sicToSector(stock.sic) : "-";
    return `<tr><td class="asset-name-cell">${name} <span class="ticker-tag">${p.ticker}</span></td><td>${sector}</td><td>${p.composite.toFixed(1)}</td></tr>`;
  }).join("");

  resultEl.innerHTML = `
    <div class="result-hero">
      <div class="result-hero-label">최종 평가금액 (${options.startDate} ~ ${options.endDate})</div>
      <div class="result-hero-value ${bt.finalValue >= bt.initialAmount ? "positive" : "negative"}">${fmtUsd(bt.finalValue)}</div>
      <div class="result-hero-sub">초기 투자금 ${fmtUsd(bt.initialAmount)} · 거래 수수료 반영 총 비용 ${fmtUsd(bt.totalTxCost)}</div>
    </div>

    <div class="result-grid" style="margin-top:20px;">
      <div class="result-stat"><div class="result-stat-label">총수익률</div><div class="result-stat-value ${metrics.totalReturn >= 0 ? "positive" : "negative"}">${fmtPct(metrics.totalReturn)}</div></div>
      <div class="result-stat"><div class="result-stat-label">연평균(CAGR)</div><div class="result-stat-value ${metrics.cagr >= 0 ? "positive" : "negative"}">${fmtPct(metrics.cagr)}</div></div>
      <div class="result-stat"><div class="result-stat-label">최대낙폭(MDD)</div><div class="result-stat-value negative">${fmtPct(metrics.maxDD)}</div></div>
      <div class="result-stat"><div class="result-stat-label">변동성</div><div class="result-stat-value">${fmtPct(metrics.vol)}</div></div>
      <div class="result-stat"><div class="result-stat-label">샤프비율</div><div class="result-stat-value">${metrics.sharpe === null ? "-" : metrics.sharpe.toFixed(2)}</div></div>
      <div class="result-stat"><div class="result-stat-label">리밸런싱 승률</div><div class="result-stat-value">${fmtPct(metrics.winRate, 0)}</div></div>
      ${spyBench ? `
      <div class="result-stat"><div class="result-stat-label">S&amp;P500 매수보유 CAGR</div><div class="result-stat-value">${fmtPct(spyBench.cagr)}</div></div>
      <div class="result-stat"><div class="result-stat-label">S&amp;P500 대비 초과 CAGR</div><div class="result-stat-value ${metrics.cagr - spyBench.cagr >= 0 ? "positive" : "negative"}">${fmtPct(metrics.cagr - spyBench.cagr)}</div></div>
      ` : ""}
    </div>

    <p class="subsection-label" style="margin-top:28px;">자산가치 성장</p>
    <div class="chart-wrap"><canvas id="factor-growth-canvas"></canvas></div>

    <p class="subsection-label" style="margin-top:28px;">낙폭(드로다운)</p>
    <div class="chart-wrap dd-wrap"><canvas id="factor-dd-canvas"></canvas></div>

    <p class="subsection-label" style="margin-top:28px;">사용한 조건</p>
    <p class="card-desc-short">
      팩터: ${options.factorConfigs.map(formatFactorRange).join(" · ")}<br />
      일반 필터: ${filterSummary}<br />
      종목 수 상위 ${options.topN}개 · 리밸런싱 주기 ${options.rebalanceMonths}개월 · 거래 수수료 ${options.txFeePct}%
    </p>

    <p class="subsection-label" style="margin-top:28px;">리밸런싱별 성과</p>
    <div class="asset-table-wrap">
      <table class="asset-table">
        <thead><tr><th>시점</th><th>기간 수익률</th><th>평가금액</th><th>보유 종목 수</th></tr></thead>
        <tbody>${periodRows}</tbody>
      </table>
    </div>

    <p class="subsection-label" style="margin-top:28px;">마지막 리밸런싱(${lastSelection ? lastSelection.date : "-"}) 선정 종목</p>
    <div class="asset-table-wrap">
      <table class="asset-table">
        <thead><tr><th>종목</th><th>업종</th><th>종합 점수</th></tr></thead>
        <tbody>${picksRows}</tbody>
      </table>
    </div>
  `;

  renderGrowthChart(bt, spyBench);
  renderDdChart(bt);
}

document.addEventListener("DOMContentLoaded", runFromParams);
