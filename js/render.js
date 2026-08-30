/* ---------- 백테스트 결과 렌더링 공용 코드 (index.html의 인라인 결과와 result.html의 새 창 결과가 공유) ---------- */

/* ---------- 지표 설명 (어려운 용어에 물음표 툴팁 추가) ---------- */
const METRIC_INFO = {
  mdd: "투자 기간 중 고점 대비 자산이 가장 많이 떨어졌던 비율입니다. 0에 가까울수록 하락 시기의 타격이 작았다는 뜻입니다.",
  sharpe:
    "위험(변동성) 대비 초과수익을 보여주는 지표입니다. 현금성자산 대비 얼마나 더 벌었는지를 변동성으로 나눈 값으로, 높을수록 감수한 위험 대비 수익이 좋았다는 뜻입니다.",
  sortino:
    "샤프비율과 비슷하지만 상승 변동성은 빼고 하락 변동성만으로 위험을 계산합니다. 손실 위험 대비 수익 효율을 더 정확히 보여줍니다.",
  calmar:
    "연평균 수익률(CAGR)을 최대낙폭(MDD)으로 나눈 값입니다. 감내해야 했던 최악의 하락폭 대비 수익이 얼마나 좋았는지를 보여줍니다.",
  cagrDca:
    "적립식(매달 납입) 투자의 연평균 수익률입니다. 납입 시점마다 투자 원금이 각기 다른 기간 동안 불어나므로, 단순히 최종금액을 원금으로 나눈 값이 아니라 내부수익률(IRR) 방식으로 계산한 값입니다.",
  downsideDev: "손실이 난 달만 골라 계산한 변동성입니다. 상승 변동성은 위험으로 보지 않는 소르티노비율 계산에 쓰입니다.",
  omega: "기준 수익률(0%) 위에서 번 몫의 합을 그 아래에서 잃은 몫의 합으로 나눈 값입니다. 표준편차 하나로 뭉뚱그리지 않고 수익률 분포 전체(비대칭성 포함)를 반영합니다. 1보다 클수록 유리합니다.",
  skew: "월간 수익률 분포가 좌우 어느 쪽으로 치우쳤는지를 보여줍니다. 양수면 가끔 크게 상승하는 분포, 음수면 가끔 크게 하락하는 분포(꼬리위험)에 가깝습니다.",
  kurt: "정규분포 대비 수익률 분포의 꼬리가 얼마나 두꺼운지를 보여줍니다. 양수면 극단적으로 좋거나 나쁜 달이 정규분포 가정보다 더 자주 나왔다는 뜻입니다.",
  var95: "과거 월별 수익률을 나열했을 때 하위 5% 지점의 손실률입니다. \"최소 이 정도는 각오해야 하는 손실 수준\"을 뜻합니다.",
  cvar95: "VaR(95%)보다 더 나쁜 구간(하위 5%)의 평균 손실률입니다. VaR을 넘어서는 극단적 손실이 평균적으로 어느 정도였는지 보여줍니다.",
  gainLossRatio: "상승한 달의 평균 상승폭을 하락한 달의 평균 하락폭(절댓값)으로 나눈 값입니다.",
  profitFactor: "상승한 달의 상승폭을 모두 더한 값을, 하락한 달의 하락폭을 모두 더한 값(절댓값)으로 나눈 값입니다. 손익비와 비슷하지만 달의 개수가 아니라 총량을 비교합니다.",
  turnover: "리밸런싱 한 번에서 비중이 실제로 얼마나 바뀌었는지(매수·매도분의 절반)를 나타냅니다. 값이 클수록 사고파는 폭이 크다는 뜻이며, 실전에서는 거래비용·세금 부담과 직결됩니다.",
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

/* ---------- 결과 지표 타일 공용 빌더 (result-grid 안에서 재사용) ---------- */
function statTile(label, valueText, cls = "") {
  return `
    <div class="result-stat">
      <div class="result-stat-label">${label}</div>
      <div class="result-stat-value ${cls}">${valueText}</div>
    </div>
  `;
}

function fmtRatio(x, digits = 2) {
  if (x === null || x === undefined || !Number.isFinite(x)) return x === Infinity ? "∞" : "-";
  return x.toFixed(digits);
}

/* 수익률 값을 배경 농도로 표현(월별 히트맵 등). 이 사이트의 --positive/--negative 색을 그대로
   써서 라이트/다크 테마 전환 시에도 자동으로 맞는 색이 나오게 한다. */
function heatColor(v, cap = 0.08) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "transparent";
  const t = Math.max(-1, Math.min(1, v / cap));
  const pct = Math.round(Math.abs(t) * 60);
  const varName = t >= 0 ? "--positive" : "--negative";
  return `color-mix(in srgb, var(${varName}) ${pct}%, transparent)`;
}

