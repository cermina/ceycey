# pack.ps1
# Clean up old deployment artifacts
If (Test-Path "deploy.zip") { Remove-Item "deploy.zip" -Force }
If (Test-Path "dist") { Remove-Item "dist" -Recurse -Force }

# Create fresh dist structure
New-Item -ItemType Directory -Path "dist" -Force
New-Item -ItemType Directory -Path "dist/data" -Force

# Copy public web assets
Copy-Item "index.html" "dist/"
Copy-Item "login.html" "dist/"
Copy-Item "pricing.html" "dist/"
Copy-Item "privacy.html" "dist/"
Copy-Item "refund.html" "dist/"
Copy-Item "terms.html" "dist/"
Copy-Item "style.css" "dist/"
Copy-Item "ats.js" "dist/"
Copy-Item "_headers" "dist/"
Copy-Item "favicon.svg" "dist/"
Copy-Item "robots.txt" "dist/"

# Copy cargo-data and encrypted databases only
Copy-Item "data/cargo-data.js" "dist/data/"
Copy-Item "data/procedures.enc" "dist/data/"
Copy-Item "data/matrix_lookup.enc" "dist/data/"

# Compress dist contents into deploy.zip
Compress-Archive -Path "dist/*" -DestinationPath "deploy.zip" -Force

# Clean up temp folder
Remove-Item "dist" -Recurse -Force

Write-Host "✅ deploy.zip created successfully and securely containing only encrypted data files!" -ForegroundColor Green
