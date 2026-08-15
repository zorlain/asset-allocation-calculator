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
