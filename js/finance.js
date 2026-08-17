/* ---------- 자산군 메타데이터 & 프리셋 ---------- */
const ASSET_ORDER = [
  "SPY",
  "QQQ",
  "SCHD",
  "SSO",
  "SDS",
  "QLD",
  "QID",
  "TQQQ",
  "SQQQ",
  "IWM",
  "KOSPI",
  "KOSDAQ",
  "KOSPI2X",
  "KOSPIINV",
  "KOSDAQ2X",
  "KOSDAQINV",
  "EFA",
  "VGK",
  "EEM",
  "MCHI",
  "EWJ",
  "KRBOND3Y",
  "KRBOND10Y",
  "KRBOND30Y",
  "SHY",
  "IEF",
  "TLT",
  "TIP",
  "HYG",
  "GLD",
  "SLV",
  "DBC",
  "USO",
  "VNQ",
  "BIL",
  "KRCASH",
  "BTC",
  "BITI",
  "ETH",
  "ETHS",
];

/* 자산 추가 목록을 묶어서 보여줄 때 쓰는 분류 (국가·자산군 기준의 세부 카테고리) */
const ASSET_GROUP = {
  KOSPI: "krStock",
  KOSDAQ: "krStock",
  KOSPI2X: "krStock",
  KOSPIINV: "krStock",
  KOSDAQ2X: "krStock",
  KOSDAQINV: "krStock",
  SPY: "usStock",
  QQQ: "usStock",
  SCHD: "usStock",
  SSO: "usStock",
  SDS: "usStock",
  QLD: "usStock",
  QID: "usStock",
  TQQQ: "usStock",
  SQQQ: "usStock",
  IWM: "usStock",
  EFA: "intlStock",
  VGK: "intlStock",
  EEM: "intlStock",
  MCHI: "intlStock",
  EWJ: "intlStock",
  KRBOND3Y: "bond",
  KRBOND10Y: "bond",
  KRBOND30Y: "bond",
  SHY: "bond",
  IEF: "bond",
  TLT: "bond",
  TIP: "bond",
  HYG: "bond",
  GLD: "safe",
  SLV: "alt",
  BIL: "safe",
  KRCASH: "safe",
  DBC: "alt",
  USO: "alt",
  VNQ: "alt",
  BTC: "crypto",
  BITI: "crypto",
  ETH: "crypto",
  ETHS: "crypto",
};

const ASSET_GROUP_LABEL = {
  krStock: "한국주식",
  usStock: "미국주식",
  intlStock: "해외주식 (선진국·신흥국)",
  bond: "채권",
  safe: "안전자산 (금·현금성)",
  alt: "대체자산 (원자재·리츠·귀금속)",
  crypto: "코인",
};
const ASSET_GROUP_ORDER = ["krStock", "usStock", "intlStock", "bond", "safe", "alt", "crypto"];

/* 원화 지수(가격지수, 배당 미반영)로 표시 단위가 다른 자산 - 자산 현황 탭 포맷팅에 사용 */
const INDEX_POINT_ASSETS = new Set(["KOSPI", "KOSDAQ"]);

/* 이미 원화로 표시되는 자산(지수 포인트 + 원화 ETF) - 환율 반영 토글의 적용 제외 대상 */
const KRW_ASSETS = new Set([
  "KOSPI",
  "KOSDAQ",
  "KOSPI2X",
  "KOSPIINV",
  "KOSDAQ2X",
  "KOSDAQINV",
  "KRBOND3Y",
  "KRBOND10Y",
  "KRBOND30Y",
  "KRCASH",
]);

/* 환율 반영 토글의 적용 대상 (아직 원화가 아닌 자산 전부: 달러 ETF, 비트코인 등) */
const USD_ASSETS = new Set(ASSET_ORDER.filter((t) => !KRW_ASSETS.has(t)));

