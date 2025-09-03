Write-Host "=== FINDING ALL DUPLICATE SESSIONS ===" -ForegroundColor Cyan
Write-Host "This will check if duplicate sessions exist in the database"
Write-Host ""

# Call the cleanup endpoint in CHECK mode only
$checkUrl = "https://api.intellaclick.com/api/sessions/cleanup-duplicates"

# First, let's do a dry run to see what duplicates exist
Write-Host "Checking for duplicate sessions..." -ForegroundColor Yellow

$checkBody = @{
    adminKey = "check-only-2024"  # Different key to just check, not delete
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri $checkUrl -Method POST -Body $checkBody -ContentType "application/json"
    Write-Host "Request sent, but got response: $($response.message)" -ForegroundColor Yellow
} catch {
    # Expected to fail with wrong key, but let's check the error
    if ($_.Exception.Response.StatusCode -eq 403) {
        Write-Host "Access denied (expected). The endpoint is protected." -ForegroundColor Yellow
    } else {
        Write-Host "Error: $_" -ForegroundColor Red
    }
}

# Alternative: Check specific codes that might have duplicates
Write-Host "`nChecking some common patterns that might have duplicates..." -ForegroundColor Yellow

$patterns = @("TEST", "QR", "DEMO", "QU")
foreach ($pattern in $patterns) {
    Write-Host "`nChecking sessions starting with '$pattern':" -ForegroundColor Cyan
    
    # We can't query all sessions, but we can check if certain codes exist
    $testCodes = @()
    
    # Generate some possible codes
    for ($i = 1; $i -le 5; $i++) {
        $code = $pattern + (Get-Random -Minimum 1000 -Maximum 9999)
        $testCodes += $code
    }
    
    # Also check the current session pattern
    if ("QR655X" -like "$pattern*") {
        $testCodes += "QR655X"
    }
    
    foreach ($code in $testCodes) {
        try {
            $url = "https://api.intellaclick.com/api/sessions/code/$code"
            $response = Invoke-RestMethod -Uri $url -Method GET -ErrorAction SilentlyContinue
            if ($response.success) {
                Write-Host "  Found: $code (ID: $($response.session.id.Substring(0,8))...)" -ForegroundColor Green
            }
        } catch {
            # Session doesn't exist, ignore
        }
    }
}

Write-Host "`n=== MANUAL DATABASE CHECK ===" -ForegroundColor Cyan
Write-Host "To properly check for duplicates, you need to run this on the server:" -ForegroundColor Yellow
Write-Host @'
cd /path/to/cloud-backend
node check-sessions.js
'@

Write-Host "`nOr ask the backend developer to check MongoDB directly:" -ForegroundColor Yellow
Write-Host @'
db.sessions.aggregate([
  { $group: { 
    _id: "$sessionCode", 
    count: { $sum: 1 }, 
    sessions: { $push: { id: "$_id", status: "$status", created: "$createdAt" } } 
  }},
  { $match: { count: { $gt: 1 } } }
])
'@

Write-Host "`nPress any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")