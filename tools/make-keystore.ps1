# Creates a local upload keystore for Google Play signing and android/keystore.properties.
# Both are git-ignored. Back up keystore/ and the password somewhere safe: losing them means you
# can no longer publish updates under the same upload key (Play App Signing can reset it on request).
param([string]$Alias = "pixeldiorama", [string]$DName = "CN=F7 Developer, O=F7 Developer, C=ID")
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$dir = Join-Path $root "keystore"
$ks = Join-Path $dir "upload-keystore.jks"
$props = Join-Path $root "android\keystore.properties"
if (Test-Path $ks) { Write-Host "Keystore already exists: $ks"; exit 0 }
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$bytes = New-Object byte[] 24
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$pass = [Convert]::ToBase64String($bytes) -replace '[+/=]', 'x'
$keytool = if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME "bin\keytool.exe" } else { "keytool" }
& $keytool -genkeypair -v -keystore $ks -alias $Alias -keyalg RSA -keysize 4096 -validity 10000 -storepass $pass -keypass $pass -dname $DName | Out-Null
@"
storeFile=../keystore/upload-keystore.jks
storePassword=$pass
keyAlias=$Alias
keyPassword=$pass
"@ | Set-Content -Path $props -Encoding ASCII
Write-Host "Created $ks and $props"
