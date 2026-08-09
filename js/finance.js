/* ---------- 자산군 메타데이터 & 프리셋 ---------- */
const ASSET_ORDER = ["SPY", "QQQ", "SCHD", "EEM", "TLT", "IEF", "GLD", "DBC", "VNQ", "BIL"];

const ASSET_ICON = {
  SPY: "🇺🇸",
  QQQ: "💻",
  SCHD: "💰",
  EEM: "🌏",
  TLT: "🏛️",
  IEF: "🏦",
  GLD: "🥇",
  DBC: "🛢️",
  VNQ: "🏢",
  BIL: "💵",
};

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

function downsideDeviation(monthlyReturns, mar = 0) {
  if (monthlyReturns.length === 0) return 0;
  const sqDevs = monthlyReturns.map((r) => (r < mar ? (r - mar) ** 2 : 0));
  const avg = sqDevs.reduce((a, b) => a + b, 0) / monthlyReturns.length;
  return Math.sqrt(avg) * Math.sqrt(12);
}

/* ---------- 포트폴리오 백테스트 ----------
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
  const winRate = monthlyReturns.filter((r) => r > 0).length / monthlyReturns.length;

  const yearly = annualReturnsFromMonthly(dates, monthlyReturns);
  const yearEntries = Object.entries(yearly);
  let bestYear = null;
  let worstYear = null;
  yearEntries.forEach(([y, r]) => {
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
    rebalanceMonths,
    feeAnnualPct,
    startDate: dates[0],
    endDate: dates[dates.length - 1],
  };
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

function formatManwon(n) {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 10000) {
    return `${sign}${(abs / 10000).toFixed(2)}억원`;
  }
  return `${sign}${Math.round(abs).toLocaleString("ko-KR")}만원`;
}
