/* ---------- 개별종목 팩터 백테스트 엔진 ----------
   FACTOR_DATA(data/factor-data.js)의 종목별 분기 재무데이터(filed=실제 공시일 포함)와
   월봉 주가를 이용해, 임의 시점(asOfDate) 기준으로 "그 시점에 실제로 알 수 있었던"
   재무 수치만 골라 팩터를 계산한다. filed <= asOfDate 조건으로 미래 정보가 과거로
   새어들어가는 룩어헤드 편향을 막는 것이 핵심이다. */

/* ---------- 팩터별 표시 단위 ----------
   팩터마다 자연스러운 단위가 달라서(예: PER은 "배", ROE는 "%", 이격도는 "이동평균=100 기준 %",
   RSI는 원래부터 0~100) 전부 0~100 백분위 하나로 뭉뚱그리지 않고, 팩터별로 실제 값 그대로
   최소~최대 구간을 입력받는다. unit에 따라 저장된 raw factor 값 <-> 화면에 보여줄/입력받을
   값을 서로 변환한다.
   - pct: raw는 소수(0.15) 저장, 화면은 %(15)
   - multiple: raw 그대로 "배" 단위로 표시 (예: PER 15.2)
   - disparity: raw는 이동평균 대비 소수 오프셋(0.1 = +10%), 화면은 이동평균=100 기준 %(110)
   - rsi: raw가 이미 0~100
   - raw: 변환 없음 (Altman Z-score, 베타) */
const FACTOR_META = {
  marketCap: { unit: "currency", min: 0, max: 5000000, suffix: "백만$" },
  per: { unit: "multiple", min: 0, max: 50, suffix: "배" },
  pbr: { unit: "multiple", min: 0, max: 10, suffix: "배" },
  psr: { unit: "multiple", min: 0, max: 20, suffix: "배" },
  evSales: { unit: "multiple", min: 0, max: 20, suffix: "배" },
  evEbit: { unit: "multiple", min: 0, max: 50, suffix: "배" },
  por: { unit: "multiple", min: 0, max: 50, suffix: "배" },
  pgpr: { unit: "multiple", min: 0, max: 30, suffix: "배" },
  evGp: { unit: "multiple", min: 0, max: 30, suffix: "배" },
  peg: { unit: "multiple", min: 0, max: 5, suffix: "배" },
  ncavToPrice: { unit: "pct", min: -100, max: 100, suffix: "%" },
  roe: { unit: "pct", min: -30, max: 50, suffix: "%" },
  roa: { unit: "pct", min: -20, max: 30, suffix: "%" },
  gpa: { unit: "pct", min: 0, max: 60, suffix: "%" },
  roic: { unit: "pct", min: -20, max: 50, suffix: "%" },
  rocE: { unit: "pct", min: -20, max: 50, suffix: "%" },
  gpe: { unit: "pct", min: -50, max: 200, suffix: "%" },
  gpm: { unit: "pct", min: 0, max: 90, suffix: "%" },
  opm: { unit: "pct", min: -30, max: 50, suffix: "%" },
  npm: { unit: "pct", min: -30, max: 40, suffix: "%" },
  rndToSales: { unit: "pct", min: 0, max: 40, suffix: "%" },
  debtToEquity: { unit: "pct", min: 0, max: 300, suffix: "%" },
  debtToAssets: { unit: "pct", min: 0, max: 100, suffix: "%" },
  currentRatio: { unit: "multiple", min: 0, max: 5, suffix: "배" },
  assetTurnover: { unit: "multiple", min: 0, max: 3, suffix: "배" },
  opIncomeToDebt: { unit: "pct", min: -50, max: 200, suffix: "%" },
  retentionRatio: { unit: "pct", min: -200, max: 500, suffix: "%" },
  revenueGrowthYoY: { unit: "pct", min: -30, max: 50, suffix: "%" },
  netIncomeGrowthYoY: { unit: "pct", min: -50, max: 100, suffix: "%" },
  grossProfitGrowthYoY: { unit: "pct", min: -30, max: 50, suffix: "%" },
  opIncomeGrowthYoY: { unit: "pct", min: -50, max: 100, suffix: "%" },
  assetGrowthYoY: { unit: "pct", min: -20, max: 50, suffix: "%" },
  equityGrowthYoY: { unit: "pct", min: -20, max: 50, suffix: "%" },
  cashGrowthYoY: { unit: "pct", min: -50, max: 100, suffix: "%" },
  debtGrowthYoY: { unit: "pct", min: -50, max: 100, suffix: "%" },
  rndGrowthYoY: { unit: "pct", min: -30, max: 50, suffix: "%" },
  momentum1m: { unit: "pct", min: -20, max: 20, suffix: "%" },
  momentum3m: { unit: "pct", min: -30, max: 30, suffix: "%" },
  momentum6m: { unit: "pct", min: -40, max: 40, suffix: "%" },
  momentum12m: { unit: "pct", min: -50, max: 60, suffix: "%" },
  maDisparity3m: { unit: "disparity", min: 80, max: 120, suffix: "%" },
  maDisparity6m: { unit: "disparity", min: 70, max: 130, suffix: "%" },
  maDisparity12m: { unit: "disparity", min: 60, max: 140, suffix: "%" },
  goldenCross: { unit: "disparity", min: 80, max: 120, suffix: "%" },
  rsi6: { unit: "rsi", min: 0, max: 100, suffix: "" },
  rsi12: { unit: "rsi", min: 0, max: 100, suffix: "" },
  beta: { unit: "raw", min: 0, max: 2.5, suffix: "" },
  altmanZ: { unit: "raw", min: -2, max: 8, suffix: "" },
};

