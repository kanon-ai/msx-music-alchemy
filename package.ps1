$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
& ./build.ps1
if ($LASTEXITCODE -ne 0) { throw 'Build or tests failed' }
python -m PyInstaller --noconfirm --clean --onedir --name MSXMusicAlchemy --add-data 'static;static' --add-data 'docs;docs' --add-data 'LICENSE;.' --add-data 'licenses;licenses' --add-data 'vendor/emu2149/LICENSE;licenses/emu2149' --add-data 'vendor/emu2413/LICENSE;licenses/emu2413' --add-data 'vendor/emu2212/LICENSE;licenses/emu2212' --add-binary 'bin/msx_render.exe;bin' launcher.py
if ($LASTEXITCODE -ne 0) { throw 'Packaging failed' }
Copy-Item -LiteralPath README.md,MCP_SETUP.md,THIRD_PARTY.md,LICENSE,DISCLAIMER.md -Destination dist/MSXMusicAlchemy
Copy-Item -LiteralPath docs -Destination dist/MSXMusicAlchemy/docs -Recurse -Force
Copy-Item -LiteralPath samples -Destination dist/MSXMusicAlchemy -Recurse -Force
New-Item -ItemType Directory -Path releases -Force | Out-Null
Compress-Archive -Path dist/MSXMusicAlchemy -DestinationPath releases/MSXMusicAlchemy-v0.3.2-windows-x64.zip -Force
Get-FileHash releases/MSXMusicAlchemy-v0.3.2-windows-x64.zip -Algorithm SHA256
