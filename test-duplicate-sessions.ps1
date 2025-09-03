Write-Host "=== TESTING FOR DUPLICATE SESSIONS VIA API ===" -ForegroundColor Cyan
Write-Host ""

# Test multiple session codes to see if we can find patterns
$sessionCode = Read-Host "Enter your current session code"

Write-Host "`nTesting variations of the session code..." -ForegroundColor Yellow

# Test the exact code
Write-Host "`n1. Testing exact code: $sessionCode" -ForegroundColor Cyan
try {
    $response = Invoke-RestMethod -Uri "https://api.intellaclick.com/api/sessions/code/$sessionCode"
    Write-Host "   Found session ID: $($response.session.id)" -ForegroundColor Green
    Write-Host "   Status: $($response.session.status)"
    Write-Host "   Created: $($response.session.createdAt)"
} catch {
    Write-Host "   Not found" -ForegroundColor Red
}

# Test with different cases (shouldn't matter, but let's check)
$lowerCode = $sessionCode.ToLower()
Write-Host "`n2. Testing lowercase: $lowerCode" -ForegroundColor Cyan
try {
    $response = Invoke-RestMethod -Uri "https://api.intellaclick.com/api/sessions/code/$lowerCode"
    Write-Host "   Found session ID: $($response.session.id)" -ForegroundColor Green
    Write-Host "   ⚠️ PROBLEM: Case sensitivity issue!" -ForegroundColor Red
} catch {
    Write-Host "   Not found (good - case sensitive)" -ForegroundColor Green
}

# Test similar codes (one character different)
Write-Host "`n3. Testing similar codes (to check for typos)..." -ForegroundColor Cyan
$baseCode = $sessionCode.Substring(0, $sessionCode.Length - 1)
$chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

$found = 0
foreach ($char in $chars.ToCharArray()) {
    $testCode = $baseCode + $char
    if ($testCode -ne $sessionCode) {
        try {
            $response = Invoke-RestMethod -Uri "https://api.intellaclick.com/api/sessions/code/$testCode" -ErrorAction SilentlyContinue
            if ($response.success) {
                $found++
                Write-Host "   Found similar code: $testCode (ID: $($response.session.id.Substring(0,8))...)" -ForegroundColor Yellow
                if ($found -ge 3) {
                    Write-Host "   (stopping after 3 matches...)" -ForegroundColor Gray
                    break
                }
            }
        } catch {
            # Not found, ignore
        }
    }
}

if ($found -eq 0) {
    Write-Host "   No similar codes found" -ForegroundColor Green
}

# Create a monitoring script for the other device
Write-Host "`n=== SCRIPT FOR OTHER DEVICE ===" -ForegroundColor Cyan
Write-Host "Copy this entire block and run in the browser console:" -ForegroundColor Yellow
Write-Host ""

$jsScript = @"
// IntellaQuiz Session Comparison Test
console.clear();
console.log('%c=== INTELLAQUIZ SESSION TEST ===', 'color: blue; font-size: 16px');

const sessionCode = '$sessionCode';
const devSessionId = '$($response.session.id)';

console.log('Session Code:', sessionCode);
console.log('Dev Computer Session ID:', devSessionId);
console.log('Testing on this device...\n');

// Test 1: Get session
fetch('https://api.intellaclick.com/api/sessions/code/' + sessionCode)
  .then(r => r.json())
  .then(data => {
    const thisId = data.session?.id;
    console.log('This Device Session ID:', thisId);
    
    if (thisId === devSessionId) {
      console.log('%c✅ SAME SESSION - This is good!', 'color: green; font-size: 14px');
    } else {
      console.log('%c❌ DIFFERENT SESSION - Found the problem!', 'color: red; font-size: 14px');
      console.log('Dev sees session:', devSessionId);
      console.log('This device sees:', thisId);
    }
    
    // Test 2: Check current question
    return fetch('https://api.intellaclick.com/api/sessions/code/' + sessionCode + '/current-question?t=' + Date.now());
  })
  .then(r => r.json())
  .then(data => {
    console.log('\nCurrent Question Check:');
    if (data.question) {
      console.log('✅ Question found:', data.question.questionText);
    } else {
      console.log('❌ No question found');
    }
    
    // Test 3: Try joining
    console.log('\nAttempting to join session...');
    return fetch('https://api.intellaclick.com/api/sessions/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionCode: sessionCode,
        name: 'Debug Test User'
      })
    });
  })
  .then(r => r.json())
  .then(data => {
    if (data.success) {
      console.log('✅ Successfully joined session');
      console.log('Participant ID:', data.participantId);
    } else {
      console.log('❌ Failed to join:', data.error);
    }
  })
  .catch(err => {
    console.error('Test failed:', err);
  });
"@

Write-Host $jsScript -ForegroundColor White -BackgroundColor Black
Write-Host ""
Write-Host "=== END OF SCRIPT ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")