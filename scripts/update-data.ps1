# 자산군별 대표 ETF의 월봉 종가/수정종가와 USD/KRW 환율 데이터를 받아와 data/asset-data.js를 다시 굽는 스크립트
# 사용법: powershell -File scripts/update-data.ps1
# 출처: Yahoo Finance chart API (query1.finance.yahoo.com) - 브라우저 CORS는 막혀 있지만
#       서버 사이드(Invoke-WebRequest)에서는 정상 동작함을 확인. 이 스크립트를 주기적으로
#       재실행해 "자산 현황" 탭의 기준일을 갱신한다 (실시간 스트리밍이 아님).
# c = 종가(비조정), ac = 배당재투자 반영 수정종가(adjclose). 배당 재투자 토글에서 사용.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$outPath = Join-Path $root "data\asset-data.js"

# 자산군 => { 표시 이름, Yahoo Finance 조회 심볼 } 매핑 (내부 키와 조회 심볼이 다른 경우 있음: 지수 등)
$assets = [ordered]@{
  SPY    = @{ name = "미국주식 (S&P500)"; symbol = "SPY" }
  QQQ    = @{ name = "미국 기술주 (나스닥100)"; symbol = "QQQ" }
  SCHD   = @{ name = "미국 배당주 (SCHD)"; symbol = "SCHD" }
  KOSPI  = @{ name = "코스피"; symbol = "^KS11" }
  KOSDAQ = @{ name = "코스닥"; symbol = "^KQ11" }
  EEM    = @{ name = "신흥국주식 (MSCI EM)"; symbol = "EEM" }
  TLT    = @{ name = "미국 장기국채 (20년+)"; symbol = "TLT" }
  IEF    = @{ name = "미국 중기국채 (7-10년)"; symbol = "IEF" }
  GLD    = @{ name = "금"; symbol = "GLD" }
  DBC    = @{ name = "원자재"; symbol = "DBC" }
  VNQ    = @{ name = "미국 리츠 (REITs)"; symbol = "VNQ" }
  BIL    = @{ name = "현금성자산 (미국 단기국채)"; symbol = "BIL" }
}

$headers = @{ "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }

function Get-MonthlySeries($symbol, $includeAdjClose) {
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
    if ($ratio -lt 0.5 -or $ratio -gt 2.0) {
      Write-Host "  경고: $symbol $($point.d) 이상치로 제외 (직전 대비 비율 $([math]::Round($ratio, 3)))"
      continue
    }
    $clean.Add($point)
  }
  return $clean
}

$result = [ordered]@{}
foreach ($ticker in $assets.Keys) {
  $meta = $assets[$ticker]
  Write-Host "다운로드 중: $ticker ($($meta.name))..."
  $series = Get-MonthlySeries $meta.symbol $true
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

