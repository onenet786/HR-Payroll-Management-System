"""Batch narration with Microsoft's online neural voices (the Edge "Read aloud" service, via the edge-tts package).

Used for languages Windows has no local voice for, such as Urdu (ur-PK-UzmaNeural / ur-PK-AsadNeural).
Same contract as tts.ps1: reads a JSON list [{id, text}], writes <OutDir>/<id>.wav (skipping ones already there)
and prints one JSON line {id: durationMs}.

    python edge_tts_batch.py <items.json> <outDir> <voice> <rate>     # rate 0.92 = 8% slower

Needs: pip install edge-tts, ffmpeg on PATH, internet access. Only the narration text is sent to the service.
"""
import asyncio
import json
import os
import subprocess
import sys
import wave

import edge_tts


def rate_text(rate: float) -> str:
    percent = round((rate - 1) * 100)
    return f"{'+' if percent >= 0 else ''}{percent}%"


async def synthesize(text: str, voice: str, rate: str, mp3_path: str) -> None:
    last_error = None
    for attempt in range(5):  # the online service occasionally drops a request
        try:
            await edge_tts.Communicate(text, voice, rate=rate).save(mp3_path)
            if os.path.getsize(mp3_path) > 0:
                return
        except Exception as error:  # network hiccup or throttling: wait and retry
            last_error = error
        await asyncio.sleep(2 + attempt * 3)
    raise RuntimeError(f"edge-tts failed after 5 attempts: {last_error}")


def wav_ms(path: str) -> int:
    with wave.open(path, "rb") as handle:
        return round(handle.getnframes() * 1000 / handle.getframerate())


async def main() -> None:
    items_file, out_dir, voice, rate = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4])
    os.makedirs(out_dir, exist_ok=True)
    with open(items_file, encoding="utf-8") as handle:
        items = json.load(handle)
    durations = {}
    for item in items:
        wav_path = os.path.join(out_dir, f"{item['id']}.wav")
        if not os.path.exists(wav_path):
            mp3_path = wav_path[:-4] + ".mp3"
            await synthesize(item["text"], voice, rate_text(rate), mp3_path)
            # Same format as the Windows voices: 48 kHz mono PCM, so the mixer treats both alike.
            subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", mp3_path, "-ar", "48000", "-ac", "1", wav_path], check=True)
            os.remove(mp3_path)
        durations[item["id"]] = wav_ms(wav_path)
    print(json.dumps(durations))


asyncio.run(main())
