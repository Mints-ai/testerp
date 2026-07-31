# ─────────────────────────────────────────────
#  Mints ERP — Interactive Chat CLI  (streaming)
#  Usage: .\chat_emp.ps1
# ─────────────────────────────────────────────

$API_KEY   = "REDACTED_API_KEY"
$EMAIL     = "alex.peter@mintsglobal.ae"
$PASSWORD  = "ebc9lqk5Aa1!"
$CHAT_URL  = "http://localhost:3000/api/chat"
$TOKEN_TTL = 3500

Write-Host ""
Write-Host "  Mints ERP  -  AI Chat Assistant (streaming)" -ForegroundColor Cyan
Write-Host "  Type your question and press Enter." -ForegroundColor Gray
Write-Host "  Type 'exit' or 'quit' to stop." -ForegroundColor Gray
Write-Host ""

function Get-Token {
    $body = @{ email = $EMAIL; password = $PASSWORD; returnSecureToken = $true } | ConvertTo-Json
    $resp = Invoke-RestMethod -Method POST `
        -Uri "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$API_KEY" `
        -ContentType "application/json" `
        -Body $body
    return $resp.idToken
}

Write-Host "  Signing in..." -ForegroundColor Yellow
$token      = Get-Token
$tokenFetch = Get-Date
Write-Host "  Signed in as $EMAIL" -ForegroundColor Green
Write-Host ""

while ($true) {
    $elapsed = (Get-Date) - $tokenFetch
    if ($elapsed.TotalSeconds -ge $TOKEN_TTL) {
        Write-Host "  [Refreshing token...]" -ForegroundColor DarkYellow
        $token      = Get-Token
        $tokenFetch = Get-Date
    }

    Write-Host "You: " -ForegroundColor White -NoNewline
    $question = Read-Host

    if ([string]::IsNullOrWhiteSpace($question)) { continue }
    if ($question -in @("exit", "quit")) {
        Write-Host ""
        Write-Host "  Goodbye!" -ForegroundColor Cyan
        break
    }

    try {
        $reqBodyJson = @{ message = $question } | ConvertTo-Json

        # Use HttpWebRequest so we can read the SSE stream incrementally
        $webReq = [System.Net.HttpWebRequest]::Create($CHAT_URL)
        $webReq.Method      = "POST"
        $webReq.ContentType = "application/json"
        $webReq.Headers.Add("Authorization", "Bearer $token")
        $webReq.Accept      = "text/event-stream"

        $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($reqBodyJson)
        $webReq.ContentLength = $bodyBytes.Length
        $reqStream = $webReq.GetRequestStream()
        $reqStream.Write($bodyBytes, 0, $bodyBytes.Length)
        $reqStream.Close()

        $response   = $webReq.GetResponse()
        $respStream = $response.GetResponseStream()
        $reader     = [System.IO.StreamReader]::new($respStream, [System.Text.Encoding]::UTF8)

        Write-Host ""
        Write-Host "Assistant: " -ForegroundColor Cyan -NoNewline

        while (-not $reader.EndOfStream) {
            $line = $reader.ReadLine()
            if ($line -eq "" -or -not $line.StartsWith("data: ")) { continue }
            $payload = $line.Substring(6)       # strip "data: "
            if ($payload -eq "[DONE]") { break }

            try {
                $obj        = $payload | ConvertFrom-Json
                $token_text = $obj.token
                Write-Host $token_text -NoNewline
            } catch { }
        }

        $reader.Close()
        $response.Close()
        Write-Host ""
        Write-Host ""
    }
    catch {
        Write-Host ""
        Write-Host "  Error: $_" -ForegroundColor Red
        Write-Host ""
    }
}
