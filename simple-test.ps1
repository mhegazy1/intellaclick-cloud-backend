# Simple duplicate session test
$code = Read-Host "Enter session code"
$url = "https://api.intellaclick.com/api/sessions/code/$code"

Write-Host "`nDev Computer Result:" -ForegroundColor Cyan
$response = Invoke-RestMethod -Uri $url
Write-Host "Session ID: $($response.session.id)" -ForegroundColor Green
Write-Host "Has Question: $(if($response.session.currentQuestion) {'YES'} else {'NO'})"

Write-Host "`nNow test on other device using this command in browser console:" -ForegroundColor Yellow
Write-Host "fetch('$url').then(r => r.json()).then(d => console.log('Session ID:', d.session.id))"
Write-Host "`nIf the Session IDs are DIFFERENT, that's the problem!" -ForegroundColor Red