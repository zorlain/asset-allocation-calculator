/* ---------- 자산군 메타데이터 & 프리셋 ---------- */
const ASSET_ORDER = ["SPY", "QQQ", "SCHD", "KOSPI", "KOSDAQ", "EEM", "TLT", "IEF", "GLD", "DBC", "VNQ", "BIL"];

/* 원화 지수(가격지수, 배당 미반영)로 표시 단위가 다른 자산 - 자산 현황 탭 포맷팅에 사용 */
const INDEX_POINT_ASSETS = new Set(["KOSPI", "KOSDAQ"]);

const PRESETS = {
  "6040": {
    label: "60/40",
    desc: "주식 60% · 중기국채 40%",
    weights: { SPY: 0.6, IEF: 0.4 },
  },
  permanent: {
    label: "영구 포트폴리오",
    desc: "주식·장기국채·금·현금 각 25%",
    weights: { SPY: 0.25, TLT: 0.25, GLD: 0.25, BIL: 0.25 },
  },
  allweather: {
    label: "올웨더 (간소화)",
    desc: "주식30·장기채40·중기채15·금7.5·원자재7.5",
    weights: { SPY: 0.3, TLT: 0.4, IEF: 0.15, GLD: 0.075, DBC: 0.075 },
  },
};

const DYNAMIC_STRATEGIES = {
  momentum: {
    label: "듀얼 모멘텀",
    tip: "매 리밸런싱 시점마다 체크한 자산 중 최근 [기준 기간] 수익률이 가장 높은 상위 [보유 자산 수]개에 동일 비중으로 투자합니다. 선택된 자산의 수익률이 0% 이하면(절대모멘텀 미충족) 전액 현금성자산(BIL)으로 대피합니다.",
    showTopN: true,
  },
  trend: {
    label: "추세추종 (이동평균)",
    tip: "체크한 자산별로 입력한 비중을 기준비중으로 삼아, 가격이 최근 [기준 기간] 이동평균선 위에 있으면 기준비중대로 보유하고 아래에 있으면 그만큼 현금성자산(BIL)으로 전환합니다.",
    showTopN: false,
  },
  volTarget: {
    label: "변동성 타겟팅",
    tip: "체크한 자산들의 최근 [기준 기간] 변동성을 계산해 변동성이 낮을수록 비중을 높게 자동 배분합니다. 입력한 비중 값(%)은 사용하지 않고 체크 여부만 반영됩니다.",
    showTopN: false,
  },
};

/* ---------- 통계 유틸 ---------- */
function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

/* ---------- 자산별 월간 수익률 (종가 시계열 -> 수익률 시계열, 캐시) ---------- */
const _returnsCache = {};
function getAssetReturns(ticker) {
  if (_returnsCache[ticker]) return _returnsCache[ticker];
  const series = ASSET_DATA.assets[ticker].series;
  const dates = [];
  const returns = [];
  for (let i = 1; i < series.length; i++) {
    dates.push(series[i].d);
    returns.push(series[i].c / series[i - 1].c - 1);
  }
  return (_returnsCache[ticker] = { dates, returns });
}

/* 여러 자산의 수익률을 공통 구간(교집합 날짜)으로 정렬 */
function alignReturns(tickers) {
  const perTicker = tickers.map(getAssetReturns);
  let commonDates = perTicker[0].dates;
  for (let i = 1; i < perTicker.length; i++) {
    const set = new Set(perTicker[i].dates);
    commonDates = commonDates.filter((d) => set.has(d));
  }
  const returnsByTicker = {};
  tickers.forEach((t, idx) => {
    const map = new Map();
    perTicker[idx].dates.forEach((d, i) => map.set(d, perTicker[idx].returns[i]));
    returnsByTicker[t] = commonDates.map((d) => map.get(d));
  });
  return { dates: commonDates, returnsByTicker };
}