function factorRawToDisplay(key, raw) {
  if (raw === null || raw === undefined) return null;
  const unit = (FACTOR_META[key] || {}).unit || "raw";
  if (unit === "pct") return raw * 100;
  if (unit === "disparity") return (1 + raw) * 100;
  if (unit === "currency") return raw / 1e6;
  return raw;
}

function factorDisplayToRaw(key, display) {
  const unit = (FACTOR_META[key] || {}).unit || "raw";
  if (unit === "pct") return display / 100;
  if (unit === "disparity") return display / 100 - 1;
  if (unit === "currency") return display * 1e6;
  return display;
}

/* ---------- 시점별 재무 스냅샷 ---------- */

/* 잔액(대차대조표) 항목: asOfDate 이전에 공시된 것 중 가장 최근 값 */
function instantAsOf(quarters, field, asOfDate) {
  let best = null;
  for (const q of quarters) {
    if (q[field] === undefined || q[field] === null) continue;
    if (q.filed > asOfDate) continue;
    if (!best || q.end > best.end) best = q;
  }
  return best ? best[field] : null;
}

/* 유량(손익) 항목의 TTM(최근 4분기 합): asOfDate 이전에 공시된 분기 중 최근 4개 합산.
   분기가 4개 미만이면 null(TTM 계산 불가로 취급) */
function ttmAsOf(quarters, field, asOfDate) {
  const points = quarters
    .filter((q) => q[field] !== undefined && q[field] !== null && q.filed <= asOfDate)
    .sort((a, b) => (a.end < b.end ? -1 : 1));
  if (points.length < 4) return null;
  const last4 = points.slice(-4);
  return last4.reduce((sum, q) => sum + q[field], 0);
}

/* asOfDate 이전 마지막 월봉 종가 */
function priceAsOf(prices, asOfDate) {
  let best = null;
  for (const p of prices) {
    if (p.d > asOfDate) continue;
    if (!best || p.d > best.d) best = p;
  }
  return best ? best.c : null;
}

function shiftDate(dateStr, months) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/* asOfDate 이전(포함) 월봉 종가를 오래된 순으로 최대 n개 */
function lastNPrices(prices, asOfDate, n) {
  const past = prices.filter((p) => p.d <= asOfDate).sort((a, b) => (a.d < b.d ? -1 : 1));
  return past.slice(-n);
}

