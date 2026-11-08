# PowerShell script to kill existing OverlayV1 server processes
# Run this manually before starting the new server (needs admin rights)

$connections = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($connections) {
    foreach ($conn in $connections) {
        try {
            $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$($conn.OwningProcess)" -ErrorAction SilentlyContinue
            if ($proc -and $proc.CommandLine -like '*server.js*') {
                Write-Host "Zabivaem process PID=" + $conn.OwningProcess + " (node server.js)"
                Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
                Write-Host "Successfully stopped OverlayV1 server"
            } else {
                $name = if ($proc) { $proc.Name } else { 'neizvestnyy' }
                Write-Host "PREDUPREZHDENIE: port 3000 zanyat procesom PID=" + $conn.OwningProcess + " (" + $name + "), a ne OverlayV1. Server ne smozhet startovat, dokhem port ne osvodit."
            }
        } catch {
            # Ignore errors - can't access that process
        }
    }
} else {
    Write-Host "No existing connections found on port 3000"
}

Write-Host "Done."