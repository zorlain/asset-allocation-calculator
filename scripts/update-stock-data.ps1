# 개별종목 스크리너용 데이터 수집 스크립트 (미국 S&P500 + 한국 코스피 시가총액 상위 종목)
# 사용법: powershell -File scripts/update-stock-data.ps1
# 출처: 네이버페이 증권 API(m.stock.naver.com, api.stock.naver.com, finance.naver.com) - 인증 없이 접근 가능.
#       Yahoo Finance의 시세 API(v7/v10)는 최근 crumb 인증이 필요해져 막혔지만, 네이버 API는
#       서버 사이드에서 별도 인증 없이 정상 동작함을 확인했다.
# 종목 목록 출처: 미국은 위키백과 "List of S&P 500 companies" 원본 위키텍스트, 한국은
#       네이버 코스피 시가총액 순위 페이지 상위 종목(코스피200 근사치)을 사용한다.
# 주의: 약 700개 종목 x 1~2회 요청이라 전체 실행에 수 분이 걸린다. 요청 간 짧은 딜레이를 둔다.

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
$outPath = Join-Path $root "data\stock-data.js"

$headers = @{ "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
$naverHeaders = @{ "User-Agent" = $headers."User-Agent"; "Referer" = "https://m.stock.naver.com/" }

function Parse-KoreanWon($s) {
  # "1,645조 7,274억" / "74억" / "1조" 같은 문자열을 원 단위 숫자로 변환
  if (-not $s) { return $null }
  $s = $s -replace ",", ""
  $jo = 0.0; $eok = 0.0
  if ($s -match "(\d+(\.\d+)?)조") { $jo = [double]$matches[1] }
  if ($s -match "(\d+(\.\d+)?)억") { $eok = [double]$matches[1] }
  if ($jo -eq 0 -and $eok -eq 0) { return $null }
  return [math]::Round($jo * 1e12 + $eok * 1e8)
}

function Parse-NumStr($s) {
  if ($null -eq $s) { return $null }
  $clean = ($s -replace "[,%배원]", "").Trim()
  if ($clean -eq "" -or $clean -eq "N/A") { return $null }
  $v = 0.0
  if ([double]::TryParse($clean, [ref]$v)) { return $v }
  return $null
}

# ---------- 1. 업종 코드 -> 이름 매핑 (네이버 업종별시세, 1회 조회) ----------
Write-Host "업종 코드표 조회 중..."
$sectorMap = @{}
try {
  $raw = Invoke-WebRequest -Uri "https://finance.naver.com/sise/sise_group.naver?type=upjong" -Headers $headers -UseBasicParsing
  $bytes = $raw.RawContentStream.ToArray()
  $html = [System.Text.Encoding]::GetEncoding("EUC-KR").GetString($bytes)
  [regex]::Matches($html, 'no=(\d+)">([^<]+)') | ForEach-Object {
    $sectorMap[$_.Groups[1].Value] = $_.Groups[2].Value
  }
  Write-Host "  업종 $($sectorMap.Count)개 확보"
} catch {
  Write-Host "  경고: 업종 코드표 조회 실패 - $($_.Exception.Message)"
}

# ---------- 2. 한국 종목: 코스피 시가총액 상위 (코스피200 근사치) ----------
Write-Host "코스피 시가총액 순위 조회 중..."
$krList = New-Object System.Collections.Generic.List[object]
for ($page = 1; $page -le 4; $page++) {
  try {
    $raw = Invoke-WebRequest -Uri "https://finance.naver.com/sise/sise_market_sum.naver?sosok=0&page=$page" -Headers $headers -UseBasicParsing
    $bytes = $raw.RawContentStream.ToArray()
    $html = [System.Text.Encoding]::GetEncoding("EUC-KR").GetString($bytes)
    $rowPattern = '<td><a href="/item/main\.naver\?code=(\d{6})"[^>]*>([^<]+)</a></td>\s*<td class="number">([^<]*)</td>.*?<td class="number">\s*<span[^>]*>\s*([+\-0-9.,]+)%\s*</span>\s*</td>\s*<td class="number">([^<]*)</td>\s*<td class="number">([^<]*)</td>\s*<td class="number">([^<]*)</td>\s*<td class="number">([^<]*)</td>\s*<td class="number">([^<]*)</td>\s*<td class="number">([^<]*)</td>\s*<td class="number">([^<]*)</td>'
    $matches = [regex]::Matches($html, $rowPattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)
    foreach ($m in $matches) {
      $krList.Add([ordered]@{
        code       = $m.Groups[1].Value
        name       = $m.Groups[2].Value
        price      = Parse-NumStr $m.Groups[3].Value
        changePct  = Parse-NumStr $m.Groups[4].Value
        faceValue  = Parse-NumStr $m.Groups[5].Value
        marketCapEok = Parse-NumStr $m.Groups[6].Value
        volume     = Parse-NumStr $m.Groups[9].Value
        per        = Parse-NumStr $m.Groups[10].Value
        roe        = Parse-NumStr $m.Groups[11].Value
      })
    }
    Write-Host "  ${page}페이지: 누적 $($krList.Count)개"
  } catch {
    Write-Host "  경고: 코스피 ${page}페이지 조회 실패 - $($_.Exception.Message)"
  }
  Start-Sleep -Milliseconds 300
}

# ---------- 3. 미국 종목 목록: 위키백과 S&P500 구성종목 원본 위키텍스트 ----------
Write-Host "S&P500 종목 목록 조회 중..."
$usTickers = New-Object System.Collections.Generic.List[string]
try {
  $wiki = Invoke-WebRequest -Uri "https://en.wikipedia.org/w/index.php?title=List_of_S%26P_500_companies&action=raw" -Headers $headers -UseBasicParsing
  $text = $wiki.Content
  $tableStart = $text.IndexOf('id="constituents"')
  $tableEnd = $text.IndexOf("`n|}", $tableStart)
  $tableText = $text.Substring($tableStart, $tableEnd - $tableStart)
  [regex]::Matches($tableText, '\{\{(Nyse|Nasdaq)Symbol\|([A-Za-z0-9.\-]+)\}\}') | ForEach-Object {
    $usTickers.Add($_.Groups[2].Value.ToUpper())
  }
  Write-Host "  S&P500 $($usTickers.Count)개 확보"
} catch {
  Write-Host "  경고: S&P500 목록 조회 실패 - $($_.Exception.Message)"
}

# 네이버는 미국 종목의 reutersCode에 거래소 접미사(.O/.K 등)를 종목마다 다르게 붙이므로
# (예: KO는 접미사 없음, AAPL은 .O, DELL은 .K) 자동완성 검색 API로 실제 코드를 하나씩 확인한다.
Write-Host "미국 종목 코드 확인 중..."
$usList = New-Object System.Collections.Generic.List[object]
$i = 0
foreach ($ticker in $usTickers) {
  $i++
  if ($i % 50 -eq 0) { Write-Host "  진행: $i / $($usTickers.Count)" }
  try {
    $resp = Invoke-WebRequest -Uri "https://ac.stock.naver.com/ac?q=$([Uri]::EscapeDataString($ticker))&target=stock" -Headers $headers -UseBasicParsing
    $json = $resp.Content | ConvertFrom-Json
    $match = $json.items | Where-Object { $_.code -eq $ticker -and $_.nationCode -eq "USA" } | Select-Object -First 1
    if ($match) {
      $usList.Add([ordered]@{ ticker = $ticker; reutersCode = $match.reutersCode })
    } else {
      Write-Host "  경고: $ticker 코드 확인 실패 (검색 결과 없음)"
    }
  } catch {
    Write-Host "  경고: $ticker 코드 확인 실패 - $($_.Exception.Message)"
  }
  Start-Sleep -Milliseconds 150
}
Write-Host "  코드 확인 완료: $($usList.Count) / $($usTickers.Count)"

# ---------- 4. 한국 종목 상세 (PBR, 배당수익률, 52주 고저, 업종) ----------
Write-Host "한국 종목 상세 조회 중... (종목당 1회 요청, 시간이 걸립니다)"
$result = [ordered]@{}
$i = 0
foreach ($item in $krList) {
  $i++
  if ($i % 20 -eq 0) { Write-Host "  진행: $i / $($krList.Count)" }
  try {
    $resp = Invoke-WebRequest -Uri "https://m.stock.naver.com/api/stock/$($item.code)/integration" -Headers $naverHeaders -UseBasicParsing
    $json = $resp.Content | ConvertFrom-Json
    $info = @{}
    foreach ($t in $json.totalInfos) { $info[$t.code] = $t.value }

    $sectorName = if ($json.industryCode -and $sectorMap.ContainsKey([string]$json.industryCode)) { $sectorMap[[string]$json.industryCode] } else { $null }
    $marketCap = Parse-KoreanWon $info["marketValue"]
    if (-not $marketCap -and $item.marketCapEok) { $marketCap = [math]::Round($item.marketCapEok * 1e8) }

    $result[$item.code] = [ordered]@{
      market      = "KR"
      name        = $item.name
      sector      = $sectorName
      price       = $item.price
      currency    = "KRW"
      changePct   = $item.changePct
      marketCap   = $marketCap
      per         = $item.per
      pbr         = Parse-NumStr $info["pbr"]
      roe         = $item.roe
      dividendYield = Parse-NumStr $info["dividendYieldRatio"]
      volume      = $item.volume
      high52w     = Parse-NumStr $info["highPriceOf52Weeks"]
      low52w      = Parse-NumStr $info["lowPriceOf52Weeks"]
    }
  } catch {
    Write-Host "  경고: $($item.code) ($($item.name)) 조회 실패 - $($_.Exception.Message)"
  }
  Start-Sleep -Milliseconds 250
}

# ---------- 5. 미국 종목 상세 (전체 지표를 한 번에) ----------
Write-Host "미국 종목 상세 조회 중... (종목당 1회 요청, 시간이 걸립니다)"
$i = 0
foreach ($item in $usList) {
  $i++
  if ($i % 20 -eq 0) { Write-Host "  진행: $i / $($usList.Count)" }
  try {
    $resp = Invoke-WebRequest -Uri "https://api.stock.naver.com/stock/$($item.reutersCode)/basic" -Headers $naverHeaders -UseBasicParsing
    $json = $resp.Content | ConvertFrom-Json
    $info = @{}
    foreach ($t in $json.stockItemTotalInfos) { $info[$t.code] = $t.value }

    $eps = Parse-NumStr $info["eps"]
    $bps = Parse-NumStr $info["bps"]
    $roeApprox = if ($eps -and $bps -and $bps -ne 0) { [math]::Round(($eps / $bps) * 100, 2) } else { $null }

    $result[$item.ticker] = [ordered]@{
      market      = "US"
      name        = $json.stockName
      sector      = $json.industryCodeType.industryGroupKor
      price       = Parse-NumStr $json.closePriceRaw
      currency    = $json.currencyType.code
      changePct   = Parse-NumStr $json.fluctuationsRatioRaw
      marketCap   = if ($json.marketValueFullRaw) { [int64]$json.marketValueFullRaw } else { $null }
      per         = Parse-NumStr $info["per"]
      pbr         = Parse-NumStr $info["pbr"]
      roe         = $roeApprox
      dividendYield = Parse-NumStr $info["dividendYieldRatio"]
      volume      = if ($json.accumulatedTradingVolumeRaw) { [int64]$json.accumulatedTradingVolumeRaw } else { $null }
      high52w     = Parse-NumStr $info["highPriceOf52Weeks"]
      low52w      = Parse-NumStr $info["lowPriceOf52Weeks"]
    }
  } catch {
    Write-Host "  경고: $($item.ticker) 조회 실패 - $($_.Exception.Message)"
  }
  Start-Sleep -Milliseconds 250
}

# ---------- 6. 저장 ----------
$data = [ordered]@{
  updatedAt = (Get-Date).ToString("yyyy-MM-dd")
  stocks    = $result
}
$json = $data | ConvertTo-Json -Compress -Depth 6
$out = "// 개별종목 스크리너 데이터 (출처: 네이버페이 증권). scripts/update-stock-data.ps1 로 갱신.`nconst STOCK_DATA = $json;`n"
[System.IO.File]::WriteAllText($outPath, $out, [System.Text.UTF8Encoding]::new($false))

Write-Host "완료: $($result.Keys.Count)개 종목, 기준일 $($data.updatedAt)"
