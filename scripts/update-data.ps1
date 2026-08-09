# 자산군별 대표 ETF의 월봉 종가 데이터를 받아와 data/asset-data.js를 다시 굽는 스크립트
# 사용법: powershell -File scripts/update-data.ps1
# 출처: Yahoo Finance chart API (query1.finance.yahoo.com) - 브라우저 CORS는 막혀 있지만
#       서버 사이드(Invoke-WebRequest)에서는 정상 동작함을 확인. 이 스크립트를 주기적으로
#       재실행해 "자산 현황" 탭의 기준일을 갱신한다 (실시간 스트리밍이 아님).

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$outPath = Join-Path $root "data\asset-data.js"

# 자산군 => 대표 ETF 매핑
$assets = [ordered]@{
  SPY  = "미국주식 (S&P500)"
  QQQ  = "미국 기술주 (나스닥100)"
  SCHD = "미국 배당주 (SCHD)"
  EEM  = "신흥국주식 (MSCI EM)"
  TLT  = "미국 장기국채 (20년+)"
  IEF  = "미국 중기국채 (7-10년)"
  GLD  = "금"
  DBC  = "원자재"
  VNQ  = "미국 리츠 (REITs)"
  BIL  = "현금성자산 (미국 단기국채)"
}

$headers = @{ "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }

$result = [ordered]@{}
foreach ($ticker in $assets.Keys) {
  Write-Host "다운로드 중: $ticker ($($assets[$ticker]))..."
  $url = "https://query1.finance.yahoo.com/v8/finance/chart/$ticker`?range=max&interval=1mo"
  $resp = Invoke-WebRequest -Uri $url -Headers $headers -UseBasicParsing
  $json = $resp.Content | ConvertFrom-Json
  $chartResult = $json.chart.result[0]

  $timestamps = $chartResult.timestamp
  $closes = $chartResult.indicators.quote[0].close

  # Yahoo가 마지막에 당월 스냅샷 바를 중복으로 붙여주는 경우가 있어, 같은 월이 연속되면 최신 값으로 덮어쓴다.
  $series = New-Object System.Collections.Generic.List[object]
  for ($i = 0; $i -lt $timestamps.Count; $i++) {
    $close = $closes[$i]
    if ($null -eq $close) { continue }
    $date = [DateTimeOffset]::FromUnixTimeSeconds($timestamps[$i]).UtcDateTime.ToString("yyyy-MM")
    $point = [ordered]@{ d = $date; c = [math]::Round([double]$close, 4) }
    if ($series.Count -gt 0 -and $series[$series.Count - 1].d -eq $date) {
      $series[$series.Count - 1] = $point
    } else {
      $series.Add($point)
    }
  }

  $result[$ticker] = [ordered]@{
    name   = $assets[$ticker]
    series = $series
  }

  Start-Sleep -Milliseconds 400
}

$data = [ordered]@{
  updatedAt = (Get-Date).ToString("yyyy-MM-dd")
  assets    = $result
}

$json = $data | ConvertTo-Json -Compress -Depth 6
$out = "// 자산군별 대표 ETF 월봉 데이터 (출처: Yahoo Finance). scripts/update-data.ps1 로 갱신.`nconst ASSET_DATA = $json;`n"
[System.IO.File]::WriteAllText($outPath, $out, [System.Text.UTF8Encoding]::new($false))

Write-Host "완료: $($result.Keys.Count)개 자산, 기준일 $($data.updatedAt)"

