/* ---------- result.html 전용: URL 쿼리스트링으로 넘어온 설정을 다시 계산해서 보여준다 ---------- */
let lastResult = null;

function parseWeightsParam(str) {
  const weights = {};
  if (!str) return weights;
  str.split(",").forEach((pair) => {
    const [ticker, pct] = pair.split(":");
    const v = Number(pct);
    if (ticker && Number.isFinite(v) && v > 0) weights[ticker] = v / 100;
  });
  return weights;
}

/* 후보 자산의 비중을 합 1이 되도록 정규화 (전부 0이면 동일 비중) - app.js의 buildNormalizedBaseWeights와 동일한 규칙 */
function normalizeWeights(weights, candidates) {
  const total = candidates.reduce((sum, t) => sum + (weights[t] || 0), 0);
  const out = {};
  if (total > 0) {
    candidates.forEach((t) => (out[t] = (weights[t] || 0) / total));
  } else {
    const eq = 1 / candidates.length;
    candidates.forEach((t) => (out[t] = eq));
  }
  return out;
}

function initThemeToggleStandalone() {
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
    if (lastResult) {
      renderPieChart(lastResult.finalWeights || {});
      renderLineChart(lastResult);
    }
  });
}

function runFromParams() {
  const resultEl = document.getElementById("allocator-result");
  const params = new URLSearchParams(window.location.search);
  const weights = parseWeightsParam(params.get("w"));

  if (Object.keys(weights).length === 0) {
    resultEl.innerHTML = `<p class="result-placeholder">불러올 결과가 없습니다. 메인 페이지에서 계산 후 "새 창에서 보기"를 눌러주세요.</p>`;
    return;
  }

  setDataOptions({ useAdjClose: params.get("adj") === "1", reflectFx: params.get("fx") === "1" });

  const mode = params.get("mode") === "dynamic" ? "dynamic" : "static";
  const parsedAmount = Number(params.get("amount"));
  const amount = Number.isFinite(parsedAmount) ? parsedAmount : 10000;
  const fee = Number(params.get("fee")) || 0;
  const start = params.get("start") || "";
  const end = params.get("end") || "";
  const dcaMode = params.get("dca") === "1";
  const monthlyContribution = Number(params.get("monthly")) || 0;
  const baseOptions = {
    feeAnnualPct: fee,
    startDate: start ? `${start}-01` : null,
    endDate: end ? `${end}-12` : null,
    dcaMode,
    monthlyContribution,
  };

  let bt = null;
  if (mode === "dynamic") {
    const strategy = params.get("strategy");
    const candidates = Object.keys(weights);
    if (!strategy || !DYNAMIC_STRATEGIES[strategy]) {
      resultEl.innerHTML = `<p class="result-placeholder">불러올 결과가 없습니다. 메인 페이지에서 계산 후 "새 창에서 보기"를 눌러주세요.</p>`;
      return;
    }
    const p = { lookback: Number(params.get("lookback")) || 12 };
    const options = { ...baseOptions, rebalanceMonths: Number(params.get("dynRebalance")) || 1 };

    if (strategy === "momentum") {
      p.topN = Number(params.get("topn")) || 1;
    } else if (strategy === "trend") {
      p.baseWeights = normalizeWeights(weights, candidates);
    } else if (strategy === "seasonal") {
      p.baseWeights = normalizeWeights(weights, candidates);
      p.seasonStart = Number(params.get("seasonStart")) || 11;
      p.seasonEnd = Number(params.get("seasonEnd")) || 4;
      p.seasonInPct = params.has("seasonInPct") ? Number(params.get("seasonInPct")) / 100 : 1;
      p.seasonOutPct = params.has("seasonOutPct") ? Number(params.get("seasonOutPct")) / 100 : 0;
      options.rebalanceMonths = 1;
    }
    bt = runDynamicBacktest(strategy, p, candidates, "BIL", amount, options);
  } else {
    const rebalanceMonths = Number(params.get("rebalance"));
    baseOptions.rebalanceMonths = Number.isFinite(rebalanceMonths) ? rebalanceMonths : 1;
    bt = runBacktest(weights, amount, baseOptions);
  }

  if (!bt) {
    resultEl.innerHTML = `<p class="result-placeholder">선택한 조건으로는 결과를 계산할 수 없습니다. 자산 조합이나 기간을 조정해 메인 페이지에서 다시 시도해주세요.</p>`;
    return;
  }
  lastResult = bt;
  renderResult(bt);
}

document.addEventListener("DOMContentLoaded", () => {
  initThemeToggleStandalone();
  runFromParams();
});