/* ---------- 자산 단독 통계 (자산 현황 탭) ---------- */
function assetStandaloneStats(ticker) {
  const series = ASSET_DATA.assets[ticker].series;
  const { returns } = getAssetReturns(ticker);
  const years = (series.length - 1) / 12;
  const cagr = years > 0 ? Math.pow(series[series.length - 1].c / series[0].c, 1 / years) - 1 : 0;
  const annVol = stdev(returns) * Math.sqrt(12);
  const last = series[series.length - 1];
  const oneMonthReturn = returns.length > 0 ? returns[returns.length - 1] : null;
  const oneYearReturn = series.length > 12 ? series[series.length - 1].c / series[series.length - 13].c - 1 : null;
  return {
    ticker,
    name: ASSET_DATA.assets[ticker].name,
    lastClose: last.c,
    lastDate: last.d,
    startDate: series[0].d,
    cagr,
    annVol,
    oneMonthReturn,
    oneYearReturn,
  };
}

/* ---------- 자산 간 상관관계 ---------- */
function correlation(a, b) {
  const n = a.length;
  if (n < 2) return 0;
  const ma = mean(a);
  const mb = mean(b);
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma;
    const db = b[i] - mb;
    cov += da * db;
    va += da * da;
    vb += db * db;
  }
  if (va === 0 || vb === 0) return 0;
  return cov / Math.sqrt(va * vb);
}

function correlationMatrix(tickers) {
  const matrix = {};
  tickers.forEach((a) => {
    matrix[a] = {};
    tickers.forEach((b) => {
      if (a === b) {
        matrix[a][b] = 1;
        return;
      }
      const { returnsByTicker } = alignReturns([a, b]);
      matrix[a][b] = correlation(returnsByTicker[a], returnsByTicker[b]);
    });
  });
  return matrix;
}

/* ---------- 위험(무) 이자율: 선택 구간과 겹치는 BIL 구간의 CAGR, 데이터 부족 시 2% 가정 ---------- */
function riskFreeCagr(dates) {
  const bil = getAssetReturns("BIL");
  const bilMap = new Map(bil.dates.map((d, i) => [d, bil.returns[i]]));
  const overlap = dates.filter((d) => bilMap.has(d));
  if (overlap.length < 12) return 0.02;
  let growth = 1;
  overlap.forEach((d) => (growth *= 1 + bilMap.get(d)));
  const years = overlap.length / 12;
  return Math.pow(growth, 1 / years) - 1;
}

/* 월간 수익률을 달력 연도별로 복리 계산해 연도별 수익률을 구한다 (부분 연도 포함) */
function annualReturnsFromMonthly(dates, monthlyReturns) {
  const byYear = {};
  dates.forEach((d, i) => {
    const y = d.slice(0, 4);
    (byYear[y] = byYear[y] || []).push(monthlyReturns[i]);
  });
  const yearly = {};
  Object.keys(byYear).forEach((y) => {
    let g = 1;
    byYear[y].forEach((r) => (g *= 1 + r));
    yearly[y] = g - 1;
  });
  return yearly;
}

/* 월별 수익률을 연도 x 1~12월 표 형태로 정리 (결과 화면의 월별 수익률 표에 사용) */
function monthlyReturnsTable(dates, monthlyReturns) {
  const byYear = {};
  dates.forEach((d, i) => {
    const y = d.slice(0, 4);
    const m = Number(d.slice(5, 7));
    byYear[y] = byYear[y] || {};
    byYear[y][m] = monthlyReturns[i];
  });
  const annual = annualReturnsFromMonthly(dates, monthlyReturns);
  return Object.keys(byYear)
    .sort()
    .map((y) => ({
      year: y,
      months: Array.from({ length: 12 }, (_, i) => (byYear[y][i + 1] !== undefined ? byYear[y][i + 1] : null)),
      annual: annual[y],
    }));
}

function downsideDeviation(monthlyReturns, mar = 0) {
  if (monthlyReturns.length === 0) return 0;
  const sqDevs = monthlyReturns.map((r) => (r < mar ? (r - mar) ** 2 : 0));
  const avg = sqDevs.reduce((a, b) => a + b, 0) / monthlyReturns.length;
  return Math.sqrt(avg) * Math.sqrt(12);
}

