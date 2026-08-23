# 자산군별 대표 ETF의 월봉 종가/수정종가와 USD/KRW 환율 데이터를 받아와 data/asset-data.js를 다시 굽는 스크립트
# 사용법: powershell -File scripts/update-data.ps1
# 출처: Yahoo Finance chart API (query1.finance.yahoo.com) - 브라우저 CORS는 막혀 있지만
#       서버 사이드(Invoke-WebRequest)에서는 정상 동작함을 확인. 이 스크립트를 주기적으로
#       재실행해 "자산 현황" 탭의 기준일을 갱신한다 (실시간 스트리밍이 아님).
# c = 종가(비조정), ac = 배당재투자 반영 수정종가(adjclose). 배당 재투자 토글에서 사용.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$outPath = Join-Path $root "data\asset-data.js"

# 자산군 => { 표시 이름, Yahoo Finance 조회 심볼, (선택) 이상치 판정 비율 범위 } 매핑
# 내부 키와 조회 심볼이 다른 경우 있음(지수, 레버리지 ETF 등). 레버리지/코인은 변동폭이 커서
# 이상치 판정 범위를 기본값보다 넓게 잡는다(minRatio/maxRatio).
$assets = [ordered]@{
  SPY      = @{ name = "미국주식 (S&P500)"; symbol = "SPY" }
  QQQ      = @{ name = "나스닥100 (QQQ)"; symbol = "QQQ" }
  SCHD     = @{ name = "미국 배당주 (SCHD)"; symbol = "SCHD" }
  SSO      = @{ name = "미국 S&P500 2배 레버리지 (SSO)"; symbol = "SSO"; minRatio = 0.4; maxRatio = 2.5 }
  SDS      = @{ name = "미국 S&P500 2배 인버스 (SDS)"; symbol = "SDS"; minRatio = 0.4; maxRatio = 2.5 }
  QLD      = @{ name = "미국 나스닥100 2배 레버리지 (QLD)"; symbol = "QLD"; minRatio = 0.4; maxRatio = 2.5 }
  QID      = @{ name = "미국 나스닥100 2배 인버스 (QID)"; symbol = "QID"; minRatio = 0.4; maxRatio = 2.5 }
  TQQQ     = @{ name = "미국 나스닥100 3배 레버리지 (TQQQ)"; symbol = "TQQQ"; minRatio = 0.3; maxRatio = 3.0 }
  SQQQ     = @{ name = "미국 나스닥100 3배 인버스 (SQQQ)"; symbol = "SQQQ"; minRatio = 0.3; maxRatio = 3.0 }
  IWM      = @{ name = "미국 중소형주 (러셀2000)"; symbol = "IWM" }
  KOSPI    = @{ name = "코스피"; symbol = "^KS11" }
  KOSDAQ   = @{ name = "코스닥"; symbol = "^KQ11" }
  KOSPI2X  = @{ name = "코스피200 2배 레버리지 (KODEX 레버리지)"; symbol = "122630.KS"; minRatio = 0.4; maxRatio = 2.5 }
  KOSPIINV = @{ name = "코스피200 2배 인버스 (KODEX 200선물인버스2X)"; symbol = "252670.KS"; minRatio = 0.4; maxRatio = 2.5 }
  KOSDAQ2X = @{ name = "코스닥150 2배 레버리지"; symbol = "233740.KS"; minRatio = 0.4; maxRatio = 2.5 }
  KOSDAQINV = @{ name = "코스닥150 인버스 (KODEX 코스닥150선물인버스)"; symbol = "251340.KS"; minRatio = 0.4; maxRatio = 2.5 }
  EFA      = @{ name = "선진국주식 (미국 제외, MSCI EAFE)"; symbol = "EFA" }
  VGK      = @{ name = "유럽주식 (FTSE Europe)"; symbol = "VGK" }
  EEM      = @{ name = "신흥국주식 (MSCI EM)"; symbol = "EEM" }
  MCHI     = @{ name = "중국주식 (MSCI China)"; symbol = "MCHI" }
  EWJ      = @{ name = "일본주식 (MSCI Japan)"; symbol = "EWJ" }
  KRBOND3Y  = @{ name = "한국 국고채 3년 (TIGER 국채3년)"; symbol = "114820.KS" }
  KRBOND10Y = @{ name = "한국 국고채 10년 (KODEX 국고채10년)"; symbol = "114260.KS" }
  KRBOND30Y = @{ name = "한국 국고채 30년 (KODEX 30년국고채액티브)"; symbol = "439870.KS" }
  SHY      = @{ name = "미국 단기국채 (1-3년)"; symbol = "SHY" }
  IEF      = @{ name = "미국 중기국채 (7-10년)"; symbol = "IEF" }
  TLT      = @{ name = "미국 장기국채 (20년+)"; symbol = "TLT" }
  TIP      = @{ name = "미국 물가연동채 (TIPS)"; symbol = "TIP" }
  AGG      = @{ name = "미국 종합채권 (AGG)"; symbol = "AGG" }
  HYG      = @{ name = "미국 하이일드 회사채"; symbol = "HYG" }
  LQD      = @{ name = "미국 투자등급 회사채 (LQD)"; symbol = "LQD" }
  GLD      = @{ name = "금"; symbol = "GLD" }
  SLV      = @{ name = "은"; symbol = "SLV" }
  DBC      = @{ name = "원자재"; symbol = "DBC" }
  USO      = @{ name = "원유"; symbol = "USO"; minRatio = 0.4; maxRatio = 2.5 }
  VNQ      = @{ name = "미국 리츠 (REITs)"; symbol = "VNQ" }
  BIL      = @{ name = "미국 초단기국채 (BIL)"; symbol = "BIL" }
  KRCASH   = @{ name = "현금 (KODEX KRW Cash)"; symbol = "153130.KS" }
  BTC      = @{ name = "비트코인"; symbol = "BTC-USD"; minRatio = 0.2; maxRatio = 4.0 }
  BITI     = @{ name = "비트코인 인버스 (BITI)"; symbol = "BITI"; minRatio = 0.15; maxRatio = 5.0 }
  ETH      = @{ name = "이더리움"; symbol = "ETH-USD"; minRatio = 0.2; maxRatio = 4.0 }
  ETHS     = @{ name = "이더리움 인버스 (SETH)"; symbol = "SETH"; minRatio = 0.15; maxRatio = 5.0 }
}