/* N개월 이동평균 대비 현재가 이격도: (현재가 / 이동평균 - 1) */
function maDisparity(prices, asOfDate, months) {
  const pts = lastNPrices(prices, asOfDate, months);
  if (pts.length < months) return null;
  const avg = pts.reduce((sum, p) => sum + p.c, 0) / pts.length;
  const price = priceAsOf(prices, asOfDate);
  if (price === null || avg === 0) return null;
  return price / avg - 1;
}

/* 월간 수익률 기준 RSI(period): period+1개월치 종가가 있어야 period개의 월간 등락을 계산할 수 있음 */
function rsiAsOf(prices, asOfDate, period) {
  const pts = lastNPrices(prices, asOfDate, period + 1);
  if (pts.length < period + 1) return null;
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i < pts.length; i++) {
    const change = pts[i].c - pts[i - 1].c;
    if (change > 0) gainSum += change;
    else lossSum += -change;
  }
  const avgGain = gainSum / period;
  const avgLoss = lossSum / period;
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/* 시장(S&P500, asset-data.js의 SPY 월봉 시리즈 재사용) 대비 베타: 최근 24개월 수익률로 계산 */
function betaAsOf(prices, asOfDate, months = 24) {
  if (typeof ASSET_DATA === "undefined" || !ASSET_DATA.assets.SPY) return null;
  const spySeries = ASSET_DATA.assets.SPY.series; // [{ d: "yyyy-MM", c }]
  const stockPts = lastNPrices(prices, asOfDate, months + 1);
  if (stockPts.length < months + 1) return null;

  const spyByMonth = new Map(spySeries.map((p) => [p.d, p.c]));
  const stockReturns = [];
  const spyReturns = [];
  for (let i = 1; i < stockPts.length; i++) {
    const monthKey = stockPts[i].d.slice(0, 7);
    const prevMonthKey = stockPts[i - 1].d.slice(0, 7);
    const spyNow = spyByMonth.get(monthKey);
    const spyPrev = spyByMonth.get(prevMonthKey);
    if (spyNow === undefined || spyPrev === undefined || spyPrev === 0 || stockPts[i - 1].c === 0) continue;
    stockReturns.push(stockPts[i].c / stockPts[i - 1].c - 1);
    spyReturns.push(spyNow / spyPrev - 1);
  }
  if (stockReturns.length < 6) return null;

  const meanStock = stockReturns.reduce((a, b) => a + b, 0) / stockReturns.length;
  const meanSpy = spyReturns.reduce((a, b) => a + b, 0) / spyReturns.length;
  let cov = 0;
  let varSpy = 0;
  for (let i = 0; i < stockReturns.length; i++) {
    cov += (stockReturns[i] - meanStock) * (spyReturns[i] - meanSpy);
    varSpy += (spyReturns[i] - meanSpy) * (spyReturns[i] - meanSpy);
  }
  return varSpy > 0 ? cov / varSpy : null;
}