/* ---------- 백테스트 결과 공통 지표 계산 (정적/동적 엔진이 공유) ---------- */
function computeBacktestMetrics(dates, values, monthlyReturns, initialAmount) {
  const months = dates.length;
  const years = months / 12;
  const finalValue = values[values.length - 1];
  const cagr = years > 0 ? Math.pow(finalValue / initialAmount, 1 / years) - 1 : 0;
  const annVol = stdev(monthlyReturns) * Math.sqrt(12);

  let peak = values[0];
  let mdd = 0;
  values.forEach((v) => {
    peak = Math.max(peak, v);
    mdd = Math.min(mdd, (v - peak) / peak);
  });

  const rf = riskFreeCagr(dates);
  const sharpe = annVol > 0 ? (cagr - rf) / annVol : 0;

  const downsideDev = downsideDeviation(monthlyReturns);
  const sortino = downsideDev > 0 ? (cagr - rf) / downsideDev : 0;
  const calmar = mdd < 0 ? cagr / Math.abs(mdd) : 0;
  const winRate = monthlyReturns.length ? monthlyReturns.filter((r) => r > 0).length / monthlyReturns.length : 0;

  const yearly = annualReturnsFromMonthly(dates, monthlyReturns);
  let bestYear = null;
  let worstYear = null;
  Object.entries(yearly).forEach(([y, r]) => {
    if (!bestYear || r > bestYear.return) bestYear = { year: y, return: r };
    if (!worstYear || r < worstYear.return) worstYear = { year: y, return: r };
  });

  return {
    dates,
    values,
    monthlyReturns,
    months,
    years,
    finalValue,
    initialAmount,
    cagr,
    annVol,
    mdd,
    sharpe,
    sortino,
    calmar,
    winRate,
    bestYear,
    worstYear,
    startDate: dates[0],
    endDate: dates[dates.length - 1],
  };
}

/* ---------- 포트폴리오 백테스트 (정적 배분: 고정 비중 유지) ----------
   weights: { TICKER: 0~1 비중, 합 1 }, initialAmount: 시작 금액(만원 등 임의 단위)
   options: {
     rebalanceMonths: 리밸런싱 주기(개월). 0이면 리밸런싱 없음(최초 매수 후 보유). 기본 1(매달)
     feeAnnualPct: 연 운용 수수료(%, ETF 자체 보수 외 추가로 반영). 기본 0
     startDate / endDate: "YYYY-MM" 형식, 백테스트 구간 제한. 기본 전체 구간
   } */
function runBacktest(weights, initialAmount, options = {}) {
  const { rebalanceMonths = 1, feeAnnualPct = 0, startDate = null, endDate = null } = options;
  const tickers = Object.keys(weights).filter((t) => weights[t] > 0);
  if (tickers.length === 0) return null;

  let { dates, returnsByTicker } = alignReturns(tickers);
  if (startDate || endDate) {
    const keepIdx = [];
    dates.forEach((d, i) => {
      if (startDate && d < startDate) return;
      if (endDate && d > endDate) return;
      keepIdx.push(i);
    });
    dates = keepIdx.map((i) => dates[i]);
    const filtered = {};
    tickers.forEach((t) => (filtered[t] = keepIdx.map((i) => returnsByTicker[t][i])));
    returnsByTicker = filtered;
  }
  if (dates.length === 0) return null;

  const monthlyFee = feeAnnualPct / 100 / 12;

  const holdings = {};
  tickers.forEach((t) => (holdings[t] = weights[t] * initialAmount));

  const values = [initialAmount];
  const monthlyReturns = [];
  for (let i = 0; i < dates.length; i++) {
    const before = tickers.reduce((sum, t) => sum + holdings[t], 0);
    tickers.forEach((t) => {
      holdings[t] = holdings[t] * (1 + returnsByTicker[t][i]) * (1 - monthlyFee);
    });
    const after = tickers.reduce((sum, t) => sum + holdings[t], 0);
    monthlyReturns.push(after / before - 1);
    values.push(after);

    const monthIndex = i + 1;
    if (rebalanceMonths > 0 && monthIndex % rebalanceMonths === 0) {
      tickers.forEach((t) => (holdings[t] = weights[t] * after));
    }
  }

  const result = computeBacktestMetrics(dates, values, monthlyReturns, initialAmount);
  result.rebalanceMonths = rebalanceMonths;
  result.feeAnnualPct = feeAnnualPct;
  result.mode = "static";
  result.finalWeights = weights;
  return result;
}

