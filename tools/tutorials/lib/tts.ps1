<#
  Text-to-speech for the video tutorials. Reads a JSON list [{ "id": "...", "text": "..." }] and writes <OutDir>\<id>.wav
  for every entry whose wav does not exist yet, then prints a JSON map { id: durationMs } for all entries.
  Uses the Windows OneCore speech engine (Windows.Media.SpeechSynthesis), which also has the Urdu voice
  (Microsoft Uzma) once "Language.TextToSpeech~~~ur-PK" is installed.
    powershell -NoProfile -ExecutionPolicy Bypass -File tts.ps1 -Items items.json -OutDir wav -Voice "Hazel" -Rate 0.95
#>
param([Parameter(Mandatory)][string]$Items, [Parameter(Mandatory)][string]$OutDir, [string]$Voice = 'Hazel', [double]$Rate = 0.95, [switch]$ListVoices)
$ErrorActionPreference = 'Stop'

[void][Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media, ContentType = WindowsRuntime]
[void][Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, [Type]$type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }

$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
if ($ListVoices) { [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | ForEach-Object { "$($_.DisplayName) [$($_.Language)]" }; return }
$match = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | Where-Object { $_.DisplayName -like "*$Voice*" -or $_.Language -eq $Voice } | Select-Object -First 1
if (-not $match) { throw "No Windows voice matches '$Voice'. Installed: " + (([Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | ForEach-Object { $_.DisplayName }) -join ', ') }
$synth.Voice = $match
$synth.Options.SpeakingRate = $Rate

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$list = Get-Content $Items -Raw -Encoding UTF8 | ConvertFrom-Json
$durations = [ordered]@{}
foreach ($item in $list) {
  $file = Join-Path $OutDir "$($item.id).wav"
  if (-not (Test-Path $file)) {
    $stream = Await ($synth.SynthesizeTextToStreamAsync([string]$item.text)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
    $size = [uint32]$stream.Size
    $reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
    [void](Await ($reader.LoadAsync($size)) ([uint32]))
    $bytes = New-Object byte[] $size
    $reader.ReadBytes($bytes)
    [IO.File]::WriteAllBytes($file, $bytes)
    $reader.Dispose(); $stream.Dispose()
  }
  # WAV header: byte rate at offset 28; data size = file length - 44 (OneCore writes a plain 44-byte header, but find "data" to be safe).
  $b = [IO.File]::ReadAllBytes($file)
  $byteRate = [BitConverter]::ToUInt32($b, 28)
  $dataAt = 12; $dataSize = 0
  while ($dataAt -lt $b.Length - 8) {
    $tag = [Text.Encoding]::ASCII.GetString($b, $dataAt, 4); $len = [BitConverter]::ToUInt32($b, $dataAt + 4)
    if ($tag -eq 'data') { $dataSize = $len; break }
    $dataAt += 8 + $len
  }
  $durations[[string]$item.id] = [int][math]::Round($dataSize * 1000.0 / $byteRate)
}
$durations | ConvertTo-Json -Compress
