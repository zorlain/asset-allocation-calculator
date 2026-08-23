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
      renderDrawdownChart(lastResult);
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
  const txFee = Number(params.get("txFee")) || 0;
  const start = params.get("start") || "";
  const end = params.get("end") || "";
  const dcaMode = params.get("dca") === "1";
  const monthlyContribution = Number(params.get("monthly")) || 0;
  const baseOptions = {
    feeAnnualPct: fee,
    txFeePct: txFee,
    startDate: start || null,
    endDate: end || null,
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
    if (params.has("presetOverride")) {
      try {
        setPresetOverride(strategy, JSON.parse(params.get("presetOverride")));
      } catch {
        /* 파싱 실패 시 기본 구성으로 계산 */
      }
    }
    const p = { lookback: Number(params.get("lookback")) || 12 };
    const riskMode = params.get("riskMode") || "none";
    const riskParams = {
      lookback: p.lookback,
      targetVol: params.has("targetVol") ? Number(params.get("targetVol")) / 100 : 0.1,
      maxWeightPct: params.has("maxWeightPct") ? Number(params.get("maxWeightPct")) : null,
      minCashPct: params.has("minCashPct") ? Number(params.get("minCashPct")) : null,
    };
    const options = { ...baseOptions, rebalanceMonths: Number(params.get("dynRebalance")) || 1, riskMode, riskParams };

    if (strategy === "momentum" || strategy === "relMomentum") {
      p.topN = Number(params.get("topn")) || 2;
      p.baseWeights = normalizeWeights(weights, candidates);
    } else if (strategy === "trend" || strategy === "absMomentum") {
      p.baseWeights = normalizeWeights(weights, candidates);
    }
    const safeAsset = params.get("safeAsset") || "BIL";
    bt = runDynamicBacktest(strategy, p, candidates, safeAsset, amount, options);
  } else {
    const rebalanceMonths = Number(params.get("rebalance"));
    baseOptions.rebalanceMonths = Number.isFinite(rebalanceMonths) ? rebalanceMonths : 1;

    if (params.get("seasonal") === "1") {
      baseOptions.seasonal = {
        seasonStart: Number(params.get("seasonStart")) || 11,
        seasonEnd: Number(params.get("seasonEnd")) || 4,
        seasonInPct: params.has("seasonInPct") ? Number(params.get("seasonInPct")) / 100 : 1,
        seasonOutPct: params.has("seasonOutPct") ? Number(params.get("seasonOutPct")) / 100 : 0,
        safeAsset: params.get("staticSafeAsset") || "BIL",
      };
    }

    bt = runBacktest(weights, amount, baseOptions);
  }

  if (!bt) {
    resultEl.innerHTML = `<p class="result-placeholder">선택한 조건으로는 결과를 계산할 수 없습니다. 자산 조합이나 기간을 조정해 메인 페이지에서 다시 시도해주세요.</p>`;
    return;
  }

  // 벤치마크 비교 - 같은 기간·투자금액·적립 조건으로 대표 지수/고정배분과 나란히 비교한다.
  // 벤치마크는 수수료 없는 순수 지수/고정비중 기준으로 계산(사용자 전략의 수수료와 섞이지 않게).
  const benchOptions = {
    feeAnnualPct: 0,
    startDate: start || null,
    endDate: end || null,
    dcaMode,
    monthlyContribution,
    rebalanceMonths: 1,
  };
  const benchmarks = [];
  const spyBt = runBacktest({ SPY: 1 }, amount, benchOptions);
  if (spyBt) benchmarks.push({ key: "spy", label: "S&P 500", result: spyBt });
  const b6040 = runBacktest({ SPY: 0.6, IEF: 0.4 }, amount, benchOptions);
  if (b6040) benchmarks.push({ key: "6040", label: "60/40", result: b6040 });
  if (mode === "static") {
    const bh = runBacktest(weights, amount, { ...benchOptions, rebalanceMonths: 0 });
    if (bh) benchmarks.push({ key: "bh", label: "Buy & Hold (리밸런싱 없음)", result: bh });
  }
  bt.benchmarks = benchmarks;

  lastResult = bt;
  renderResult(bt);
}

document.addEventListener("DOMContentLoaded", () => {
  initThemeToggleStandalone();
  runFromParams();
});