/* ---------- 데이터 계산 옵션 (환율 반영 / 배당 재투자) ----------
   설정 화면의 체크박스로 전역 상태를 바꾸며, 바뀌면 아래 캐시를 모두 비운다. */
let DATA_OPTIONS = { useAdjClose: false, reflectFx: false };
const _seriesCache = {};
const _returnsCache = {};

function setDataOptions(opts) {
  DATA_OPTIONS = { ...DATA_OPTIONS, ...opts };
  Object.keys(_seriesCache).forEach((k) => delete _seriesCache[k]);
  Object.keys(_returnsCache).forEach((k) => delete _returnsCache[k]);
}

/* 배당재투자(수정종가)·환율반영 옵션을 적용한 가격 시리즈. 원계열은 건드리지 않는다. */
function getAdjustedSeries(ticker) {
  const cacheKey = `${ticker}|${DATA_OPTIONS.useAdjClose}|${DATA_OPTIONS.reflectFx}`;
  if (_seriesCache[cacheKey]) return _seriesCache[cacheKey];

  const raw = ASSET_DATA.assets[ticker].series;
  let series = raw.map((p) => ({ d: p.d, c: DATA_OPTIONS.useAdjClose && p.ac != null ? p.ac : p.c }));

  if (DATA_OPTIONS.reflectFx && USD_ASSETS.has(ticker)) {
    const fx = (ASSET_DATA.fx && ASSET_DATA.fx.USDKRW) || [];
    const fxMap = new Map(fx.map((p) => [p.d, p.c]));
    series = series.filter((p) => fxMap.has(p.d)).map((p) => ({ d: p.d, c: p.c * fxMap.get(p.d) }));
  }

  return (_seriesCache[cacheKey] = series);
}

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
    tip: "매 재평가 시점마다 후보로 추가한 자산 중 최근 [기준 기간] 수익률이 가장 높은 상위 [동시 보유 자산 수]개를 골라, 그 안에서 입력한 비중 비율대로 나눠 투자합니다(예: 두 자산이 선택되고 비중을 60/40으로 입력했다면 60:40으로 배분). 선택된 자산의 수익률이 0% 이하면(절대모멘텀 미충족) 전액 안전자산으로 대피합니다.",
    showTopN: true,
    usesWeightNumber: true,
    usesSafeAsset: true,
  },
  trend: {
    label: "추세추종 (이동평균)",
    tip: "후보로 추가한 자산별로 입력한 비중을 기준비중(서로 간 상대 비율로 자동 환산)으로 삼아, 가격이 최근 [기준 기간] 이동평균선 위에 있으면 기준비중대로 보유하고 아래에 있으면 그만큼 안전자산으로 전환합니다.",
    showTopN: false,
    usesWeightNumber: true,
    usesSafeAsset: true,
  },
  volTarget: {
    label: "변동성 타겟팅",
    tip: "후보로 추가한 자산들의 최근 [기준 기간] 변동성을 계산해 변동성이 낮을수록 비중을 높게 자동 배분합니다. 입력한 비중 숫자는 사용하지 않고 후보로 추가되어 있는지만 반영됩니다.",
    showTopN: false,
    usesWeightNumber: false,
  },
  riskParity: {
    label: "리스크 패리티",
    tip: "후보로 추가한 자산들의 최근 [기준 기간] 수익률로 공분산(상관관계+변동성)을 계산해, 각 자산이 포트폴리오 전체 위험에 기여하는 비중이 서로 같아지도록 자동 배분합니다. 변동성 타겟팅과 달리 자산 간 상관관계도 함께 고려하므로, 상관관계가 낮은 자산일수록 분산 효과 덕분에 비중이 더 커지는 경향이 있습니다. 입력한 비중 숫자는 사용하지 않습니다.",
    showTopN: false,
    usesWeightNumber: false,
  },
  seasonal: {
    label: "계절성 (Sell in May)",
    tip: "설정한 투자 기간(기본 11월~4월)과 그 외 기간에 각각 목표 비중의 몇 %를 투자할지 정합니다. 나머지는 안전자산으로 둡니다. '11월~4월 강세, 5월~10월 약세'로 알려진 계절성 패턴을 활용하는 전략으로, 기본값은 성수기 100%·비수기 0%(전액 안전자산)입니다.",
    showTopN: false,
    usesWeightNumber: true,
    isSeasonal: true,
    usesSafeAsset: true,
  },
};

