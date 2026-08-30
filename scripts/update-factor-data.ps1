# 미국 개별종목 팩터 백테스트용 데이터 수집 스크립트 (S&P500)
# 사용법: powershell -File scripts/update-factor-data.ps1 [-Limit N] [-StartIndex N]
# 출처:
#   - 재무제표: SEC EDGAR XBRL Frames API (data.sec.gov, 인증/키 불필요, 요청당 User-Agent 필수)
#   - 주가: Yahoo Finance chart API (query1.finance.yahoo.com, 기존 update-data.ps1과 동일 출처)
# 핵심: 각 재무 수치는 "공시일(filed)"을 함께 저장한다. 팩터 백테스트 시점 T의 재무데이터는
#       filed <= T인 것 중 가장 최근 것만 사용해야 미래 정보가 과거로 새어들어가는 룩어헤드
#       편향을 피할 수 있다. 정정공시로 값이 바뀐 경우도 "최초 공시된 값"을 유지한다
#       (나중에 밝혀진 정정치를 과거 시점에 미리 알았던 것처럼 쓰면 안 되므로).
# 안정성: 종목마다 결과를 data/factor-chunks/{티커}.json 에 즉시 개별 저장한다(하나의 거대한
#       배열을 메모리에 들고 있다가 막판에 통째로 저장하면, 중간에 멈추거나 죽었을 때 지금까지
#       모은 걸 전부 잃는다). 이미 청크 파일이 있는 티커는 건너뛰므로 다시 실행하면 자동으로
#       이어서 수집된다. 스크립트 마지막에 청크를 모아 data/factor-data.js로 합친다.

param(
  [int]$Limit = 0,       # 0이면 전체, 테스트 시 예: 10
  [int]$StartIndex = 0,
  [switch]$SkipMerge     # 수집만 하고 최종 병합은 나중에 별도로 하고 싶을 때
)

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
$outPath = Join-Path $root "data\factor-data.js"
$chunksDir = Join-Path $root "data\factor-chunks"
if (-not (Test-Path $chunksDir)) { New-Item -ItemType Directory -Path $chunksDir | Out-Null }

