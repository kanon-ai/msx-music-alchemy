$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
cmake -S . -B build-native -A x64
if ($LASTEXITCODE -ne 0) { throw 'CMake configuration failed' }
cmake --build build-native --config Release
if ($LASTEXITCODE -ne 0) { throw 'Native build failed' }
New-Item -ItemType Directory -Path bin -Force | Out-Null
Copy-Item -LiteralPath build-native/Release/msx_render.exe -Destination bin/msx_render.exe
python -m unittest discover -s tests -v
if ($LASTEXITCODE -ne 0) { throw 'Tests failed' }
