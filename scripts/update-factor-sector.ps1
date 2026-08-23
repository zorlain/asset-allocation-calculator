# update-factor-data.ps1로 만든 data/factor-data.js에 업종 분류(SEC ownerOrg/SIC)를 덧붙이는 보조 스크립트
# 사용법: powershell -File scripts/update-factor-sector.ps1
# 출처: SEC EDGAR submissions API (data.sec.gov/submissions, 인증/키 불필요, 회사당 가벼운 메타데이터 조회)
# companyfacts(수 MB)와 달리 이건 회사당 수십 KB라 빠르게 전체 종목을 돌 수 있다.

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
$path = Join-Path $root "data\factor-data.js"

Add-Type -AssemblyName System.Web.Extensions
$serializer = New-Object System.Web.Script.Serialization.JavaScriptSerializer
$serializer.MaxJsonLength = [int]::MaxValue

$secHeaders = @{ "User-Agent" = "quantus-personal-project contact@example.com" }

$content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
$body = $content -replace '^//.*\r?\n', '' -replace 'const FACTOR_DATA = ', '' -replace ';\s*$', ''
$data = $serializer.DeserializeObject($body)
$stocks = $data['stocks']

$tickers = @($stocks.Keys)
Write-Host "종목 $($tickers.Count)개 업종 정보 조회 중..."
$i = 0
foreach ($ticker in $tickers) {
  $i++
  if ($i % 50 -eq 0) { Write-Host "  진행: $i / $($tickers.Count)" }
  $cik = $stocks[$ticker]['cik']
  try {
    $resp = Invoke-WebRequest -Uri "https://data.sec.gov/submissions/CIK$cik.json" -Headers $secHeaders -UseBasicParsing
    $sub = $serializer.DeserializeObject($resp.Content)
    $stocks[$ticker]['sic'] = $sub['sic']
    $stocks[$ticker]['sicDesc'] = $sub['sicDescription']
    $stocks[$ticker]['ownerOrg'] = $sub['ownerOrg']
    $stocks[$ticker]['name'] = $sub['name']
    $biz = $sub['addresses']['business']
    if ($biz) {
      $stocks[$ticker]['isForeign'] = $biz['isForeignLocation']
      $stocks[$ticker]['country'] = if ($biz['country']) { $biz['country'] } else { $biz['stateOrCountryDescription'] }
    }
  } catch {
    Write-Host "  경고: $ticker 업종 조회 실패 - $($_.Exception.Message)"
  }
  Start-Sleep -Milliseconds 120
}

$json = $data | ConvertTo-Json -Compress -Depth 8
$out = "// 개별종목 팩터 백테스트 데이터 (출처: SEC EDGAR XBRL, Yahoo Finance). scripts/update-factor-data.ps1 + update-factor-sector.ps1 로 갱신.`nconst FACTOR_DATA = $json;`n"
[System.IO.File]::WriteAllText($path, $out, [System.Text.UTF8Encoding]::new($false))

Write-Host "완료"