/* ---------- 자산군 색상 (파이/라인 차트용) ---------- */
const TICKER_COLORS = {
  SPY: "#494fdf",
  QQQ: "#7c4fd8",
  SCHD: "#c25b8f",
  SSO: "#6a6fea",
  SDS: "#4a3f8f",
  QLD: "#9974e0",
  QID: "#6f4fa8",
  TQQQ: "#9b5de5",
  SQQQ: "#5e548e",
  IWM: "#7a6ff0",
  KOSPI: "#3a6ea5",
  KOSDAQ: "#6aa84f",
  KOSPI2X: "#2e5c8a",
  KOSPIINV: "#1f4266",
  KOSDAQ2X: "#4e8a3e",
  KOSDAQINV: "#356029",
  EFA: "#2f9e8f",
  VGK: "#3fae7a",
  EEM: "#21b3a4",
  MCHI: "#c0433f",
  EWJ: "#4fb8a8",
  KRBOND3Y: "#e6a06e",
  KRBOND10Y: "#d97e5c",
  KRBOND30Y: "#b8603f",
  SHY: "#f2c04e",
  IEF: "#f2a341",
  TLT: "#f2665e",
  TIP: "#e88a5c",
  AGG: "#d9955a",
  HYG: "#c96a6a",
  LQD: "#b57a8a",
  GLD: "#d4af37",
  SLV: "#b8bcc4",
  DBC: "#8d6a4f",
  USO: "#5a4632",
  VNQ: "#4fa8d8",
  BIL: "#9aa0a6",
  KRCASH: "#6f7680",
  BTC: "#f7931a",
  BITI: "#c9701a",
  ETH: "#627eea",
  ETHS: "#4a5aab",
};

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

let pieChart = null;
let lineChart = null;

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

const BENCHMARK_LINE_COLORS = ["#9aa0a6", "#c9a24a", "#7a8fd8"];

