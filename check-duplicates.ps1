Write-Host "=== CHECKING FOR DUPLICATE SESSIONS ===" -ForegroundColor Cyan
Write-Host ""

# Check current session
$sessionCode = Read-Host "Enter your session code (or press Enter for QR655X)"
if (-not $sessionCode) {
    $sessionCode = "QR655X"
}

Write-Host "`nChecking session $sessionCode..." -ForegroundColor Yellow

# Get session details
$url = "https://api.intellaclick.com/api/sessions/code/$sessionCode"
try {
    $response = Invoke-RestMethod -Uri $url -Method GET
    
    Write-Host "`nCurrent Session Details:" -ForegroundColor Green
    Write-Host "  Session ID: $($response.session.id)"
    Write-Host "  Status: $($response.session.status)"
    Write-Host "  Participants: $($response.session.participantCount)"
    Write-Host "  Has Question: $(if($response.session.currentQuestion) {'YES'} else {'NO'})"
    
    if ($response.session.currentQuestion) {
        Write-Host "  Question: $($response.session.currentQuestion.questionText.Substring(0, [Math]::Min(50, $response.session.currentQuestion.questionText.Length)))..."
    }
    
    # Check responses endpoint
    Write-Host "`nChecking responses..." -ForegroundColor Yellow
    $responsesUrl = "https://api.intellaclick.com/api/sessions/code/$sessionCode/responses"
    
    $responsesData = Invoke-RestMethod -Uri $responsesUrl -Method GET
    Write-Host "  Total Responses: $($responsesData.totalResponses)"
    Write-Host "  Session ID (from responses): $($responsesData.sessionId)"
    
    # Check if session IDs match
    if ($response.session.id -ne $responsesData.sessionId) {
        Write-Host "`n⚠️ WARNING: Session ID mismatch!" -ForegroundColor Red
        Write-Host "  Main endpoint: $($response.session.id)"
        Write-Host "  Responses endpoint: $($responsesData.sessionId)"
    }
    
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
}

# Test with different cache bypass methods
Write-Host "`n=== TESTING CACHE BYPASS METHODS ===" -ForegroundColor Cyan

Write-Host "`n1. Testing with timestamp..." -ForegroundColor Yellow
$timestamp = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
$urlWithTime = "$url/current-question?t=$timestamp"
try {
    $response1 = Invoke-WebRequest -Uri $urlWithTime -Method GET
    Write-Host "  Status: $($response1.StatusCode)"
    Write-Host "  CF-Cache-Status: $($response1.Headers['CF-Cache-Status'])"
} catch {
    Write-Host "  Error: $_" -ForegroundColor Red
}

Write-Host "`n2. Testing with random parameter..." -ForegroundColor Yellow
$random = Get-Random
$urlWithRandom = "$url/current-question?r=$random"
try {
    $response2 = Invoke-WebRequest -Uri $urlWithRandom -Method GET
    Write-Host "  Status: $($response2.StatusCode)"
    Write-Host "  CF-Cache-Status: $($response2.Headers['CF-Cache-Status'])"
} catch {
    Write-Host "  Error: $_" -ForegroundColor Red
}

Write-Host "`n=== RECOMMENDATIONS ===" -ForegroundColor Cyan
Write-Host "1. When the other computer is ready, run this command there:"
Write-Host "   fetch('$url').then(r => r.json()).then(d => console.log('Session ID:', d.session.id))" -ForegroundColor Yellow
Write-Host ""
Write-Host "2. If you see different session IDs, run the cleanup script:"
Write-Host "   .\cleanup-session.ps1" -ForegroundColor Yellow
Write-Host ""
Write-Host "3. Create a new session with a unique code"
Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")