$headers = @{ "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }

function Get-MonthlySeries($symbol, $includeAdjClose, $minRatio = 0.5, $maxRatio = 2.0) {
  $encodedSymbol = [Uri]::EscapeDataString($symbol)
  $url = "https://query1.finance.yahoo.com/v8/finance/chart/$encodedSymbol`?range=max&interval=1mo&events=div%7Csplit"
  $resp = Invoke-WebRequest -Uri $url -Headers $headers -UseBasicParsing
  $json = $resp.Content | ConvertFrom-Json
  $chartResult = $json.chart.result[0]

  $timestamps = $chartResult.timestamp
  $closes = $chartResult.indicators.quote[0].close
  $adjCloses = if ($includeAdjClose -and $chartResult.indicators.adjclose) { $chartResult.indicators.adjclose[0].adjclose } else { $null }

  # Yahoo가 마지막에 당월 스냅샷 바를 중복으로 붙여주는 경우가 있어, 같은 월이 연속되면 최신 값으로 덮어쓴다.
  $series = New-Object System.Collections.Generic.List[object]
  for ($i = 0; $i -lt $timestamps.Count; $i++) {
    $close = $closes[$i]
    if ($null -eq $close) { continue }
    $date = [DateTimeOffset]::FromUnixTimeSeconds($timestamps[$i]).UtcDateTime.ToString("yyyy-MM")
    $point = [ordered]@{ d = $date; c = [math]::Round([double]$close, 4) }
    if ($null -ne $adjCloses -and $null -ne $adjCloses[$i]) {
      $point.ac = [math]::Round([double]$adjCloses[$i], 4)
    }
    if ($series.Count -gt 0 -and $series[$series.Count - 1].d -eq $date) {
      $series[$series.Count - 1] = $point
    } else {
      $series.Add($point)
    }
  }

  # Yahoo가 가끔 특정 월에 말도 안 되는 값(0에 가깝거나 100배 튀는 값)을 섞어 보내는 경우가 있어,
  # 직전 정상 포인트 대비 -50%~+100% 범위를 벗어나면 이상치로 보고 제외한다.
  $clean = New-Object System.Collections.Generic.List[object]
  foreach ($point in $series) {
    if ($clean.Count -eq 0) {
      $clean.Add($point)
      continue
    }
    $prev = $clean[$clean.Count - 1]
    $ratio = $point.c / $prev.c
    if ($ratio -lt $minRatio -or $ratio -gt $maxRatio) {
      Write-Host "  경고: $symbol $($point.d) 이상치로 제외 (직전 대비 비율 $([math]::Round($ratio, 3)))"
      continue
    }
    $clean.Add($point)
  }

  # 맨 첫 포인트는 비교할 직전 값이 없어 위 필터를 그냥 통과한다. 다음 포인트와 비교했을 때도
  # 범위를 벗어나면(레버리지/인버스 ETF의 초기 상장가 데이터 오류 등) 앞에서부터 제거한다.
  while ($clean.Count -ge 2) {
    $ratio = $clean[1].c / $clean[0].c
    if ($ratio -lt $minRatio -or $ratio -gt $maxRatio) {
      Write-Host "  경고: $symbol $($clean[0].d) 선두 이상치로 제외 (다음 포인트 대비 비율 $([math]::Round($ratio, 3)))"
      $clean.RemoveAt(0)
    } else {
      break
    }
  }

  return $clean
}

$result = [ordered]@{}
foreach ($ticker in $assets.Keys) {
  $meta = $assets[$ticker]
  Write-Host "다운로드 중: $ticker ($($meta.name))..."
  $minR = if ($meta.minRatio) { $meta.minRatio } else { 0.5 }
  $maxR = if ($meta.maxRatio) { $meta.maxRatio } else { 2.0 }
  $series = Get-MonthlySeries $meta.symbol $true $minR $maxR
  $result[$ticker] = [ordered]@{
    name   = $meta.name
    series = $series
  }
  Start-Sleep -Milliseconds 400
}

Write-Host "다운로드 중: USD/KRW 환율..."
$fxSeries = Get-MonthlySeries "KRW=X" $false

$data = [ordered]@{
  updatedAt = (Get-Date).ToString("yyyy-MM-dd")
  assets    = $result
  fx        = [ordered]@{ USDKRW = $fxSeries }
}

$json = $data | ConvertTo-Json -Compress -Depth 6
$out = "// 자산군별 대표 ETF 월봉 데이터 (출처: Yahoo Finance). scripts/update-data.ps1 로 갱신.`nconst ASSET_DATA = $json;`n"
[System.IO.File]::WriteAllText($outPath, $out, [System.Text.UTF8Encoding]::new($false))

Write-Host "완료: $($result.Keys.Count)개 자산, 기준일 $($data.updatedAt)"