function renderLineChart(bt) {
  const canvas = document.getElementById("line-canvas");
  if (!canvas || typeof Chart === "undefined") return;
  const style = getComputedStyle(document.documentElement);
  const accent = style.getPropertyValue("--chart-fill").trim() || "#e6a01c";
  const gridColor = style.getPropertyValue("--border").trim() || "rgba(0,0,0,0.1)";
  const textMuted = style.getPropertyValue("--text-muted").trim() || "#888888";

  // 벤치마크는 시작일이 전략과 다를 수 있어(예: 벤치마크 자산의 데이터 시작일이 늦음) 날짜 기준으로
  // 맞춰 그린다 - 전략의 날짜를 축으로 삼고, 벤치마크는 같은 날짜의 값만 매칭한다.
  const labels = ["시작", ...bt.dates];
  const datasets = [
    {
      label: "전략",
      data: bt.values,
      borderColor: accent,
      backgroundColor: accent,
      borderWidth: 2.5,
      pointRadius: 0,
      tension: 0.15,
      fill: false,
    },
  ];

  (bt.benchmarks || []).forEach((b, i) => {
    const dateToValue = new Map();
    b.result.dates.forEach((d, idx) => dateToValue.set(d, b.result.values[idx + 1]));
    const startAmount = b.result.initialAmount;
    const series = labels.map((d) => (d === "시작" ? startAmount : dateToValue.has(d) ? dateToValue.get(d) : null));
    datasets.push({
      label: b.label,
      data: series,
      borderColor: BENCHMARK_LINE_COLORS[i % BENCHMARK_LINE_COLORS.length],
      backgroundColor: BENCHMARK_LINE_COLORS[i % BENCHMARK_LINE_COLORS.length],
      borderWidth: 1.5,
      borderDash: [4, 3],
      pointRadius: 0,
      tension: 0.15,
      fill: false,
      spanGaps: true,
    });
  });

  if (lineChart) lineChart.destroy();
  lineChart = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: datasets.length > 1, labels: { color: textMuted, boxWidth: 12, font: { size: 11 } } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatManwon(ctx.parsed.y)}` } },
      },
      scales: {
        x: { ticks: { color: textMuted, maxTicksLimit: 8, autoSkip: true }, grid: { display: false } },
        y: { ticks: { color: textMuted, callback: (v) => formatManwon(v) }, grid: { color: gridColor } },
      },
    },
  });
}

let drawdownChart = null;

function renderDrawdownChart(bt) {
  const canvas = document.getElementById("drawdown-canvas");
  if (!canvas || typeof Chart === "undefined") return;
  const style = getComputedStyle(document.documentElement);
  const negative = style.getPropertyValue("--negative").trim() || "#ff5c5c";
  const gridColor = style.getPropertyValue("--border").trim() || "rgba(0,0,0,0.1)";
  const textMuted = style.getPropertyValue("--text-muted").trim() || "#888888";
  const series = bt.drawdownSeries || [];

  if (drawdownChart) drawdownChart.destroy();
  drawdownChart = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels: series.map((s) => s.date),
      datasets: [
        {
          data: series.map((s) => s.dd * 100),
          borderColor: negative,
          backgroundColor: `color-mix(in srgb, ${negative} 18%, transparent)`,
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.1,
          fill: true,
        },
      ],
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

function buildMonthlyTable(bt) {
  const rows = monthlyReturnsTable(bt.dates, bt.monthlyReturns);
  const monthHeaders = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];
  const headerRow = `<tr><th>연도</th>${monthHeaders.map((m) => `<th>${m}</th>`).join("")}<th>연간</th></tr>`;
  const bodyRows = rows
    .map((row) => {
      const cells = row.months
        .map((r) =>
          r === null
            ? `<td>-</td>`
            : `<td class="${r >= 0 ? "positive" : "negative"}" style="background:${heatColor(r)}">${formatSignedPct(r, 1)}</td>`
        )
        .join("");
      const annualCls = row.annual >= 0 ? "positive" : "negative";
      return `<tr><td class="asset-name-cell">${row.year}</td>${cells}<td class="${annualCls}" style="font-weight:800;background:${heatColor(
        row.annual,
        0.2
      )}">${formatSignedPct(row.annual, 1)}</td></tr>`;
    })
    .join("");

  const { monthAverages, annualAverage } = monthlySeasonalAverages(rows);
  const avgCells = monthAverages
    .map((r) => (r === null ? `<td>-</td>` : `<td class="${r >= 0 ? "positive" : "negative"}">${formatSignedPct(r, 1)}</td>`))
    .join("");
  const annualAvgCls = annualAverage !== null && annualAverage >= 0 ? "positive" : "negative";
  const avgRow = `<tr class="monthly-avg-row"><td class="asset-name-cell">평균</td>${avgCells}<td class="${annualAvgCls}" style="font-weight:800">${formatSignedPct(
    annualAverage,
    1
  )}</td></tr>`;

  return `<thead>${headerRow}</thead><tbody>${bodyRows}${avgRow}</tbody>`;
}

/* ---------- 드로다운 상세 ---------- */
function buildDrawdownSection(bt) {
  const d = bt.maxDDDetail;
  if (!d) return "";
  const recoveryText = d.ongoing
    ? "미회복 (백테스트 종료 시점까지 회복 안 됨)"
    : `${d.recoveryDate} (${d.recoveryMonths}개월 소요)`;
  return `
    <h3 class="result-subheading">드로다운 상세</h3>
    <div class="result-grid">
      ${statTile("고점", d.peakDate)}
      ${statTile("저점", d.troughDate)}
      ${statTile("낙폭", formatPct(d.dd, 1), "negative")}
      ${statTile("고점 → 저점", `${d.drawdownMonths}개월`)}
      ${statTile("회복", recoveryText)}
      ${statTile(statLabelWithInfo("하방편차", "downsideDev"), formatPct(bt.downsideDev, 2))}
    </div>
    <div class="chart-wrap dd-wrap"><canvas id="drawdown-canvas"></canvas></div>
  `;
}