/* ---------- 종목 하나의 asOfDate 시점 팩터 스냅샷 ---------- */
function stockFactorSnapshot(ticker, stock, asOfDate) {
  const q = stock.quarters;
  const price = priceAsOf(stock.prices, asOfDate);
  const shares = instantAsOf(q, "shares", asOfDate);
  const equity = instantAsOf(q, "equity", asOfDate);
  const assets = instantAsOf(q, "assets", asOfDate);
  const liabilities = instantAsOf(q, "liabilities", asOfDate);
  const assetsCur = instantAsOf(q, "assetsCur", asOfDate);
  const liabCur = instantAsOf(q, "liabCur", asOfDate);
  const cash = instantAsOf(q, "cash", asOfDate);
  const retainedEarnings = instantAsOf(q, "retainedEarnings", asOfDate);
  const longTermDebt = instantAsOf(q, "longTermDebt", asOfDate);

  const revenueTTM = ttmAsOf(q, "revenue", asOfDate);
  const netIncomeTTM = ttmAsOf(q, "netIncome", asOfDate);
  const grossProfitTTM = ttmAsOf(q, "grossProfit", asOfDate);
  const opIncomeTTM = ttmAsOf(q, "opIncome", asOfDate);
  const rndTTM = ttmAsOf(q, "rnd", asOfDate);

  const revenueTTM1yAgo = ttmAsOf(q, "revenue", shiftDate(asOfDate, -12));
  const netIncomeTTM1yAgo = ttmAsOf(q, "netIncome", shiftDate(asOfDate, -12));
  const grossProfitTTM1yAgo = ttmAsOf(q, "grossProfit", shiftDate(asOfDate, -12));
  const opIncomeTTM1yAgo = ttmAsOf(q, "opIncome", shiftDate(asOfDate, -12));
  const rndTTM1yAgo = ttmAsOf(q, "rnd", shiftDate(asOfDate, -12));
  const assets1yAgo = instantAsOf(q, "assets", shiftDate(asOfDate, -12));
  const equity1yAgo = instantAsOf(q, "equity", shiftDate(asOfDate, -12));
  const cash1yAgo = instantAsOf(q, "cash", shiftDate(asOfDate, -12));
  const longTermDebt1yAgo = instantAsOf(q, "longTermDebt", shiftDate(asOfDate, -12));

  const marketCap = price !== null && shares ? price * shares : null;
  const ev = marketCap !== null ? marketCap + (longTermDebt || 0) - (cash || 0) : null;
  const investedCapital = equity !== null && longTermDebt !== null && cash !== null ? equity + longTermDebt - cash : null;

  const factors = {
    marketCap,
    netIncomeTTM,
    per: marketCap !== null && netIncomeTTM > 0 ? marketCap / netIncomeTTM : null,
    pbr: marketCap !== null && equity > 0 ? marketCap / equity : null,
    psr: marketCap !== null && revenueTTM > 0 ? marketCap / revenueTTM : null,
    evSales: ev !== null && revenueTTM > 0 ? ev / revenueTTM : null,
    evEbit: ev !== null && opIncomeTTM > 0 ? ev / opIncomeTTM : null,
    roe: netIncomeTTM !== null && equity > 0 ? netIncomeTTM / equity : null,
    roa: netIncomeTTM !== null && assets > 0 ? netIncomeTTM / assets : null,
    gpa: grossProfitTTM !== null && assets > 0 ? grossProfitTTM / assets : null,
    debtToEquity: longTermDebt !== null && equity > 0 ? longTermDebt / equity : null,
    currentRatio: assetsCur !== null && liabCur > 0 ? assetsCur / liabCur : null,
    rndToSales: rndTTM !== null && revenueTTM > 0 ? rndTTM / revenueTTM : null,
    revenueGrowthYoY: revenueTTM !== null && revenueTTM1yAgo > 0 ? revenueTTM / revenueTTM1yAgo - 1 : null,
    netIncomeGrowthYoY: netIncomeTTM !== null && netIncomeTTM1yAgo && netIncomeTTM1yAgo !== 0 ? netIncomeTTM / netIncomeTTM1yAgo - 1 : null,
    assetGrowthYoY: assets !== null && assets1yAgo > 0 ? assets / assets1yAgo - 1 : null,
    momentum1m: momentumAsOf(stock.prices, asOfDate, 1),
    momentum3m: momentumAsOf(stock.prices, asOfDate, 3),
    momentum6m: momentumAsOf(stock.prices, asOfDate, 6),
    momentum12m: momentumAsOf(stock.prices, asOfDate, 12),
    maDisparity3m: maDisparity(stock.prices, asOfDate, 3),
    maDisparity6m: maDisparity(stock.prices, asOfDate, 6),
    maDisparity12m: maDisparity(stock.prices, asOfDate, 12),
    goldenCross: (() => {
      const short = maDisparity(stock.prices, asOfDate, 3);
      const long = maDisparity(stock.prices, asOfDate, 12);
      const pShort = priceAsOf(stock.prices, asOfDate);
      if (short === null || long === null || pShort === null) return null;
      const ma3 = pShort / (1 + short);
      const ma12 = pShort / (1 + long);
      return ma12 !== 0 ? ma3 / ma12 - 1 : null;
    })(),
    rsi6: rsiAsOf(stock.prices, asOfDate, 6),
    rsi12: rsiAsOf(stock.prices, asOfDate, 12),
    beta: betaAsOf(stock.prices, asOfDate),

    /* 가치 팩터 추가분 */
    por: marketCap !== null && opIncomeTTM > 0 ? marketCap / opIncomeTTM : null,
    pgpr: marketCap !== null && grossProfitTTM > 0 ? marketCap / grossProfitTTM : null,
    evGp: ev !== null && grossProfitTTM > 0 ? ev / grossProfitTTM : null,
    ncavToPrice: marketCap !== null && marketCap > 0 && assetsCur !== null && liabilities !== null
      ? (assetsCur - liabilities) / marketCap
      : null,
    peg: null, // 아래에서 성장률 계산 후 채움

    /* 퀄리티 팩터 추가분 */
    roic: opIncomeTTM !== null && investedCapital > 0 ? opIncomeTTM / investedCapital : null,
    rocE: opIncomeTTM !== null && assets !== null && liabCur !== null && (assets - liabCur) > 0 ? opIncomeTTM / (assets - liabCur) : null,
    gpe: grossProfitTTM !== null && equity > 0 ? grossProfitTTM / equity : null,
    gpm: grossProfitTTM !== null && revenueTTM > 0 ? grossProfitTTM / revenueTTM : null,
    opm: opIncomeTTM !== null && revenueTTM > 0 ? opIncomeTTM / revenueTTM : null,
    npm: netIncomeTTM !== null && revenueTTM > 0 ? netIncomeTTM / revenueTTM : null,
    assetTurnover: revenueTTM !== null && assets > 0 ? revenueTTM / assets : null,
    opIncomeToDebt: opIncomeTTM !== null && longTermDebt > 0 ? opIncomeTTM / longTermDebt : null,
    debtToAssets: longTermDebt !== null && assets > 0 ? longTermDebt / assets : null,
    retentionRatio: retainedEarnings !== null && equity > 0 ? retainedEarnings / equity : null,

    /* 성장성 팩터 추가분 (YoY) */
    grossProfitGrowthYoY: grossProfitTTM !== null && grossProfitTTM1yAgo && grossProfitTTM1yAgo > 0 ? grossProfitTTM / grossProfitTTM1yAgo - 1 : null,
    opIncomeGrowthYoY: opIncomeTTM !== null && opIncomeTTM1yAgo && opIncomeTTM1yAgo > 0 ? opIncomeTTM / opIncomeTTM1yAgo - 1 : null,
    equityGrowthYoY: equity !== null && equity1yAgo > 0 ? equity / equity1yAgo - 1 : null,
    cashGrowthYoY: cash !== null && cash1yAgo > 0 ? cash / cash1yAgo - 1 : null,
    debtGrowthYoY: longTermDebt !== null && longTermDebt1yAgo > 0 ? longTermDebt / longTermDebt1yAgo - 1 : null,
    rndGrowthYoY: rndTTM !== null && rndTTM1yAgo && rndTTM1yAgo > 0 ? rndTTM / rndTTM1yAgo - 1 : null,
  };

  if (factors.per !== null && factors.netIncomeGrowthYoY !== null && factors.netIncomeGrowthYoY > 0) {
    factors.peg = factors.per / (factors.netIncomeGrowthYoY * 100);
  }

  if (assets > 0 && liabilities > 0 && marketCap !== null && revenueTTM !== null) {
    const workingCapital = assetsCur !== null && liabCur !== null ? assetsCur - liabCur : null;
    if (workingCapital !== null && retainedEarnings !== null && opIncomeTTM !== null) {
      factors.altmanZ =
        1.2 * (workingCapital / assets) +
        1.4 * (retainedEarnings / assets) +
        3.3 * (opIncomeTTM / assets) +
        0.6 * (marketCap / liabilities) +
        1.0 * (revenueTTM / assets);
    }
  }

  return factors;
}

