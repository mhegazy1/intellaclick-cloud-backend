Write-Host "=== TESTING QUESTION FLOW ===" -ForegroundColor Cyan
Write-Host ""

# 1. Test if the test-question endpoint works
Write-Host "1. Testing hardcoded question endpoint..." -ForegroundColor Yellow
$testUrl = "https://api.intellaclick.com/api/sessions/test-question"

try {
    $testResponse = Invoke-RestMethod -Uri $testUrl -Method GET
    Write-Host "   ✓ Test endpoint working" -ForegroundColor Green
    Write-Host "   Question: $($testResponse.question.questionText)"
} catch {
    Write-Host "   ✗ Test endpoint failed: $_" -ForegroundColor Red
}

# 2. Create a test session
Write-Host "`n2. Creating fresh test session..." -ForegroundColor Yellow
$createUrl = "https://api.intellaclick.com/api/sessions/test"

# Generate unique code with timestamp
$timestamp = Get-Date -Format "HHmm"
$randomPart = Get-Random -Maximum 99
$testCode = "TEST$timestamp$randomPart"

$createBody = @{
    sessionCode = $testCode
    title = "Recovery Test Session"
    description = "Testing after PowerPoint flood"
} | ConvertTo-Json

try {
    $createResponse = Invoke-RestMethod -Uri $createUrl -Method POST -Body $createBody -ContentType "application/json"
    Write-Host "   ✓ Session created successfully" -ForegroundColor Green
    Write-Host "   Code: $($createResponse.session.sessionCode)"
    Write-Host "   URL: $($createResponse.session.publicUrl)"
    
    # 3. Verify session is accessible
    Write-Host "`n3. Verifying session is accessible..." -ForegroundColor Yellow
    $verifyUrl = "https://api.intellaclick.com/api/sessions/code/$testCode"
    
    $verifyResponse = Invoke-RestMethod -Uri $verifyUrl -Method GET
    Write-Host "   ✓ Session verified" -ForegroundColor Green
    
    # 4. Check current question endpoint
    Write-Host "`n4. Testing current question endpoint..." -ForegroundColor Yellow
    $questionUrl = "https://api.intellaclick.com/api/sessions/code/$testCode/current-question"
    
    $questionResponse = Invoke-RestMethod -Uri $questionUrl -Method GET
    if ($questionResponse.question) {
        Write-Host "   ✓ Question endpoint working" -ForegroundColor Green
        Write-Host "   Current question: $($questionResponse.question.questionText)"
    } else {
        Write-Host "   ✓ No current question (expected for new session)" -ForegroundColor Green
    }
    
    Write-Host "`n=== TEST RESULTS ===" -ForegroundColor Cyan
    Write-Host "✓ All endpoints are working correctly" -ForegroundColor Green
    Write-Host ""
    Write-Host "You can now test with this session:" -ForegroundColor Yellow
    Write-Host "1. Open: https://join.intellaclick.com/session/$testCode"
    Write-Host "2. Use session code: $testCode in desktop app"
    Write-Host "3. Send a question from PowerPoint (NOT in slideshow mode)"
    
} catch {
    Write-Host "   ✗ Error: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "The API appears to be having issues. Please check:" -ForegroundColor Yellow
    Write-Host "- Backend deployment status in Coolify"
    Write-Host "- Server logs for errors"
}

Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")