/* ---------- 고급 위험 지표 (Omega/Skew/Kurtosis/VaR/CVaR) ---------- */
function buildAdvancedStatsSection(bt) {
  return `
    <h3 class="result-subheading">고급 위험 지표</h3>
    <div class="result-grid">
      ${statTile(statLabelWithInfo("오메가 비율", "omega"), fmtRatio(bt.omega))}
      ${statTile(statLabelWithInfo("왜도 (Skewness)", "skew"), fmtRatio(bt.skew))}
      ${statTile(statLabelWithInfo("첨도 (Kurtosis)", "kurt"), fmtRatio(bt.kurt))}
      ${statTile(statLabelWithInfo("월간 VaR (95%)", "var95"), formatPct(bt.var95, 2), "negative")}
      ${statTile(statLabelWithInfo("월간 CVaR (95%)", "cvar95"), formatPct(bt.cvar95, 2), "negative")}
    </div>
  `;
}

/* ---------- 월간 수익 분포 ---------- */
function buildMonthlyStatsSection(bt) {
  const bestText = bt.bestMonth ? `${bt.bestMonth.date} · ${formatSignedPct(bt.bestMonth.return, 1)}` : "-";
  const worstText = bt.worstMonth ? `${bt.worstMonth.date} · ${formatSignedPct(bt.worstMonth.return, 1)}` : "-";
  return `
    <h3 class="result-subheading">월간 수익 분포</h3>
    <div class="result-grid">
      ${statTile("최고의 달", bestText, "positive")}
      ${statTile("최악의 달", worstText, "negative")}
      ${statTile("상승 달 비율", formatPct(bt.winRate, 1))}
      ${statTile("하락 달 비율", formatPct(1 - bt.winRate, 1))}
      ${statTile("평균 상승폭", formatSignedPct(bt.avgGain, 2), "positive")}
      ${statTile("평균 하락폭", formatSignedPct(bt.avgLoss, 2), "negative")}
      ${statTile(statLabelWithInfo("손익비", "gainLossRatio"), fmtRatio(bt.gainLossRatio))}
      ${statTile(statLabelWithInfo("Profit Factor", "profitFactor"), fmtRatio(bt.profitFactor))}
    </div>
  `;
}