function momentumAsOf(prices, asOfDate, months) {
  const now = priceAsOf(prices, asOfDate);
  const past = priceAsOf(prices, shiftDate(asOfDate, -months));
  if (now === null || past === null || past === 0) return null;
  return now / past - 1;
}

/* 낮을수록 좋은 팩터(가치·리스크 지표)는 "하위 = 상위 점수"가 되도록 순위를 뒤집는다 */
const LOWER_IS_BETTER = new Set([
  "per", "pbr", "psr", "evSales", "evEbit", "debtToEquity",
  "por", "pgpr", "evGp", "peg", "debtToAssets", "debtGrowthYoY",
]);

/* ---------- 팩터 조합 랭킹 ----------
   factorConfigs: [{ key, min, max }] - min/max는 그 팩터의 "실제 단위" 값(예: PER 5~20배,
   이격도 90~110%, ROE 10% 이상 등 FACTOR_META 기준 표시 단위). 각 팩터마다 실제 값이 그
   구간 안에 드는 종목만 남기고(모든 선택 팩터를 동시 만족해야 함), 살아남은 종목들 사이에서만
   백분위를 다시 매겨 평균(종합 점수)으로 정렬한다 — 필터링은 절대값 기준, 정렬은 상대 순위 기준. */
function rankByFactors(snapshots, factorConfigs) {
  const passed = snapshots.filter((s) => {
    return factorConfigs.every(({ key, min, max }) => {
      const raw = s.factors[key];
      if (!Number.isFinite(raw)) return false;
      const display = factorRawToDisplay(key, raw);
      return display >= min && display <= max;
    });
  });

  const percentiles = {};
  factorConfigs.forEach(({ key }) => {
    const sorted = [...passed].sort((a, b) => a.factors[key] - b.factors[key]);
    const n = sorted.length;
    sorted.forEach((s, i) => {
      const pct = n > 1 ? (i / (n - 1)) * 100 : 50;
      const score = LOWER_IS_BETTER.has(key) ? 100 - pct : pct;
      percentiles[s.ticker] = percentiles[s.ticker] || {};
      percentiles[s.ticker][key] = score;
    });
  });

  return passed
    .map((s) => {
      const p = percentiles[s.ticker];
      const scores = factorConfigs.map(({ key }) => p[key]);
      const composite = scores.reduce((a, b) => a + b, 0) / scores.length;
      return { ...s, composite };
    })
    .sort((a, b) => b.composite - a.composite);
}