$secHeaders = @{ "User-Agent" = "quantus-personal-project contact@example.com" }
$yahooHeaders = @{ "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }

# us-gaap 개념 이름은 회사마다 다르게 쓰는 경우가 있어 대체 태그 목록을 순서대로 시도한다
$conceptMap = [ordered]@{
  revenue     = @("Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet", "RevenueFromContractWithCustomerIncludingAssessedTax")
  netIncome   = @("NetIncomeLoss", "ProfitLoss")
  grossProfit = @("GrossProfit")
  opIncome    = @("OperatingIncomeLoss")
  rnd         = @("ResearchAndDevelopmentExpense")
  equity      = @("StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest")
  assets      = @("Assets")
  liabilities = @("Liabilities")
  assetsCur   = @("AssetsCurrent")
  liabCur     = @("LiabilitiesCurrent")
  cash        = @("CashAndCashEquivalentsAtCarryingValue", "CashAndCashEquivalentsAtCarryingValueIncludingDiscontinuedOperations")
  retainedEarnings = @("RetainedEarningsAccumulatedDeficit")
  longTermDebt = @("LongTermDebtNoncurrent", "LongTermDebt")
  shares      = @("CommonStockSharesOutstanding")
}
$sharesDeiConcept = "EntityCommonStockSharesOutstanding"

# companyfacts는 회사별 커스텀 XBRL 태그에 대소문자만 다른 키(예: Segment/segment)가 섞여 있어
# ConvertFrom-Json(대소문자 구분 안 함)이 충돌로 죽는다. System.Web.Extensions의
# JavaScriptSerializer는 Dictionary 기반이라 대소문자를 구분해서 문제없이 파싱된다.
Add-Type -AssemblyName System.Web.Extensions
$serializer = New-Object System.Web.Script.Serialization.JavaScriptSerializer
$serializer.MaxJsonLength = [int]::MaxValue
$serializer.RecursionLimit = 2000

# 같은 회계기간(end)의 수치가 그 다음해 보고서에도 "전년 동기 비교값"으로 다시 등장하는데,
# 이건 filed만 훨씬 나중일 뿐 원본 최초 공시가 아니다. 그런 재등장을 진짜 최초 공시로 착각하지
# 않도록, filed가 end로부터 너무 오래(120일 초과) 지난 항목은 아예 후보에서 제외한다
# (10-Q 마감 45일, 10-K 마감 60~90일 기준으로 120일이면 정상 지연 제출까지 충분히 커버됨).
$maxFilingLagDays = 120

function Get-DurationFacts($usGaap, $names) {
  # 분기(약 80~100일) 단일 구간 값만 추출, end일자 기준으로 최초 공시(filed 가장 이른 것)만 채택
  foreach ($name in $names) {
    if (-not $usGaap.ContainsKey($name)) { continue }
    $unitsWrap = $usGaap[$name]['units']
    if (-not $unitsWrap.ContainsKey('USD')) { continue }
    $units = $unitsWrap['USD']
    $byEnd = @{}
    foreach ($u in $units) {
      if (-not $u.ContainsKey('start') -or -not $u.ContainsKey('end')) { continue }
      $days = ([datetime]$u['end'] - [datetime]$u['start']).Days
      if ($days -lt 80 -or $days -gt 100) { continue }
      $lag = ([datetime]$u['filed'] - [datetime]$u['end']).Days
      if ($lag -lt 0 -or $lag -gt $maxFilingLagDays) { continue }
      if (-not $byEnd.ContainsKey($u['end']) -or [datetime]$u['filed'] -lt [datetime]$byEnd[$u['end']]['filed']) {
        $byEnd[$u['end']] = $u
      }
    }
    if ($byEnd.Count -gt 0) { return $byEnd }
  }
  return @{}
}

function Get-InstantFacts($usGaap, $names) {
  foreach ($name in $names) {
    if (-not $usGaap.ContainsKey($name)) { continue }
    $unitsWrap = $usGaap[$name]['units']
    if (-not $unitsWrap.ContainsKey('USD')) { continue }
    $units = $unitsWrap['USD']
    $byEnd = @{}
    foreach ($u in $units) {
      if (-not $u.ContainsKey('end')) { continue }
      $lag = ([datetime]$u['filed'] - [datetime]$u['end']).Days
      if ($lag -lt 0 -or $lag -gt $maxFilingLagDays) { continue }
      if (-not $byEnd.ContainsKey($u['end']) -or [datetime]$u['filed'] -lt [datetime]$byEnd[$u['end']]['filed']) {
        $byEnd[$u['end']] = $u
      }
    }
    if ($byEnd.Count -gt 0) { return $byEnd }
  }
  return @{}
}

function Get-SharesFacts($dei) {
  if (-not $dei.ContainsKey($sharesDeiConcept)) { return @{} }
  $unitsWrap = $dei[$sharesDeiConcept]['units']
  if (-not $unitsWrap.ContainsKey('shares')) { return @{} }
  $units = $unitsWrap['shares']
  $byEnd = @{}
  foreach ($u in $units) {
    if (-not $u.ContainsKey('end')) { continue }
    $lag = ([datetime]$u['filed'] - [datetime]$u['end']).Days
    if ($lag -lt 0 -or $lag -gt $maxFilingLagDays) { continue }
    if (-not $byEnd.ContainsKey($u['end']) -or [datetime]$u['filed'] -lt [datetime]$byEnd[$u['end']]['filed']) {
      $byEnd[$u['end']] = $u
    }
  }
  return $byEnd
}

function Get-MonthlyPrices($symbol) {
  try {
    $url = "https://query1.finance.yahoo.com/v8/finance/chart/$([Uri]::EscapeDataString($symbol))?range=max&interval=1mo"
    $resp = Invoke-WebRequest -Uri $url -Headers $yahooHeaders -UseBasicParsing -TimeoutSec 20
    $json = $resp.Content | ConvertFrom-Json
    $r = $json.chart.result[0]
    $timestamps = $r.timestamp
    $closes = $r.indicators.quote[0].close
    $series = New-Object System.Collections.Generic.List[object]
    for ($i = 0; $i -lt $timestamps.Count; $i++) {
      if ($null -eq $closes[$i]) { continue }
      $date = [DateTimeOffset]::FromUnixTimeSeconds($timestamps[$i]).UtcDateTime.ToString("yyyy-MM-dd")
      $series.Add([ordered]@{ d = $date; c = [math]::Round([double]$closes[$i], 4) })
    }
    return $series
  } catch {
    return $null
  }
}

# ---------- 1. 미국 주요 거래소(Nasdaq/NYSE/CBOE) 상장 종목 전체 + CIK 매핑 ----------
# OTC(장외) 종목은 신뢰할 만한 XBRL 데이터가 거의 없어 제외한다. company_tickers_exchange.json은
# company_tickers.json과 달리 거래소 정보까지 포함하고, 티커 표기(예: BRK-B)도 더 정확하다.
Write-Host "미국 상장 종목 목록 조회 중..."
$tickerMapResp = Invoke-WebRequest -Uri "https://www.sec.gov/files/company_tickers_exchange.json" -Headers $secHeaders -UseBasicParsing -TimeoutSec 20
$tickerMapJson = $tickerMapResp.Content | ConvertFrom-Json
$usTickers = New-Object System.Collections.Generic.List[string]
$cikByTicker = @{}
foreach ($row in $tickerMapJson.data) {
  $cik = $row[0]; $ticker = $row[2]; $exchange = $row[3]
  if ($exchange -notin @("Nasdaq", "NYSE", "CBOE")) { continue }
  if ([string]::IsNullOrWhiteSpace($ticker)) { continue }
  $tickerUpper = $ticker.ToUpper()
  $usTickers.Add($tickerUpper)
  $cikByTicker[$tickerUpper] = "{0:D10}" -f [int]$cik
}
Write-Host "  Nasdaq/NYSE/CBOE 상장 $($usTickers.Count)개 확보"

if ($Limit -gt 0) {
  $usTickers = $usTickers | Select-Object -Skip $StartIndex -First $Limit
}

# ---------- 3. 종목별 재무 팩터 + 월봉 주가 수집 (종목마다 청크 파일로 즉시 저장) ----------
$i = 0
$skipped = 0
foreach ($ticker in $usTickers) {
  $i++
  $chunkPath = Join-Path $chunksDir "$ticker.json"
  if (Test-Path $chunkPath) { $skipped++; continue }
  if ($i % 10 -eq 0) { Write-Host "  진행: $i / $($usTickers.Count) (이번 실행 신규 $($i - $skipped)개, 기존 보유 $skipped 개)" }
  $cik = $cikByTicker[$ticker]
  if (-not $cik) {
    Write-Host "  경고: $ticker CIK 없음"
    continue
  }
  try {
    $resp = Invoke-WebRequest -Uri "https://data.sec.gov/api/xbrl/companyfacts/CIK$cik.json" -Headers $secHeaders -UseBasicParsing -TimeoutSec 20
    # JavaScriptSerializer는 매우 큰(오래 상장돼 XBRL 태그 이력이 방대한 회사) 응답에서 파싱이
    # 몇 분씩 걸리며 사실상 멈춘 것처럼 보일 수 있어, 너무 큰 응답은 아예 건너뛴다
    if ($resp.Content.Length -gt 6000000) {
      Write-Host "  경고: $ticker 응답이 너무 커서 건너뜀 ($([math]::Round($resp.Content.Length / 1e6, 1))MB)"
      continue
    }
    $parsed = $serializer.DeserializeObject($resp.Content)
    $facts = $parsed['facts']
    if (-not $facts.ContainsKey('us-gaap')) { Write-Host "  경고: $ticker us-gaap 데이터 없음"; continue }
    $usGaap = $facts['us-gaap']

    $durationKeys = @("revenue","netIncome","grossProfit","opIncome","rnd")
    $instantKeys = @("equity","assets","liabilities","assetsCur","liabCur","cash","retainedEarnings","longTermDebt")
    $extracted = [ordered]@{}
    foreach ($key in $durationKeys) { $extracted[$key] = Get-DurationFacts $usGaap $conceptMap[$key] }
    foreach ($key in $instantKeys) { $extracted[$key] = Get-InstantFacts $usGaap $conceptMap[$key] }
    $sharesFacts = if ($facts.ContainsKey('dei')) { Get-SharesFacts $facts['dei'] } else { @{} }

    # end 날짜 전체 합집합을 기준으로 분기별 레코드 구성
    $allEnds = New-Object System.Collections.Generic.HashSet[string]
    foreach ($key in $extracted.Keys) { foreach ($e in $extracted[$key].Keys) { [void]$allEnds.Add($e) } }
    foreach ($e in $sharesFacts.Keys) { [void]$allEnds.Add($e) }

    $quarters = New-Object System.Collections.Generic.List[object]
    foreach ($end in ($allEnds | Sort-Object)) {
      $rec = [ordered]@{ end = $end }
      $filedCandidates = @()
      foreach ($key in $extracted.Keys) {
        if ($extracted[$key].ContainsKey($end)) {
          $rec[$key] = [math]::Round([double]$extracted[$key][$end]['val'])
          $filedCandidates += [datetime]$extracted[$key][$end]['filed']
        }
      }
      if ($sharesFacts.ContainsKey($end)) {
        $rec["shares"] = [math]::Round([double]$sharesFacts[$end]['val'])
        $filedCandidates += [datetime]$sharesFacts[$end]['filed']
      }
      if ($filedCandidates.Count -eq 0) { continue }
      $rec["filed"] = ($filedCandidates | Sort-Object -Descending | Select-Object -First 1).ToString("yyyy-MM-dd")
      $quarters.Add($rec)
    }

    $prices = Get-MonthlyPrices $ticker

    if ($quarters.Count -eq 0 -or -not $prices -or $prices.Count -eq 0) {
      Write-Host "  경고: $ticker 데이터 부족 (quarters=$($quarters.Count))"
      continue
    }

    $stockRecord = [ordered]@{
      cik      = $cik
      quarters = $quarters
      prices   = $prices
    }
    # 이 티커만 담긴 작은 파일이라 대소문자 충돌 걱정 없이 표준 ConvertTo-Json으로 안전하게 저장
    $chunkJson = $stockRecord | ConvertTo-Json -Compress -Depth 6
    [System.IO.File]::WriteAllText($chunkPath, $chunkJson, [System.Text.UTF8Encoding]::new($false))
  } catch {
    Write-Host "  경고: $ticker 조회 실패 - $($_.Exception.Message)"
  }
  Start-Sleep -Milliseconds 150
}

Write-Host "수집 완료. 청크 파일 $((Get-ChildItem $chunksDir -Filter '*.json').Count)개"

if ($SkipMerge) { return }

# ---------- 4. 청크를 샤드 파일로 병합 ----------
# 종목이 수천 개라 하나의 파일로 합치면 GitHub 100MB 파일 제한을 넘고 브라우저도 버거워진다.
# 종목 500개씩 묶어 여러 개의 작은 shard 파일로 나눠 저장하고, 브라우저에서는 이 목록을 읽어
# 순차적으로 fetch해서 화면에 진행률을 보여주며 불러온다 (js/factor-loader.js가 담당).
Write-Host "청크를 샤드로 병합 중..."
$shardsDir = Join-Path $root "data\factor-shards"
if (Test-Path $shardsDir) { Remove-Item $shardsDir -Recurse -Force }
New-Item -ItemType Directory -Path $shardsDir | Out-Null

$chunkFiles = Get-ChildItem $chunksDir -Filter '*.json' | Sort-Object Name
$shardSize = 500
$shardCount = [math]::Ceiling($chunkFiles.Count / $shardSize)
$shardNames = New-Object System.Collections.Generic.List[string]

for ($s = 0; $s -lt $shardCount; $s++) {
  $shardName = "shard-{0:D3}.js" -f $s
  $shardFiles = $chunkFiles | Select-Object -Skip ($s * $shardSize) -First $shardSize
  $shardObj = [ordered]@{}
  foreach ($f in $shardFiles) {
    try {
      $shardObj[$f.BaseName] = Get-Content $f.FullName -Raw | ConvertFrom-Json
    } catch {
      Write-Host "  경고: 청크 $($f.Name) 파싱 실패 - $($_.Exception.Message)"
    }
  }
  $shardJson = $shardObj | ConvertTo-Json -Compress -Depth 8
  $shardLabel = "$s of $($shardCount - 1)"
  $shardOut = "// 개별종목 팩터 백테스트 데이터 샤드 ($shardLabel). scripts/update-factor-data.ps1 로 갱신.`nObject.assign(FACTOR_DATA.stocks, $shardJson);`n"
  [System.IO.File]::WriteAllText((Join-Path $shardsDir $shardName), $shardOut, [System.Text.UTF8Encoding]::new($false))
  $shardNames.Add($shardName)
  Write-Host "  $shardName : $($shardObj.Keys.Count)개 종목"
}

$totalStocks = ($chunkFiles | Measure-Object).Count
# ConvertTo-Json은 원소가 1개인 배열을 배열이 아니라 스칼라로 풀어버리는 함정이 있어(PS 5.1),
# 항상 배열이 되도록 직접 JSON 배열 문자열을 만든다
$shardNamesJson = "[" + (($shardNames | ForEach-Object { "`"$_`"" }) -join ",") + "]"
$indexOut = "// 샤드 목록 + 메타데이터. scripts/update-factor-data.ps1 로 갱신.`n" +
  "const FACTOR_DATA = { updatedAt: `"$((Get-Date).ToString('yyyy-MM-dd'))`", totalStocks: $totalStocks, stocks: {} };`n" +
  "const FACTOR_SHARD_FILES = $shardNamesJson;`n"
[System.IO.File]::WriteAllText((Join-Path $shardsDir "index.js"), $indexOut, [System.Text.UTF8Encoding]::new($false))

# 기존 단일 파일은 더 이상 안 쓰지만, 남아있으면 혼동을 주니 지운다
if (Test-Path $outPath) { Remove-Item $outPath -Force }

Write-Host "완료: 총 $totalStocks 개 종목, 샤드 $shardCount 개"