/* ---------- 여러 자산의 종가를 공통 구간(교집합 날짜)으로 정렬 (동적 배분 신호 계산용) ---------- */
function alignSeries(tickers) {
  const perTicker = tickers.map((t) => ASSET_DATA.assets[t].series);
  let commonDates = perTicker[0].map((p) => p.d);
  for (let i = 1; i < perTicker.length; i++) {
    const set = new Set(perTicker[i].map((p) => p.d));
    commonDates = commonDates.filter((d) => set.has(d));
  }
  const closesByTicker = {};
  tickers.forEach((t, idx) => {
    const map = new Map(perTicker[idx].map((p) => [p.d, p.c]));
    closesByTicker[t] = commonDates.map((d) => map.get(d));
  });
  return { dates: commonDates, closesByTicker };
}

/* ---------- 동적 배분 전략별 목표 비중 계산 ----------
   idx: closesByTicker의 기준 시점 인덱스 (idx까지의 데이터만 사용 - 미래 데이터 참조 없음)
   반환값이 null이면 해당 시점엔 신호를 계산할 과거 데이터가 부족하다는 뜻 */
function computeDynamicWeights(strategy, params, candidates, closesByTicker, idx, safeAsset) {
  const lookback = Math.max(1, params.lookback || 12);
  if (idx < lookback) return null;
  const weights = {};

  if (strategy === "momentum") {
    const topN = Math.max(1, params.topN || 1);
    const scores = candidates.map((t) => ({
      t,
      ret: closesByTicker[t][idx] / closesByTicker[t][idx - lookback] - 1,
    }));
    scores.sort((a, b) => b.ret - a.ret);
    const picked = scores.slice(0, topN).filter((s) => s.ret > 0);
    if (picked.length === 0) {
      weights[safeAsset] = 1;
    } else {
      const w = 1 / picked.length;
      picked.forEach((s) => (weights[s.t] = (weights[s.t] || 0) + w));
    }
    return weights;
  }

  if (strategy === "trend") {
    const baseWeights = params.baseWeights || {};
    let safeAccum = 0;
    candidates.forEach((t) => {
      let sum = 0;
      for (let k = 0; k < lookback; k++) sum += closesByTicker[t][idx - k];
      const ma = sum / lookback;
      const price = closesByTicker[t][idx];
      const base = baseWeights[t] || 0;
      if (price >= ma) {
        weights[t] = (weights[t] || 0) + base;
      } else {
        safeAccum += base;
      }
    });
    if (safeAccum > 0) weights[safeAsset] = (weights[safeAsset] || 0) + safeAccum;
    return weights;
  }

  if (strategy === "volTarget") {
    let sumInv = 0;
    const invVols = {};
    candidates.forEach((t) => {
      const rets = [];
      for (let k = 0; k < lookback; k++) {
        rets.push(closesByTicker[t][idx - k] / closesByTicker[t][idx - k - 1] - 1);
      }
      const vol = stdev(rets) || 0.0001;
      invVols[t] = 1 / vol;
      sumInv += invVols[t];
    });
    candidates.forEach((t) => (weights[t] = invVols[t] / sumInv));
    return weights;
  }

  return null;
}

/* ---------- 포트폴리오 백테스트 (동적 배분: 매 리밸런싱마다 비중 재계산) ----------
   strategy: "momentum" | "trend" | "volTarget"
   params: { lookback: 기준 개월 수, topN: momentum 보유 자산 수, baseWeights: trend 기준비중(합 1) }
   candidates: 후보 자산 티커 배열, safeAsset: 신호가 부진할 때 대피할 자산(기본 BIL) */
