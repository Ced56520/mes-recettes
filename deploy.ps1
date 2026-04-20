$ErrorActionPreference = "Stop"

# Certificat entreprise / proxy
$env:NODE_EXTRA_CA_CERTS = "C:\Users\choc\Documents\caadmin.netskope.com.cer"

# Charge automatiquement le token depuis .env si présent
if (Test-Path ".env") {
    Get-Content ".env" | ForEach-Object {
        if ($_ -match '^\s*#') { return }
        if ($_ -match '^\s*$') { return }
        $parts = $_ -split '=', 2
        if ($parts.Length -eq 2) {
            [System.Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim(), "Process")
        }
    }
}

npm run deploy