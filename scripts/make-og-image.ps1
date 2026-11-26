# 공유 미리보기 이미지(og-image.png, 1200x630)를 만든다. 사이트 디자인(아이보리 리포트)과 같은 색을 쓴다.
# 사용법: powershell -File scripts/make-og-image.ps1
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root "og-image.png"
$bmp = New-Object System.Drawing.Bitmap 1200, 630
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = "AntiAlias"
$g.TextRenderingHint = "AntiAliasGridFit"
function C($hex) { [System.Drawing.ColorTranslator]::FromHtml($hex) }
$g.Clear((C "#faf7f2"))
# 위쪽 흰 띠 + 구분선
$g.FillRectangle((New-Object System.Drawing.SolidBrush (C "#ffffff")), 0, 0, 1200, 96)
$g.FillRectangle((New-Object System.Drawing.SolidBrush (C "#e4ddd2")), 0, 96, 1200, 2)
$f = "Malgun Gothic"
$g.DrawString("QUANT LAB", (New-Object System.Drawing.Font($f, 16, [System.Drawing.FontStyle]::Bold)), (New-Object System.Drawing.SolidBrush (C "#6b6259")), 70, 34)
# 막대 그래프 모양
$accent = New-Object System.Drawing.SolidBrush (C "#b45309")
$soft = New-Object System.Drawing.SolidBrush (C "#e7c9a4")
$heights = 70, 110, 90, 150, 125, 200, 140, 100
for ($i = 0; $i -lt $heights.Count; $i++) {
  $h = $heights[$i]
  $brush = if ($i -eq 5) { $accent } else { $soft }
  $g.FillRectangle($brush, 760 + $i * 48, 480 - $h, 32, $h)
}
$g.FillRectangle((New-Object System.Drawing.SolidBrush (C "#1f1a14")), 740, 482, 420, 3)
$g.DrawString("퀀트랩", (New-Object System.Drawing.Font($f, 120, [System.Drawing.FontStyle]::Bold)), (New-Object System.Drawing.SolidBrush (C "#1f1a14")), 56, 205)
$g.DrawString("자산배분 백테스트 리포트", (New-Object System.Drawing.Font($f, 34, [System.Drawing.FontStyle]::Bold)), (New-Object System.Drawing.SolidBrush (C "#b45309")), 70, 395)
$g.DrawString("자산배분 · 투자전략 · 낙원계산기  |  무료", (New-Object System.Drawing.Font($f, 24)), (New-Object System.Drawing.SolidBrush (C "#6b6259")), 70, 455)
$g.DrawString("zorlain.github.io/asset-allocation-calculator", (New-Object System.Drawing.Font($f, 18)), (New-Object System.Drawing.SolidBrush (C "#8a8178")), 70, 545)
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Host "saved $out"
