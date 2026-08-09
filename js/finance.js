/* ---------- 자산군 메타데이터 & 프리셋 ---------- */
const ASSET_ORDER = ["SPY", "EEM", "TLT", "IEF", "GLD", "DBC", "VNQ", "BIL"];

const ASSET_ICON = {
  SPY: "🇺🇸",
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

/* ---------- 포트폴리오 백테스트 (월 리밸런싱 가정) ----------
   weights: { TICKER: 0~1 비중, 합 1 }, initialAmount: 시작 금액(만원 등 임의 단위) */
function runBacktest(weights, initialAmount) {
  const tickers = Object.keys(weights).filter((t) => weights[t] > 0);
  if (tickers.length === 0) return null;

  const { dates, returnsByTicker } = alignReturns(tickers);
  if (dates.length === 0) return null;

  const values = [initialAmount];
  const monthlyReturns = [];
  for (let i = 0; i < dates.length; i++) {
    let r = 0;
    tickers.forEach((t) => (r += weights[t] * returnsByTicker[t][i]));
    monthlyReturns.push(r);
    values.push(values[values.length - 1] * (1 + r));
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

  return {
    dates,
    values,
    monthlyReturns,
    months,
    years,
    finalValue,
    cagr,
    annVol,
    mdd,
    sharpe,
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