/* ---------- 벤치마크 비교 ---------- */
function buildBenchmarkSection(bt) {
  const list = bt.benchmarks || [];
  if (list.length === 0) return "";
  const all = [{ label: "전략 (이 백테스트)", result: bt, isMain: true }, ...list];
  const rows = all
    .map(
      (b) => `
      <tr>
        <td class="asset-name-cell">${b.isMain ? `<b>${b.label}</b>` : b.label}</td>
        <td class="${b.result.cagr >= 0 ? "positive" : "negative"}">${formatSignedPct(b.result.cagr, 2)}</td>
        <td class="${b.result.totalReturn >= 0 ? "positive" : "negative"}">${formatSignedPct(b.result.totalReturn, 1)}</td>
        <td class="negative">${formatPct(b.result.mdd, 1)}</td>
        <td>${formatPct(b.result.annVol, 2)}</td>
        <td>${b.result.sharpe.toFixed(2)}</td>
      </tr>
    `
    )
    .join("");
  return `
    <h3 class="result-subheading">벤치마크 비교</h3>
    <p class="card-desc-short">같은 기간·투자금액 기준으로 비교합니다 (벤치마크는 수수료 미반영).</p>
    <div class="asset-table-wrap">
      <table class="asset-table">
        <thead><tr><th>구분</th><th>CAGR</th><th>누적수익률</th><th>MDD</th><th>변동성</th><th>샤프</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

/* ---------- 포트폴리오 구성 통계 (평균/최대/최소 비중, 평균 보유기간) ---------- */
function buildPortfolioStatsSection(bt) {
  const avgW = bt.avgWeights || {};
  const maxW = bt.maxWeights || {};
  const minW = bt.minWeights || {};
  const holdM = bt.avgHoldingMonths || {};
  const tickers = ASSET_ORDER.filter((t) => (avgW[t] || 0) > 0.001 || (maxW[t] || 0) > 0.001).sort((a, b) => (avgW[b] || 0) - (avgW[a] || 0));
  if (tickers.length === 0) return "";
  const rows = tickers
    .map(
      (t) => `
      <tr>
        <td class="asset-name-cell">${ASSET_DATA.assets[t].name}</td>
        <td>${formatPct(avgW[t] || 0, 1)}</td>
        <td>${formatPct(maxW[t] || 0, 1)}</td>
        <td>${formatPct(minW[t] || 0, 1)}</td>
        <td>${(holdM[t] || 0).toFixed(1)}개월</td>
      </tr>
    `
    )
    .join("");
  return `
    <h3 class="result-subheading">포트폴리오 구성 통계</h3>
    <p class="card-desc-short">백테스트 전체 기간 동안 각 자산이 실제로 보유된 비중의 통계입니다(리밸런싱 사이 가격 변동에 따른 자연 표류 포함).</p>
    <div class="asset-table-wrap">
      <table class="asset-table">
        <thead><tr><th>자산</th><th>평균 비중</th><th>최대 비중</th><th>최소 비중</th><th>평균 보유기간</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

/* ---------- 자산별 기여도 (수익/위험) ---------- */
function buildContributionSection(bt) {
  const contRet = bt.contributionToReturn || {};
  const contRisk = bt.contributionToRisk || {};
  const tickers = ASSET_ORDER.filter((t) => Math.abs(contRet[t] || 0) > 0.0001 || (contRisk[t] || 0) > 0.001).sort(
    (a, b) => (contRet[b] || 0) - (contRet[a] || 0)
  );
  if (tickers.length === 0) return "";
  const rows = tickers
    .map(
      (t) => `
      <tr>
        <td class="asset-name-cell">${ASSET_DATA.assets[t].name}</td>
        <td class="${(contRet[t] || 0) >= 0 ? "positive" : "negative"}">${formatSignedPct(contRet[t] || 0, 2)}</td>
        <td>${formatPct(contRisk[t] || 0, 1)}</td>
      </tr>
    `
    )
    .join("");
  return `
    <h3 class="result-subheading">자산별 기여도</h3>
    <p class="card-desc-short">수익 기여는 매달 (보유 비중 × 해당 자산 수익률)을 누적한 근사치이고, 위험 기여는 평균 비중과 전체 구간 공분산 기준으로 포트폴리오 전체 위험에서 차지하는 비율입니다.</p>
    <div class="asset-table-wrap">
      <table class="asset-table">
        <thead><tr><th>자산</th><th>수익 기여</th><th>위험 기여</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

/* ---------- 리밸런싱/턴오버 + 실제 거래 로그 ---------- */
function buildTurnoverSection(bt) {
  const ts = bt.turnoverStats;
  if (!ts) return "";
  const trades = bt.trades || [];
  const shown = trades.slice(-200);
  const tradeRows = shown
    .map(
      (tr) => `
      <tr>
        <td class="asset-name-cell">${tr.date}</td>
        <td>${ASSET_DATA.assets[tr.ticker] ? ASSET_DATA.assets[tr.ticker].name : tr.ticker}</td>
        <td>${formatPct(tr.before, 1)}</td>
        <td class="${tr.delta >= 0 ? "positive" : "negative"}">${formatSignedPct(tr.delta, 1)}</td>
        <td>${formatPct(tr.after, 1)}</td>
      </tr>
    `
    )
    .join("");
  const tradeTableHtml = trades.length
    ? `
      <div class="asset-table-wrap trade-log-wrap">
        <table class="asset-table">
          <thead><tr><th>날짜</th><th>자산</th><th>이전 비중</th><th>변경</th><th>이후 비중</th></tr></thead>
          <tbody>${tradeRows}</tbody>
        </table>
      </div>
      ${trades.length > 200 ? `<p class="chart-note">최근 200건만 표시합니다 (전체 ${trades.length}건).</p>` : ""}
    `
    : `<p class="result-placeholder">리밸런싱 시점에 비중 변경이 없었습니다.</p>`;

  return `
    <h3 class="result-subheading">리밸런싱 · 거래</h3>
    <div class="result-grid">
      ${statTile("총 리밸런싱 횟수", `${ts.rebalanceCount}회`)}
      ${statTile(statLabelWithInfo("평균 턴오버", "turnover"), formatPct(ts.avgTurnover, 1))}
      ${statTile("최대 턴오버", formatPct(ts.maxTurnover, 1))}
      ${statTile("연환산 턴오버", formatPct(ts.annualizedTurnover, 0))}
    </div>
    <div class="subsection-label">실제 거래 로그</div>
    ${tradeTableHtml}
  `;
}

/* ---------- 이름있는 전략의 마지막 판단 근거 ---------- */
function buildDecisionSection(bt) {
  const d = bt.decisionDetail;
  if (!d) return "";
  const ROLE_LABEL = { offensive: "위험자산", canary: "기준자산", defensive: "안전자산" };
  const rows = d.rows
    .map((r) => {
      const name = ASSET_DATA.assets[r.ticker] ? ASSET_DATA.assets[r.ticker].name : r.ticker;
      const roleTag = r.roles ? ` (${r.roles.map((role) => ROLE_LABEL[role]).join("·")})` : r.isSafe ? " (안전자산)" : "";
      const isSelected = r.selected || d.switchSelected === r.ticker;
      const scoreText = r.score === null || r.score === undefined ? "-" : d.kind === "trend" || d.kind === "laa" ? formatSignedPct(r.score, 2) : r.score.toFixed(2);
      const rr = r.returns || {};
      return `
        <tr class="${isSelected ? "positive" : ""}">
          <td class="asset-name-cell">${name}${roleTag}</td>
          <td>${formatSignedPct(rr[1], 1)}</td>
          <td>${formatSignedPct(rr[3], 1)}</td>
          <td>${formatSignedPct(rr[6], 1)}</td>
          <td>${formatSignedPct(rr[12], 1)}</td>
          <td style="font-weight:800">${scoreText}</td>
          <td>${isSelected ? "✓" : ""}</td>
        </tr>
      `;
    })
    .join("");
  const switchNote = d.switchSelected
    ? `<p class="card-desc-short">이번 재평가에서 전환자산으로 <b>${
        ASSET_DATA.assets[d.switchSelected] ? ASSET_DATA.assets[d.switchSelected].name : d.switchSelected
      }</b>가 선택되었습니다.</p>`
    : "";
  return `
    <h3 class="result-subheading">전략의 마지막 판단 근거 (${bt.decisionDate || "-"} 재평가 기준)</h3>
    <p class="card-desc-short">${d.label}</p>
    ${switchNote}
    <div class="asset-table-wrap">
      <table class="asset-table">
        <thead><tr><th>자산</th><th>1개월</th><th>3개월</th><th>6개월</th><th>12개월</th><th>점수</th><th>선택</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

/* ---------- 비용 영향 (수수료 반영 전/후) ---------- */
function buildCostSection(bt) {
  const c = bt.costComparison;
  const tc = bt.txCostComparison;
  if (!c && !tc) return "";

  const aumBlock = c
    ? `
      <div class="subsection-label">연 수수료 영향 (자산 규모 비례, 매달)</div>
      <div class="result-grid">
        ${statTile("연 수수료 반영 전 CAGR", formatSignedPct(c.cagrNoFee, 2), "positive")}
        ${statTile("연 수수료 반영 후 CAGR", formatSignedPct(bt.cagr, 2))}
        ${statTile("연간 손실분", formatSignedPct(-Math.abs(c.feeDragAnnual), 2), "negative")}
        ${statTile("연 수수료 반영 전 최종자산", formatManwon(c.finalValueNoFee))}
      </div>
    `
    : "";

  const txBlock = tc
    ? `
      <div class="subsection-label">거래 수수료 영향 (리밸런싱으로 실제 매매한 금액 비례)</div>
      <div class="result-grid">
        ${statTile("거래 수수료 반영 전 CAGR", formatSignedPct(tc.cagrNoTxFee, 2), "positive")}
        ${statTile("거래 수수료 반영 후 CAGR", formatSignedPct(bt.cagr, 2))}
        ${statTile("연간 손실분", formatSignedPct(-Math.abs(tc.txFeeDragAnnual), 2), "negative")}
        ${statTile("누적 거래 비용", formatManwon(bt.totalTxCost || 0))}
      </div>
    `
    : "";

  return `
    <h3 class="result-subheading">비용 영향</h3>
    ${aumBlock}
    ${txBlock}
  `;
}

function renderResult(bt) {
  const resultEl = document.getElementById("allocator-result");
  const rebalanceLabel =
    bt.mode === "dynamic"
      ? DYNAMIC_REBALANCE_LABEL[bt.rebalanceMonths] || "매달 재평가"
      : REBALANCE_LABEL[bt.rebalanceMonths] || "매달 리밸런싱";
  const feeNote = bt.feeAnnualPct > 0 ? ` · 연 수수료 ${bt.feeAnnualPct}%` : "";
  const txFeeNote = bt.txFeePct > 0 ? ` · 거래 수수료 ${bt.txFeePct}%` : "";
  const riskModeLabel = { invVol: "역변동성 가중", riskParity: "리스크 패리티", volTarget: "변동성 타겟팅" }[bt.riskMode] || "";
  const strategyNote =
    bt.mode === "dynamic"
      ? `${(DYNAMIC_STRATEGIES[bt.strategy] || {}).label || ""}${riskModeLabel ? " + " + riskModeLabel : ""} · `
      : bt.seasonal
      ? `계절성 (${bt.seasonal.seasonStart}월~${bt.seasonal.seasonEnd}월) · `
      : "";
  const bestYearText = bt.bestYear ? `${bt.bestYear.year}년 ${formatSignedPct(bt.bestYear.return, 1)}` : "-";
  const worstYearText = bt.worstYear ? `${bt.worstYear.year}년 ${formatSignedPct(bt.worstYear.return, 1)}` : "-";
  const pieCaption =
    bt.mode === "dynamic" || bt.seasonal ? `<div class="chart-note">마지막 리밸런싱 시점 기준 비중</div>` : "";
  const investNote = bt.dcaMode
    ? `매달 적립 ${formatManwon(bt.monthlyContribution)} · 총 납입액 ${formatManwon(bt.totalContributed)}`
    : `초기 투자금 ${formatManwon(bt.initialAmount)}`;
  const cagrLabel = bt.dcaMode ? statLabelWithInfo("연평균 수익률 (CAGR)", "cagrDca") : "연평균 수익률 (CAGR)";

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
      <div class="result-hero-sub">${bt.startDate} ~ ${bt.endDate} · ${investNote} · ${strategyNote}${rebalanceLabel}${feeNote}${txFeeNote}</div>
    </div>
    <div class="chart-wrap line-wrap"><canvas id="line-canvas"></canvas></div>

    <div class="result-grid">
      <div class="result-stat">
        <div class="result-stat-label">${cagrLabel}</div>
        <div class="result-stat-value ${bt.cagr >= 0 ? "positive" : "negative"}">${formatSignedPct(bt.cagr, 2)}</div>
      </div>
      <div class="result-stat">
        <div class="result-stat-label">누적수익률</div>
        <div class="result-stat-value ${bt.totalReturn >= 0 ? "positive" : "negative"}">${formatSignedPct(bt.totalReturn, 1)}</div>
      </div>
      <div class="result-stat">
        <div class="result-stat-label">총 수익금</div>
        <div class="result-stat-value ${bt.totalProfit >= 0 ? "positive" : "negative"}">${bt.totalProfit >= 0 ? "+" : ""}${formatManwon(bt.totalProfit)}</div>
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

    ${buildDrawdownSection(bt)}
    ${buildAdvancedStatsSection(bt)}
    ${buildMonthlyStatsSection(bt)}

    <h3 class="result-subheading">월별 수익률</h3>
    <p class="card-desc-short">색이 진할수록 그 달의 등락폭이 컸다는 뜻입니다(초록 상승·빨강 하락).</p>
    <div class="asset-table-wrap">
      <table class="asset-table monthly-table">
        ${buildMonthlyTable(bt)}
      </table>
    </div>

    ${buildBenchmarkSection(bt)}
    ${buildPortfolioStatsSection(bt)}
    ${buildContributionSection(bt)}
    ${buildTurnoverSection(bt)}
    ${buildDecisionSection(bt)}
    ${buildCostSection(bt)}
  `;
  renderPieChart(bt.finalWeights || {});
  renderLineChart(bt);
  renderDrawdownChart(bt);
}
