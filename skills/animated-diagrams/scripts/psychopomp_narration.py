#!/usr/bin/env python3
"""Turn locally voiced clips into a Psychopomp narration folder.

Psychopomp's own `scripts/narrate.ts` voices with macOS `say`, ElevenLabs or
Fish Audio and times words with Apple-only mlx-whisper. This script covers any
other voice (VoxCPM, a recording): it takes one audio file per clip, applies
narrate.ts's loudness target, times the words with faster-whisper, and writes
the files `psychopomp::narration::Narration::load` reads:

    <id>.mp3, <id>.words.json, narration.json

Run it with faster-whisper available, for example:

    uv run --with faster-whisper python3 psychopomp_narration.py \
        --script narration/script.json --audio-dir voiced/ --engine voxcpm
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

AUDIO_SUFFIXES = ('.wav', '.flac', '.mp3', '.m4a', '.ogg')


def run(command: list[str]) -> str:
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode:
        sys.exit(f'{command[0]} failed: {result.stderr.strip()[-600:]}')
    return result.stdout


def find_audio(audio_dir: Path, clip_id: str) -> Path:
    for suffix in AUDIO_SUFFIXES:
        candidate = audio_dir / f'{clip_id}{suffix}'
        if candidate.is_file():
            return candidate
    sys.exit(f'no audio for clip {clip_id!r} in {audio_dir} (looked for {", ".join(AUDIO_SUFFIXES)})')


def duration_nanos(path: Path) -> int:
    seconds = run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(path)])
    return round(float(seconds.strip()) * 1e9)


def samples(path: Path):
    # ffmpeg decodes, so faster-whisper never loads PyAV (a mismatched PyAV breaks it)
    import numpy
    raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', str(path), '-f', 'f32le', '-ac', '1', '-ar', '16000', '-'],
                         capture_output=True, check=True).stdout
    return numpy.frombuffer(raw, numpy.float32)


def word_timings(model, path: Path) -> list[dict]:
    segments, _ = model.transcribe(samples(path), word_timestamps=True, language='en')
    words, previous_end = [], 0.0
    for segment in segments:
        for word in segment.words or []:
            # psychopomp requires ordered, non-overlapping words
            start = max(round(word.start, 3), previous_end)
            end = max(round(word.end, 3), start)
            previous_end = end
            if word.word.strip():
                words.append({'word': word.word.strip(), 'start': start, 'end': end})
    return words


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('--script', required=True, type=Path, help='script.json with clips [{id, text}]; output goes beside it')
    parser.add_argument('--audio-dir', required=True, type=Path, help='one <id>.wav (or .flac/.mp3/.m4a/.ogg) per clip')
    parser.add_argument('--engine', default='voxcpm', help='recorded in narration.json, for provenance')
    parser.add_argument('--whisper-model', default='small.en', help='faster-whisper model name or path')
    args = parser.parse_args(argv)

    for tool in ('ffmpeg', 'ffprobe'):
        if not shutil.which(tool):
            sys.exit(f'{tool} is not on PATH')
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        sys.exit('faster-whisper is missing; run with `uv run --with faster-whisper python3 ...`')

    script = json.loads(args.script.read_text())
    out = args.script.parent
    seen: set[str] = set()
    for clip in script['clips']:
        if not re.fullmatch(r'[a-z0-9-]+', clip['id']) or clip['id'] in seen:
            sys.exit(f"clip id {clip['id']!r} must be unique kebab-case")
        seen.add(clip['id'])

    model = WhisperModel(args.whisper_model, device='cpu', compute_type='int8')
    clips = []
    for clip in script['clips']:
        clip_id, text = clip['id'], clip['text']
        source = find_audio(args.audio_dir, clip_id)
        mp3, words = f'{clip_id}.mp3', f'{clip_id}.words.json'
        # the loudness target narrate.ts uses, so clips from any engine sit level
        run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(source), '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
             '-ar', '48000', '-ac', '1', '-b:a', '160k', str(out / mp3)])
        timings = word_timings(model, out / mp3)
        if not timings:
            sys.exit(f'whisper found no words in {source}')
        (out / words).write_text(json.dumps({'wordTimings': timings}, indent=1) + '\n')
        text_hash = hashlib.sha256(f"{args.engine}|{script.get('voice', '')}|1|{text}".encode()).hexdigest()[:16]
        clips.append({'id': clip_id, 'file': mp3, 'words': words, 'durationNanos': duration_nanos(out / mp3),
                      'textHash': text_hash, 'engine': args.engine})
        print(f'{clip_id}: {len(timings)} words, {clips[-1]["durationNanos"] / 1e9:.2f}s', file=sys.stderr)
    (out / 'narration.json').write_text(json.dumps({'clips': clips}, indent=2) + '\n')
    print(json.dumps([{'id': c['id'], 'engine': c['engine'], 'seconds': c['durationNanos'] / 1e9} for c in clips]))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
