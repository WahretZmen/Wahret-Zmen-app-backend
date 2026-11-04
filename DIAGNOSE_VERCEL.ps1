$ErrorActionPreference = 'Continue'
Write-Host '=== Wahret Zmen: Vercel import diagnostics ==='
Write-Host 'Run in the backend directory.'
Write-Host ('Git revision: ' + (git rev-parse --short HEAD))
Write-Host '--- Production dependency inventory ---'
npm ls --omit=dev --depth=0
Write-Host '--- OpenAI imports ---'
Get-ChildItem -Path .\src -Recurse -File -Include *.js,*.cjs,*.mjs | Select-String -Pattern 'require\(["'']openai["'']\)|from ["'']openai["'']|require\(["'']@openai/' | Select-Object Path,LineNumber,Line
Write-Host '--- Test Vercel-style import (without starting local HTTP server) ---'
$oldVercel=$env:VERCEL; $oldNodeEnv=$env:NODE_ENV
try {
  $env:VERCEL='1'; $env:NODE_ENV='production'
  node -e "try { const app=require('./index.js'); console.log('VERCEL_IMPORT_OK:', typeof app); if(typeof app !== 'function') process.exitCode=2; } catch(e) { console.error('VERCEL_IMPORT_FAILED:', e && (e.stack || e)); process.exitCode=1; }"
} finally {
  $env:VERCEL=$oldVercel; $env:NODE_ENV=$oldNodeEnv
}
Write-Host '--- Check backend health (production) ---'
curl.exe -i 'https://wahret-zmen-app-backend-five.vercel.app/api/health/live'
Write-Host '=== End diagnostics ==='