/* ---------- 유니버스 필터: 업종/기업형태 휴리스틱 ---------- */
function isFinancialStock(stock) {
  return !!(stock.ownerOrg && stock.ownerOrg.indexOf("Finance") >= 0);
}

function isHoldingCompany(stock) {
  if (stock.sic === "6719") return true;
  const name = stock.name || "";
  return /\bHolding(s)?\b/i.test(name);
}

/* PTP(Publicly Traded Partnership, 상장 파트너십)는 SEC 구조화 필드로 못 구해서 사명 패턴으로 근사 */
function isLikelyPTP(stock) {
  const name = stock.name || "";
  return /\bL\.?P\.?$/i.test(name.trim()) || /\bPartners\b/i.test(name);
}

function isChineseCompany(stock) {
  if (!stock.isForeign) return false;
  const country = (stock.country || "").toLowerCase();
  return country.indexOf("china") >= 0;
}

/* 관리종목처럼 정확한 국내 법적 분류는 없어, 부실위험 신호인 Altman Z-score가 위험 구간(<1.8)에
   들어온 종목을 근사치로 제외한다. 시점마다 값이 바뀌므로 유니버스 단계가 아니라 리밸런싱마다 확인 */
function isDistressZone(factors) {
  return factors.altmanZ !== undefined && factors.altmanZ !== null && factors.altmanZ < 1.8;
}

