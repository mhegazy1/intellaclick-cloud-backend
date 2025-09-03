# PowerShell script to test response flow with rate limit handling
param(
    [Parameter(Mandatory=$true)]
    [string]$SessionCode
)

$baseURL = "https://api.intellaclick.com/api"

Write-Host "=== TESTING RESPONSE FLOW ===" -ForegroundColor Cyan
Write-Host "Session Code: $SessionCode"
Write-Host ""

# Add delay between requests to avoid rate limiting
Start-Sleep -Seconds 2

try {
    # 1. Check if session exists
    Write-Host "1. Checking if session exists..." -ForegroundColor Yellow
    $sessionResponse = Invoke-RestMethod -Uri "$baseURL/sessions/code/$SessionCode" -Method Get
    Write-Host "Session found:" -ForegroundColor Green
    Write-Host "  ID: $($sessionResponse.session.id)"
    Write-Host "  Status: $($sessionResponse.session.status)"
    Write-Host "  Participants: $($sessionResponse.session.participantCount)"
    Write-Host ""
    
    Start-Sleep -Seconds 2
    
    # 2. Get current question
    Write-Host "2. Getting current question..." -ForegroundColor Yellow
    try {
        $questionResponse = Invoke-RestMethod -Uri "$baseURL/sessions/code/$SessionCode/current-question" -Method Get
        if ($questionResponse.question) {
            Write-Host "Current question found:" -ForegroundColor Green
            Write-Host "  ID: $($questionResponse.question.id)"
            Write-Host "  Text: $($questionResponse.question.questionText.Substring(0, [Math]::Min(50, $questionResponse.question.questionText.Length)))..."
        } else {
            Write-Host "No current question" -ForegroundColor Red
        }
    } catch {
        Write-Host "Error getting current question: $_" -ForegroundColor Red
    }
    Write-Host ""
    
    Start-Sleep -Seconds 2
    
    # 3. Get responses
    Write-Host "3. Getting responses..." -ForegroundColor Yellow
    try {
        $responsesResponse = Invoke-RestMethod -Uri "$baseURL/sessions/code/$SessionCode/responses" -Method Get
        Write-Host "Responses:" -ForegroundColor Green
        Write-Host "  Total Responses: $($responsesResponse.totalResponses)"
        Write-Host "  Response Count: $($responsesResponse.responses.Count)"
        
        if ($responsesResponse.responsesByQuestion) {
            Write-Host "  By Question:"
            foreach ($questionId in $responsesResponse.responsesByQuestion.PSObject.Properties.Name) {
                $count = $responsesResponse.responsesByQuestion.$questionId.Count
                Write-Host "    Question $questionId`: $count responses"
            }
        }
    } catch {
        Write-Host "Error getting responses: $_" -ForegroundColor Red
    }
    
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
}