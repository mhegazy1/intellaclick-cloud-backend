Write-Host "=== QUICK DEBUG TEST FOR QUESTION VISIBILITY ===" -ForegroundColor Cyan
Write-Host "This script tests the most likely causes of questions not appearing on non-dev devices"
Write-Host ""

$sessionCode = Read-Host "Enter your session code"
Write-Host ""

# Test 1: Check for duplicate sessions
Write-Host "TEST 1: Checking for duplicate sessions..." -ForegroundColor Yellow
$url = "https://api.intellaclick.com/api/sessions/code/$sessionCode"
try {
    $response = Invoke-RestMethod -Uri $url -Method GET
    Write-Host "  Session ID: $($response.session.id)" -ForegroundColor Green
    Write-Host "  Status: $($response.session.status)"
    Write-Host "  Has current question: $(if($response.session.currentQuestion) {'YES'} else {'NO'})"
    
    if ($response.session.currentQuestion) {
        Write-Host "  Question: $($response.session.currentQuestion.questionText)"
    }
} catch {
    Write-Host "  ERROR: $_" -ForegroundColor Red
}

# Test 2: Check current question endpoint
Write-Host "`nTEST 2: Checking current question endpoint..." -ForegroundColor Yellow
$questionUrl = "https://api.intellaclick.com/api/sessions/code/$sessionCode/current-question"
try {
    # Force cache bypass with timestamp
    $timestamp = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
    $questionUrlWithTime = "$questionUrl`?t=$timestamp"
    
    $headers = @{
        "Cache-Control" = "no-cache"
        "Pragma" = "no-cache"
    }
    
    $questionResponse = Invoke-RestMethod -Uri $questionUrlWithTime -Method GET -Headers $headers
    
    if ($questionResponse.question) {
        Write-Host "  ✓ Question found!" -ForegroundColor Green
        Write-Host "  Question ID: $($questionResponse.question.id)"
        Write-Host "  Question Text: $($questionResponse.question.questionText)"
        Write-Host "  Options: $($questionResponse.question.options.Count)"
    } else {
        Write-Host "  ✗ No question currently active" -ForegroundColor Yellow
        Write-Host "  Session status: $($questionResponse.sessionStatus)"
    }
    
    # Check response headers
    Write-Host "`n  Checking cache headers..."
    $webResponse = Invoke-WebRequest -Uri $questionUrlWithTime -Method GET -Headers $headers
    $cacheControl = $webResponse.Headers["Cache-Control"]
    $cfCacheStatus = $webResponse.Headers["CF-Cache-Status"]
    
    Write-Host "  Cache-Control: $cacheControl"
    if ($cfCacheStatus) {
        Write-Host "  CloudFlare Cache: $cfCacheStatus" -ForegroundColor $(if($cfCacheStatus -eq "HIT") {"Red"} else {"Green"})
        if ($cfCacheStatus -eq "HIT") {
            Write-Host "  WARNING: Response was served from cache!" -ForegroundColor Red
        }
    }
} catch {
    Write-Host "  ERROR: $_" -ForegroundColor Red
}

# Test 3: Check for multiple sessions with same code
Write-Host "`nTEST 3: Checking database for duplicate sessions..." -ForegroundColor Yellow
Write-Host "  (This requires the check-sessions.js script on the server)"
Write-Host "  If you see multiple sessions with the same code, that's the problem!"

# Test 4: Network connectivity test
Write-Host "`nTEST 4: Testing API connectivity..." -ForegroundColor Yellow
$healthUrl = "https://api.intellaclick.com/api/sessions/health"
try {
    $health = Invoke-RestMethod -Uri $healthUrl -Method GET
    Write-Host "  ✓ API is reachable" -ForegroundColor Green
    Write-Host "  Server time: $($health.timestamp)"
    
    # Check time sync
    $serverTime = [DateTime]::Parse($health.timestamp)
    $localTime = [DateTime]::UtcNow
    $timeDiff = [Math]::Abs(($serverTime - $localTime).TotalSeconds)
    
    Write-Host "  Time difference: $timeDiff seconds"
    if ($timeDiff -gt 30) {
        Write-Host "  WARNING: Clock sync issue detected!" -ForegroundColor Red
    }
} catch {
    Write-Host "  ERROR: Cannot reach API - $_" -ForegroundColor Red
}

# Test 5: Direct question test
Write-Host "`nTEST 5: Testing hardcoded question endpoint..." -ForegroundColor Yellow
$testQuestionUrl = "https://api.intellaclick.com/api/sessions/test-question"
try {
    $testQuestion = Invoke-RestMethod -Uri $testQuestionUrl -Method GET
    Write-Host "  ✓ Test endpoint working" -ForegroundColor Green
    Write-Host "  Can retrieve: $($testQuestion.question.questionText)"
} catch {
    Write-Host "  ERROR: Test endpoint failed - $_" -ForegroundColor Red
}

# Summary
Write-Host "`n=== SUMMARY ===" -ForegroundColor Cyan
Write-Host "Run this same script on your phone/other computer using:"
Write-Host "1. Open browser console (usually Settings → Advanced → Developer tools)"
Write-Host "2. Copy and run the JavaScript version below:"
Write-Host ""
Write-Host "=== COPY THIS TO RUN IN BROWSER CONSOLE ===" -ForegroundColor Yellow
$jsCode = @'
// Quick Debug Test
const sessionCode = 'REPLACE_WITH_CODE';
console.log('=== QUICK DEBUG TEST ===');

// Test 1: Check session
fetch('https://api.intellaclick.com/api/sessions/code/' + sessionCode)
  .then(r => r.json())
  .then(data => {
    console.log('Session ID:', data.session?.id);
    console.log('Has question:', !!data.session?.currentQuestion);
  });

// Test 2: Check current question with cache bypass
fetch('https://api.intellaclick.com/api/sessions/code/' + sessionCode + '/current-question?t=' + Date.now(), {
  headers: {
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  }
})
  .then(r => r.json())
  .then(data => {
    console.log('Current Question:', data.question);
    if (data.question) {
      console.log('Question Text:', data.question.questionText);
    }
  });

// Test 3: Monitor for changes
console.log('Starting monitor - will check every 3 seconds...');
setInterval(() => {
  fetch('https://api.intellaclick.com/api/sessions/code/' + sessionCode + '/current-question?t=' + Date.now())
    .then(r => r.json())
    .then(data => {
      const time = new Date().toLocaleTimeString();
      console.log(time, '- Question:', data.question ? data.question.questionText.substring(0, 50) + '...' : 'No question');
    });
}, 3000);
'@

$jsCode = $jsCode -replace 'REPLACE_WITH_CODE', $sessionCode
Write-Host $jsCode
Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")