/* asOfDate 이전 공시된 가장 최근 "한 분기"만의 순이익 (TTM 합산이 아님) */
function lastQuarterNetIncomeAsOf(quarters, asOfDate) {
  const points = quarters
    .filter((q) => q.netIncome !== undefined && q.netIncome !== null && q.filed <= asOfDate)
    .sort((a, b) => (a.end < b.end ? -1 : 1));
  return points.length > 0 ? points[points.length - 1].netIncome : null;
}

/* ---------- 팩터 전략 백테스트: 주기적으로 팩터 상위 N종목을 동일비중으로 담고 리밸런싱 ---------- */
function runFactorBacktest(options) {
  const {
    universe,           // ticker 배열
    factorConfigs,       // [{ key, minPct, maxPct }]
    topN = 20,
    rebalanceMonths = 3,
    startDate,
    endDate,
    initialAmount = 10000000,
    txFeePct = 0,
    minMarketCap = 0,
    excludeLossTTM = false,         // 적자기업 제외 (년간/TTM 순이익 기준)
    excludeLossLastQuarter = false, // 적자기업 제외 (최근 분기 순이익 기준)
    excludeDistressZone = false,    // 관리종목 제외 근사치 (Altman Z-score 부실위험 구간)
    excludeOwnerOrgs = null,        // 제외할 ownerOrg(업종 대분류) 집합 (Set)
    excludeFinancials = false,
    excludeHoldingCompanies = false,
    excludePTP = false,
    excludeChinese = false,
    smallCapBottomPct = 0,          // 시가총액 하위 N% 제외 (0~100)
  } = options;

  const txFeeRate = txFeePct / 100;
  const tickers = universe.filter((t) => {
    const stock = FACTOR_DATA.stocks[t];
    if (!stock) return false;
    if (excludeOwnerOrgs && excludeOwnerOrgs.has(stock.ownerOrg)) return false;
    if (excludeFinancials && isFinancialStock(stock)) return false;
    if (excludeHoldingCompanies && isHoldingCompany(stock)) return false;
    if (excludePTP && isLikelyPTP(stock)) return false;
    if (excludeChinese && isChineseCompany(stock)) return false;
    return true;
  });

  const rebalanceDates = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    rebalanceDates.push(cursor);
    cursor = shiftDate(cursor, rebalanceMonths);
  }
  if (rebalanceDates[rebalanceDates.length - 1] < endDate) rebalanceDates.push(endDate);

  let value = initialAmount;
  let holdings = {}; // ticker -> weight
  const values = [{ date: rebalanceDates[0], value }];
  const monthlyReturns = [];
  const selections = [];
  let totalTxCost = 0;

  for (let i = 0; i < rebalanceDates.length - 1; i++) {
    const asOf = rebalanceDates[i];
    const nextDate = rebalanceDates[i + 1];

    let snapshots = tickers
      .map((ticker) => ({ ticker, factors: stockFactorSnapshot(ticker, FACTOR_DATA.stocks[ticker], asOf) }))
      .filter((s) => {
        if (minMarketCap > 0 && (!s.factors.marketCap || s.factors.marketCap < minMarketCap)) return false;
        if (excludeLossTTM && s.factors.netIncomeTTM !== null && s.factors.netIncomeTTM <= 0) return false;
        if (excludeLossLastQuarter) {
          const lastQ = lastQuarterNetIncomeAsOf(FACTOR_DATA.stocks[s.ticker].quarters, asOf);
          if (lastQ !== null && lastQ <= 0) return false;
        }
        if (excludeDistressZone && isDistressZone(s.factors)) return false;
        return true;
      });

    if (smallCapBottomPct > 0) {
      const capSorted = snapshots.filter((s) => Number.isFinite(s.factors.marketCap)).sort((a, b) => a.factors.marketCap - b.factors.marketCap);
      const cutIndex = Math.floor((capSorted.length * smallCapBottomPct) / 100);
      const excluded = new Set(capSorted.slice(0, cutIndex).map((s) => s.ticker));
      snapshots = snapshots.filter((s) => !excluded.has(s.ticker));
    }

    const ranked = rankByFactors(snapshots, factorConfigs).slice(0, topN);
    selections.push({ date: asOf, picks: ranked.map((r) => ({ ticker: r.ticker, composite: r.composite })) });

    if (ranked.length === 0) {
      values.push({ date: nextDate, value });
      continue;
    }

    const newWeight = 1 / ranked.length;
    const newHoldings = {};
    ranked.forEach((r) => { newHoldings[r.ticker] = newWeight; });

    const allTickers = new Set([...Object.keys(holdings), ...Object.keys(newHoldings)]);
    let sumAbsDelta = 0;
    allTickers.forEach((t) => { sumAbsDelta += Math.abs((newHoldings[t] || 0) - (holdings[t] || 0)); });
    const txCost = sumAbsDelta * value * txFeeRate;
    totalTxCost += txCost;
    value -= txCost;

    holdings = newHoldings;

    let periodGrowth = 0;
    let weightSum = 0;
    Object.entries(holdings).forEach(([ticker, w]) => {
      const stock = FACTOR_DATA.stocks[ticker];
      const p0 = priceAsOf(stock.prices, asOf);
      const p1 = priceAsOf(stock.prices, nextDate);
      if (p0 && p1) {
        periodGrowth += w * (p1 / p0);
        weightSum += w;
      }
    });
    const factor = weightSum > 0 ? periodGrowth / weightSum : 1;
    value = value * factor;
    monthlyReturns.push(factor - 1);
    values.push({ date: nextDate, value });
  }

  // 차트/표에서 쓰기 편하도록 {date,value}[] 외에 dates[]/평평한 숫자 values[]와 드로다운 시계열도 같이 낸다
  const dates = values.slice(1).map((v) => v.date);
  const valuesFlat = values.map((v) => v.value);
  let peak = valuesFlat[0];
  const drawdownSeries = values.map((v) => {
    if (v.value > peak) peak = v.value;
    return { date: v.date, dd: peak > 0 ? v.value / peak - 1 : 0 };
  });

  return {
    values, monthlyReturns, selections, totalTxCost, finalValue: value, initialAmount,
    dates, valuesFlat, drawdownSeries,
  };
}