function runDynamicBacktest(strategy, params, candidates, safeAsset, initialAmount, options = {}) {
  const { rebalanceMonths = 1, feeAnnualPct = 0, startDate = null, endDate = null } = options;
  if (candidates.length === 0) return null;

  const allTickers = Array.from(new Set([...candidates, safeAsset]));
  const { dates: closeDates, closesByTicker } = alignSeries(allTickers);
  if (closeDates.length < 2) return null;

  const returnDates = closeDates.slice(1);
  const returnsByTicker = {};
  allTickers.forEach((t) => {
    returnsByTicker[t] = [];
    for (let i = 1; i < closeDates.length; i++) {
      returnsByTicker[t].push(closesByTicker[t][i] / closesByTicker[t][i - 1] - 1);
    }
  });

  const lookback = Math.max(1, params.lookback || 12);

  let simStart = lookback;
  if (startDate) {
    const idx = returnDates.findIndex((d) => d >= startDate);
    if (idx === -1) return null;
    simStart = Math.max(simStart, idx);
  }
  let simEndExclusive = returnDates.length;
  if (endDate) {
    let lastIdx = -1;
    returnDates.forEach((d, i) => {
      if (d <= endDate) lastIdx = i;
    });
    if (lastIdx === -1) return null;
    simEndExclusive = lastIdx + 1;
  }
  if (simStart >= simEndExclusive) return null;

  let currentTargets = computeDynamicWeights(strategy, params, candidates, closesByTicker, simStart, safeAsset);
  if (!currentTargets) return null;

  const monthlyFee = feeAnnualPct / 100 / 12;
  const holdings = {};
  allTickers.forEach((t) => (holdings[t] = (currentTargets[t] || 0) * initialAmount));

  const values = [initialAmount];
  const monthlyReturns = [];
  const simDates = [];

  for (let i = simStart; i < simEndExclusive; i++) {
    const before = allTickers.reduce((sum, t) => sum + holdings[t], 0);
    allTickers.forEach((t) => {
      holdings[t] = holdings[t] * (1 + (returnsByTicker[t][i] || 0)) * (1 - monthlyFee);
    });
    const after = allTickers.reduce((sum, t) => sum + holdings[t], 0);
    monthlyReturns.push(after / before - 1);
    values.push(after);
    simDates.push(returnDates[i]);

    const stepCount = i - simStart + 1;
    if (rebalanceMonths > 0 && stepCount % rebalanceMonths === 0 && i + 1 < simEndExclusive) {
      const nextTargets = computeDynamicWeights(strategy, params, candidates, closesByTicker, i + 1, safeAsset);
      if (nextTargets) {
        currentTargets = nextTargets;
        allTickers.forEach((t) => (holdings[t] = (currentTargets[t] || 0) * after));
      }
    }
  }

  const result = computeBacktestMetrics(simDates, values, monthlyReturns, initialAmount);
  result.rebalanceMonths = rebalanceMonths;
  result.feeAnnualPct = feeAnnualPct;
  result.mode = "dynamic";
  result.strategy = strategy;
  result.finalWeights = currentTargets;
  return result;
}

/* ---------- 포맷 유틸 ---------- */
function formatPct(x, digits = 1) {
  if (x === null || x === undefined || !Number.isFinite(x)) return "-";
  return `${(x * 100).toFixed(digits)}%`;
}

function formatSignedPct(x, digits = 1) {
  if (x === null || x === undefined || !Number.isFinite(x)) return "-";
  const sign = x > 0 ? "+" : "";
  return `${sign}${(x * 100).toFixed(digits)}%`;
}

function formatUsd(x) {
  return `$${x.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function formatIndexPoint(x) {
  return `${x.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}pt`;
}

function formatAssetPrice(ticker, x) {
  return INDEX_POINT_ASSETS.has(ticker) ? formatIndexPoint(x) : formatUsd(x);
}

function formatManwon(n) {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 10000) {
    return `${sign}${(abs / 10000).toFixed(2)}억원`;
  }
  return `${sign}${Math.round(abs).toLocaleString("ko-KR")}만원`;
}