/* 계절성 전략: month(1~12)가 시작월~종료월 구간에 포함되는지 (11→4처럼 연말을 넘어가는 구간도 처리) */
function isMonthInSeason(month, startMonth, endMonth) {
  if (startMonth <= endMonth) return month >= startMonth && month <= endMonth;
  return month >= startMonth || month <= endMonth;
}

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
function getAssetReturns(ticker) {
  const cacheKey = `${ticker}|${DATA_OPTIONS.useAdjClose}|${DATA_OPTIONS.reflectFx}`;
  if (_returnsCache[cacheKey]) return _returnsCache[cacheKey];
  const series = getAdjustedSeries(ticker);
  const dates = [];
  const returns = [];
  for (let i = 1; i < series.length; i++) {
    dates.push(series[i].d);
    returns.push(series[i].c / series[i - 1].c - 1);
  }
  return (_returnsCache[cacheKey] = { dates, returns });
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
  const rawSeries = ASSET_DATA.assets[ticker].series; // 표시용 최근 종가는 항상 원래 통화·비조정 가격
  const series = getAdjustedSeries(ticker); // 배당재투자/환율반영 옵션이 적용된 시리즈 (수익률 계산용)
  const { returns } = getAssetReturns(ticker);
  const years = (series.length - 1) / 12;
  const cagr = years > 0 ? Math.pow(series[series.length - 1].c / series[0].c, 1 / years) - 1 : 0;
  const annVol = stdev(returns) * Math.sqrt(12);
  const lastRaw = rawSeries[rawSeries.length - 1];
  const oneMonthReturn = returns.length > 0 ? returns[returns.length - 1] : null;
  const oneYearReturn = series.length > 12 ? series[series.length - 1].c / series[series.length - 13].c - 1 : null;
  return {
    ticker,
    name: ASSET_DATA.assets[ticker].name,
    lastClose: lastRaw.c,
    lastDate: lastRaw.d,
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

/* 연도x월 표에서 각 월(1~12월)의 평균 수익률을 계산 (계절성 요약행에 사용) */
function monthlySeasonalAverages(rows) {
  const monthAverages = Array.from({ length: 12 }, (_, i) => {
    const vals = rows.map((r) => r.months[i]).filter((v) => v !== null && v !== undefined);
    return vals.length ? mean(vals) : null;
  });
  const annualVals = rows.map((r) => r.annual).filter((v) => v !== null && v !== undefined);
  const annualAverage = annualVals.length ? mean(annualVals) : null;
  return { monthAverages, annualAverage };
}

function downsideDeviation(monthlyReturns, mar = 0) {
  if (monthlyReturns.length === 0) return 0;
  const sqDevs = monthlyReturns.map((r) => (r < mar ? (r - mar) ** 2 : 0));
  const avg = sqDevs.reduce((a, b) => a + b, 0) / monthlyReturns.length;
  return Math.sqrt(avg) * Math.sqrt(12);
}

/* 적립식(초기 투자금 + 매달 일정 금액 납입) 백테스트의 연평균 수익률 계산용. 초기 투자금과 매달
   납입액이 각기 다른 기간 동안 복리로 불어나 최종 자산이 되는 월 이자율(r)을, 거치식 미래가치
   공식(초기 투자금)과 연금 미래가치 공식(매달 납입액)을 합친 식을 이분법으로 역산해 구한 뒤
   연율화한다 - 원금이 한 번에 투입되지 않아 단순 (최종/원금)^(1/년) 공식을 쓸 수 없기 때문에
   내부수익률(IRR) 방식으로 계산한다. */
function solveMonthlyRateForAnnuityDue(initialAmount, contribution, months, finalValue) {
  if (!(months > 0)) return null;
  if (!(initialAmount > 0) && !(contribution > 0)) return null;
  const fv = (r) => {
    const lumpFactor = Math.pow(1 + r, months);
    const annuityFactor = Math.abs(r) < 1e-9 ? months : ((lumpFactor - 1) / r) * (1 + r);
    return initialAmount * lumpFactor + contribution * annuityFactor;
  };
  let lo = -0.99;
  let hi = 10;
  if (finalValue <= fv(lo)) return lo;
  if (finalValue >= fv(hi)) return hi;
  for (let iter = 0; iter < 100; iter++) {
    const mid = (lo + hi) / 2;
    if (fv(mid) < finalValue) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/* ---------- 백테스트 결과 공통 지표 계산 (정적/동적 엔진이 공유) ---------- */
function computeBacktestMetrics(dates, values, monthlyReturns, initialAmount, options = {}) {
  const { dcaMode = false, monthlyContribution = 0 } = options;
  const months = dates.length;
  const years = months / 12;
  const finalValue = values[values.length - 1];
  const totalContributed = dcaMode ? initialAmount + monthlyContribution * months : initialAmount;

  let cagr;
  if (dcaMode) {
    const monthlyRate = solveMonthlyRateForAnnuityDue(initialAmount, monthlyContribution, months, finalValue);
    cagr = monthlyRate === null ? 0 : Math.pow(1 + monthlyRate, 12) - 1;
  } else {
    cagr = years > 0 ? Math.pow(finalValue / initialAmount, 1 / years) - 1 : 0;
  }
  const annVol = stdev(monthlyReturns) * Math.sqrt(12);

  // MDD는 납입 시점에 따라 계좌 잔액 규모가 왜곡되지 않도록 실제 잔액이 아닌 월별 수익률을
  // 누적한 지수(1에서 시작)로 계산한다 (거치식은 결과적으로 잔액 기준과 동일함)
  let idx = 1;
  let peak = 1;
  let mdd = 0;
  monthlyReturns.forEach((r) => {
    idx *= 1 + r;
    peak = Math.max(peak, idx);
    mdd = Math.min(mdd, (idx - peak) / peak);
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
    dcaMode,
    monthlyContribution,
    totalContributed,
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
  const {
    rebalanceMonths = 1,
    feeAnnualPct = 0,
    startDate = null,
    endDate = null,
    dcaMode = false,
    monthlyContribution = 0,
  } = options;
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
    if (dcaMode) {
      tickers.forEach((t) => {
        holdings[t] += weights[t] * monthlyContribution;
      });
    }
    const before = tickers.reduce((sum, t) => sum + holdings[t], 0);
    tickers.forEach((t) => {
      holdings[t] = holdings[t] * (1 + returnsByTicker[t][i]) * (1 - monthlyFee);
    });
    const after = tickers.reduce((sum, t) => sum + holdings[t], 0);
    monthlyReturns.push(before > 0 ? after / before - 1 : 0);
    values.push(after);

    const monthIndex = i + 1;
    if (rebalanceMonths > 0 && monthIndex % rebalanceMonths === 0) {
      tickers.forEach((t) => (holdings[t] = weights[t] * after));
    }
  }

  const result = computeBacktestMetrics(dates, values, monthlyReturns, initialAmount, { dcaMode, monthlyContribution });
  result.rebalanceMonths = rebalanceMonths;
  result.feeAnnualPct = feeAnnualPct;
  result.mode = "static";
  result.finalWeights = weights;
  return result;
}

/* ---------- 여러 자산의 종가를 공통 구간(교집합 날짜)으로 정렬 (동적 배분 신호 계산용) ---------- */
function alignSeries(tickers) {
  const perTicker = tickers.map((t) => getAdjustedSeries(t));
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

/* 리스크 패리티(동일위험기여) 비중 계산 - 공분산 행렬(cov)이 주어졌을 때, 각 자산의 위험 기여도
   (w_i * (Σw)_i)가 서로 같아지도록 비중을 반복적으로 조정한다(long-only, 합 1로 정규화).
   엄밀한 해석해가 없어 널리 쓰이는 승법적 반복(iterative proportional scaling)으로 근사한다:
   자산의 위험 기여도가 평균보다 크면 비중을 줄이고 작으면 늘리는 과정을 반복하면 균형점에 수렴한다. */
function solveRiskParityWeights(cov) {
  const n = cov.length;
  if (n === 1) return [1];
  let w = new Array(n).fill(1 / n);
  for (let iter = 0; iter < 200; iter++) {
    const sw = cov.map((row) => row.reduce((s, c, j) => s + c * w[j], 0));
    const rc = w.map((wi, i) => wi * sw[i]);
    const total = rc.reduce((a, b) => a + b, 0);
    if (!(total > 0)) break;
    const target = total / n;
    const wNew = w.map((wi, i) => {
      const ratio = rc[i] > 1e-12 ? target / rc[i] : 1;
      return Math.max(wi * Math.sqrt(ratio), 1e-6);
    });
    const sum = wNew.reduce((a, b) => a + b, 0);
    w = wNew.map((x) => x / sum);
  }
  return w;
}

/* ---------- 동적 배분 전략별 목표 비중 계산 ----------
   idx: closesByTicker의 기준 시점 인덱스 (idx까지의 데이터만 사용 - 미래 데이터 참조 없음)
   date: idx 시점의 "YYYY-MM" 날짜 (계절성 전략에서 달을 판단할 때 사용)
   반환값이 null이면 해당 시점엔 신호를 계산할 과거 데이터가 부족하다는 뜻 */
function computeDynamicWeights(strategy, params, candidates, closesByTicker, idx, safeAsset, date) {
  const weights = {};

  if (strategy === "seasonal") {
    if (!date) return null;
    const month = Number(date.slice(5, 7));
    const inSeason = isMonthInSeason(month, params.seasonStart || 11, params.seasonEnd || 4);
    const pct = inSeason
      ? params.seasonInPct != null
        ? params.seasonInPct
        : 1
      : params.seasonOutPct != null
      ? params.seasonOutPct
      : 0;
    const baseWeights = params.baseWeights || {};
    let invested = 0;
    candidates.forEach((t) => {
      const w = (baseWeights[t] || 0) * pct;
      weights[t] = w;
      invested += w;
    });
    const remainder = 1 - invested;
    if (remainder > 0) weights[safeAsset] = (weights[safeAsset] || 0) + remainder;
    return weights;
  }

  const lookback = Math.max(1, params.lookback || 12);
  if (idx < lookback) return null;

  if (strategy === "momentum") {
    const topN = Math.max(1, params.topN || 2);
    const baseWeights = params.baseWeights || {};
    const scores = candidates.map((t) => ({
      t,
      ret: closesByTicker[t][idx] / closesByTicker[t][idx - lookback] - 1,
    }));
    scores.sort((a, b) => b.ret - a.ret);
    const picked = scores.slice(0, topN).filter((s) => s.ret > 0);
    if (picked.length === 0) {
      weights[safeAsset] = 1;
    } else {
      // 선택된 자산끼리 입력한 비중 비율대로 재분배(정규화). 비중을 입력하지 않았다면 동일 비중으로 대체
      const total = picked.reduce((sum, s) => sum + (baseWeights[s.t] || 0), 0);
      if (total > 0) {
        picked.forEach((s) => (weights[s.t] = (weights[s.t] || 0) + (baseWeights[s.t] || 0) / total));
      } else {
        const w = 1 / picked.length;
        picked.forEach((s) => (weights[s.t] = (weights[s.t] || 0) + w));
      }
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

  if (strategy === "riskParity") {
    const n = candidates.length;
    const retsByTicker = candidates.map((t) => {
      const rets = [];
      for (let k = 0; k < lookback; k++) {
        rets.push(closesByTicker[t][idx - k] / closesByTicker[t][idx - k - 1] - 1);
      }
      return rets;
    });
    const means = retsByTicker.map((rets) => mean(rets));
    const cov = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        let s = 0;
        for (let k = 0; k < lookback; k++) {
          s += (retsByTicker[i][k] - means[i]) * (retsByTicker[j][k] - means[j]);
        }
        cov[i][j] = s / lookback;
      }
    }
    const w = solveRiskParityWeights(cov);
    candidates.forEach((t, i) => (weights[t] = w[i]));
    return weights;
  }

  return null;
}

/* ---------- 포트폴리오 백테스트 (동적 배분: 매 리밸런싱마다 비중 재계산) ----------
   strategy: "momentum" | "trend" | "volTarget"
   params: { lookback: 기준 개월 수, topN: momentum 보유 자산 수, baseWeights: trend 기준비중(합 1) }
   candidates: 후보 자산 티커 배열, safeAsset: 신호가 부진할 때 대피할 자산(기본 BIL) */
function runDynamicBacktest(strategy, params, candidates, safeAsset, initialAmount, options = {}) {
  const {
    rebalanceMonths = 1,
    feeAnnualPct = 0,
    startDate = null,
    endDate = null,
    dcaMode = false,
    monthlyContribution = 0,
  } = options;
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

  const lookback = strategy === "seasonal" ? 0 : Math.max(1, params.lookback || 12);

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

  let currentTargets = computeDynamicWeights(strategy, params, candidates, closesByTicker, simStart, safeAsset, closeDates[simStart]);
  if (!currentTargets) return null;

  const monthlyFee = feeAnnualPct / 100 / 12;
  const holdings = {};
  allTickers.forEach((t) => (holdings[t] = (currentTargets[t] || 0) * initialAmount));

  const values = [initialAmount];
  const monthlyReturns = [];
  const simDates = [];

  for (let i = simStart; i < simEndExclusive; i++) {
    if (dcaMode) {
      allTickers.forEach((t) => {
        holdings[t] += (currentTargets[t] || 0) * monthlyContribution;
      });
    }
    const before = allTickers.reduce((sum, t) => sum + holdings[t], 0);
    allTickers.forEach((t) => {
      holdings[t] = holdings[t] * (1 + (returnsByTicker[t][i] || 0)) * (1 - monthlyFee);
    });
    const after = allTickers.reduce((sum, t) => sum + holdings[t], 0);
    monthlyReturns.push(before > 0 ? after / before - 1 : 0);
    values.push(after);
    simDates.push(returnDates[i]);

    const stepCount = i - simStart + 1;
    if (rebalanceMonths > 0 && stepCount % rebalanceMonths === 0 && i + 1 < simEndExclusive) {
      const nextTargets = computeDynamicWeights(strategy, params, candidates, closesByTicker, i + 1, safeAsset, closeDates[i + 1]);
      if (nextTargets) {
        currentTargets = nextTargets;
        allTickers.forEach((t) => (holdings[t] = (currentTargets[t] || 0) * after));
      }
    }
  }

  const result = computeBacktestMetrics(simDates, values, monthlyReturns, initialAmount, { dcaMode, monthlyContribution });
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

function formatKrw(x) {
  return `${Math.round(x).toLocaleString("ko-KR")}원`;
}

function formatAssetPrice(ticker, x) {
  if (INDEX_POINT_ASSETS.has(ticker)) return formatIndexPoint(x);
  if (KRW_ASSETS.has(ticker)) return formatKrw(x);
  return formatUsd(x);
}

function formatManwon(n) {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 10000) {
    return `${sign}${(abs / 10000).toFixed(2)}억원`;
  }
  return `${sign}${Math.round(abs).toLocaleString("ko-KR")}만원`;
}