/* ---------- 백테스트 결과 요약 지표 ---------- */
function factorBacktestMetrics(bt) {
  const { values, monthlyReturns, initialAmount } = bt;
  const years = (new Date(values[values.length - 1].date) - new Date(values[0].date)) / (1000 * 60 * 60 * 24 * 365.25);
  const totalReturn = bt.finalValue / initialAmount - 1;
  const cagr = years > 0 ? Math.pow(bt.finalValue / initialAmount, 1 / years) - 1 : 0;

  let peak = values[0].value;
  let maxDD = 0;
  values.forEach((v) => {
    if (v.value > peak) peak = v.value;
    const dd = v.value / peak - 1;
    if (dd < maxDD) maxDD = dd;
  });

  const periodsPerYear = monthlyReturns.length > 0 ? monthlyReturns.length / years : 0;
  const mean = monthlyReturns.reduce((a, b) => a + b, 0) / (monthlyReturns.length || 1);
  const variance = monthlyReturns.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (monthlyReturns.length || 1);
  const vol = Math.sqrt(variance) * Math.sqrt(periodsPerYear || 1);
  const sharpe = vol > 0 ? (cagr - 0.02) / vol : null;

  const winRate = monthlyReturns.length > 0 ? monthlyReturns.filter((r) => r > 0).length / monthlyReturns.length : null;

  return { totalReturn, cagr, maxDD, vol, sharpe, winRate, years };
}
