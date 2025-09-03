Write-Host "=== SESSION CLEANUP AND RECOVERY SCRIPT ===" -ForegroundColor Cyan
Write-Host ""

# Get session code from user
$sessionCode = Read-Host "Enter the problematic session code (or press Enter to skip)"

# 1. Check for duplicate sessions
Write-Host "`n1. Checking for duplicate sessions..." -ForegroundColor Yellow
$checkUrl = "https://api.intellaclick.com/api/sessions/cleanup-duplicates"

$checkBody = @{
    adminKey = "cleanup-2024"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri $checkUrl -Method POST -Body $checkBody -ContentType "application/json"
    Write-Host "   Cleaned up $($response.report.Count) duplicate sessions" -ForegroundColor Green
    
    if ($response.report.Count -gt 0) {
        Write-Host "   Duplicate sessions removed:"
        foreach ($item in $response.report) {
            Write-Host "     - Code: $($item.code), Status: $($item.status), Responses: $($item.responses)"
        }
    }
} catch {
    Write-Host "   Error cleaning duplicates: $_" -ForegroundColor Red
}

# 2. If a specific session code was provided, check its status
if ($sessionCode) {
    Write-Host "`n2. Checking session $sessionCode..." -ForegroundColor Yellow
    $sessionUrl = "https://api.intellaclick.com/api/sessions/code/$sessionCode"
    
    try {
        $session = Invoke-RestMethod -Uri $sessionUrl -Method GET
        Write-Host "   Session found:" -ForegroundColor Green
        Write-Host "     Status: $($session.session.status)"
        Write-Host "     Participants: $($session.session.participantCount)"
        Write-Host "     Has Question: $(if ($session.session.currentQuestion) { 'Yes' } else { 'No' })"
    } catch {
        Write-Host "   Session not found or error: $_" -ForegroundColor Red
    }
}

# 3. Provide recovery steps
Write-Host "`n=== RECOVERY STEPS ===" -ForegroundColor Cyan
Write-Host "1. Close PowerPoint completely"
Write-Host "2. Close the IntellaQuiz desktop app"
Write-Host "3. Clear browser cache:"
Write-Host "   - Press F12 in browser"
Write-Host "   - Right-click Refresh button"
Write-Host "   - Select 'Empty Cache and Hard Reload'"
Write-Host ""
Write-Host "4. Restart IntellaQuiz desktop app"
Write-Host "5. Create a NEW session (don't reuse old code)"
Write-Host "6. IMPORTANT: Exit PowerPoint slideshow mode before launching questions"
Write-Host ""
Write-Host "=== PREVENTION TIPS ===" -ForegroundColor Yellow
Write-Host "- Always exit slideshow mode before starting clicker session"
Write-Host "- Use 'Send Question' button, not automatic slideshow triggers"
Write-Host "- If you see rapid submissions, immediately close PowerPoint"
Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")