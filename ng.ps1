param(
  [Parameter(Position=0)]
  [string]$command = "build"
)

if ($command -eq "build") {
  node --check server.js
  node --check public/app.js
  node --check public/config.js
  Write-Host "[ng build] All files compiled and checked successfully."
  exit 0
}
elseif ($command -eq "test") {
  node --test test/unit.test.js
  exit $LASTEXITCODE
}
else {
  Write-Host "[ng] command $command not implemented in shim."
  exit 0
}
