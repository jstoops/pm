param(
    [int]$Port = 8000
)

$projectRoot = Split-Path -Parent $PSScriptRoot

Push-Location $projectRoot
try {
    $env:APP_PORT = $Port
    docker compose up --build --detach --wait
    if ($LASTEXITCODE -ne 0) {
        throw "Docker Compose failed to start the application."
    }
    Write-Output "Project Management MVP is running at http://localhost:$Port"
}
finally {
    Pop-Location
}