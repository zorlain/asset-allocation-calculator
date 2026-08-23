/* ---------- 팩터 데이터 샤드 로더 ----------
   종목이 수천 개라 data/factor-shards/index.js(작음, 목록만) + shard-NNN.js(각각 최대 수십MB)
   여러 개로 나눠져 있다. index.js는 <script>로 미리 로드해두고(FACTOR_DATA.stocks={},
   FACTOR_SHARD_FILES 목록만 들어있음), 실제 종목 데이터가 필요한 시점에 이 로더로 나머지
   샤드를 순차적으로 fetch+실행해 FACTOR_DATA.stocks를 채운다. 한 번 로드하면 페이지를 새로
   불러오기 전까지 다시 받지 않는다. */

let _factorLoadPromise = null;

function loadFactorScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`샤드 로드 실패: ${src}`));
    document.head.appendChild(s);
  });
}

/* onProgress(loaded, total)를 매 샤드마다 호출한다 */
function loadAllFactorShards(onProgress) {
  if (_factorLoadPromise) return _factorLoadPromise;

  _factorLoadPromise = (async () => {
    if (typeof FACTOR_SHARD_FILES === "undefined" || FACTOR_SHARD_FILES.length === 0) {
      return;
    }
    const total = FACTOR_SHARD_FILES.length;
    for (let i = 0; i < total; i++) {
      await loadFactorScript(`data/factor-shards/${FACTOR_SHARD_FILES[i]}`);
      if (onProgress) onProgress(i + 1, total);
    }
  })();

  return _factorLoadPromise;
}

function factorShardsLoaded() {
  return _factorLoadPromise !== null;
}
