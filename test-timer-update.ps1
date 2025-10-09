Write-Host "=== TESTING TIMER UPDATE FUNCTIONALITY ===" -ForegroundColor Cyan
Write-Host ""

# Configuration
$apiBase = "https://api.intellaclick.com/api"
$authToken = $env:INTELLACLICK_TOKEN

if (-not $authToken) {
    Write-Host "No auth token found. Please set INTELLACLICK_TOKEN environment variable." -ForegroundColor Red
    Write-Host "You can get a token by logging in via the API or from the desktop app." -ForegroundColor Yellow
    Write-Host ""
    
    # Try to create a test session anyway
    Write-Host "Creating test session without authentication..." -ForegroundColor Yellow
}

# Step 1: Create a test session
Write-Host "1. Creating test session..." -ForegroundColor Yellow
$timestamp = Get-Date -Format "HHmmss"
$sessionCode = "TMR$timestamp"

$createBody = @{
    sessionCode = $sessionCode
    title = "Timer Update Test"
    description = "Testing +15s timer functionality"
    requireLogin = $false
} | ConvertTo-Json

try {
    $createResponse = Invoke-RestMethod -Uri "$apiBase/sessions/test" -Method POST -Body $createBody -ContentType "application/json"
    Write-Host "   ✓ Session created: $($createResponse.session.sessionCode)" -ForegroundColor Green
    Write-Host "   ID: $($createResponse.session.id)"
    $sessionId = $createResponse.session.id
} catch {
    Write-Host "   ✗ Failed to create session: $_" -ForegroundColor Red
    exit 1
}

# Step 2: Send a question (requires auth)
if ($authToken) {
    Write-Host "`n2. Sending question to session..." -ForegroundColor Yellow
    
    $questionBody = @{
        questionId = "Q$(Get-Date -Format 'yyyyMMddHHmmss')"
        questionText = "Test question for timer update"
        questionType = "multiple_choice"
        options = @("Option A", "Option B", "Option C", "Option D")
        correctAnswer = "1"
        points = 10
        timeLimit = 30
    } | ConvertTo-Json
    
    $headers = @{
        "x-auth-token" = $authToken
        "Content-Type" = "application/json"
    }
    
    try {
        $questionResponse = Invoke-RestMethod -Uri "$apiBase/sessions/$sessionId/questions" -Method POST -Body $questionBody -Headers $headers
        Write-Host "   ✓ Question sent successfully" -ForegroundColor Green
        $questionId = $questionBody | ConvertFrom-Json | Select -ExpandProperty questionId
        Write-Host "   Question ID: $questionId"
        Write-Host "   Initial time limit: 30s"
        
        # Step 3: Check current question
        Write-Host "`n3. Checking current question (student view)..." -ForegroundColor Yellow
        Start-Sleep -Seconds 1
        
        $currentQuestion = Invoke-RestMethod -Uri "$apiBase/sessions/code/$sessionCode/current-question" -Method GET
        if ($currentQuestion.question) {
            Write-Host "   ✓ Current question found" -ForegroundColor Green
            Write-Host "   Time limit: $($currentQuestion.question.timeLimit)s"
        }
        
        # Step 4: Update timer
        Write-Host "`n4. Testing timer update (+15 seconds)..." -ForegroundColor Yellow
        
        $timerBody = @{
            addSeconds = 15
        } | ConvertTo-Json
        
        try {
            Write-Host "   Calling: POST $apiBase/sessions/$sessionId/questions/$questionId/timer" -ForegroundColor Gray
            $timerResponse = Invoke-RestMethod -Uri "$apiBase/sessions/$sessionId/questions/$questionId/timer" -Method POST -Body $timerBody -Headers $headers
            Write-Host "   ✓ Timer update successful" -ForegroundColor Green
            Write-Host "   New time limit: $($timerResponse.newTimeLimit)s"
            
            # Step 5: Verify update
            Write-Host "`n5. Verifying timer update (student view)..." -ForegroundColor Yellow
            Start-Sleep -Seconds 1
            
            $updatedQuestion = Invoke-RestMethod -Uri "$apiBase/sessions/code/$sessionCode/current-question" -Method GET
            if ($updatedQuestion.question) {
                $newTime = $updatedQuestion.question.timeLimit
                Write-Host "   Current time limit: ${newTime}s"
                
                if ($newTime -eq 45) {
                    Write-Host "   ✓ Timer update verified! Students will see the new time." -ForegroundColor Green
                } else {
                    Write-Host "   ✗ Timer not updated correctly. Expected 45s, got ${newTime}s" -ForegroundColor Red
                }
            }
            
        } catch {
            Write-Host "   ✗ Timer update failed: $_" -ForegroundColor Red
            Write-Host "   Status Code: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
            
            if ($_.Exception.Response.StatusCode.value__ -eq 404) {
                Write-Host "   ! The timer endpoint may not exist or the URL is incorrect" -ForegroundColor Yellow
            }
        }
        
    } catch {
        Write-Host "   ✗ Failed to send question: $_" -ForegroundColor Red
    }
    
} else {
    Write-Host "`n2. Skipping authenticated tests (no token provided)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To test timer updates, run:" -ForegroundColor Yellow
    Write-Host '  $env:INTELLACLICK_TOKEN = "your-auth-token-here"' -ForegroundColor White
    Write-Host "  .\test-timer-update.ps1" -ForegroundColor White
}

Write-Host "`n=== TEST COMPLETE ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Summary:" -ForegroundColor Yellow
Write-Host "- Session Code: $sessionCode"
Write-Host "- Join URL: https://join.intellaclick.com/session/$sessionCode"

if (-not $authToken) {
    Write-Host ""
    Write-Host "Note: Timer update test requires authentication." -ForegroundColor Yellow
    Write-Host "The desktop app should be calling:" -ForegroundColor Yellow
    Write-Host "  POST /api/sessions/{sessionId}/questions/{questionId}/timer" -ForegroundColor White
    Write-Host "  Body: { addSeconds: 15 }" -ForegroundColor White
    Write-Host "  Headers: { x-auth-token: 'instructor-token' }" -ForegroundColor White
}

Write-Host ""