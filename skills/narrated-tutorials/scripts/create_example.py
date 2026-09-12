#!/usr/bin/env python3
"""Generate and build the bundled bread lesson in a new project workspace."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workspace', required=True, type=Path)
    parser.add_argument('--provider', choices=['breeze-api', 'breeze'], default='breeze-api')
    parser.add_argument('--server', help='Upstream Breeze endpoint, or legacy Voice Lab endpoint when --provider breeze')
    parser.add_argument('--voice', help='Configured voice id for legacy --provider breeze only')
    parser.add_argument('--voice-description', help='Narrator description for upstream Breeze; neutral narrator when omitted')
    parser.add_argument('--reference-audio', type=Path)
    parser.add_argument('--reference-text-file', type=Path)
    parser.add_argument('--alignment-python', help='Use an existing Python with parakeet-mlx instead of uv script isolation')
    parser.add_argument('--prepare-only', action='store_true', help='Copy the authored lesson and scripts without calling speech models')
    args = parser.parse_args()
    if not args.prepare_only:
        if args.provider == 'breeze' and not args.voice:
            parser.error('--voice is required for the legacy Voice Lab provider; use --provider breeze-api for voice design or reference cloning.')
        if args.provider == 'breeze-api' and args.voice:
            parser.error('--voice is a legacy preset id; use --voice-description or --reference-audio with Breeze API.')
        if bool(args.reference_audio) != bool(args.reference_text_file):
            parser.error('--reference-audio and --reference-text-file must be supplied together.')
        if args.provider == 'breeze' and (args.reference_audio or args.voice_description):
            parser.error('Reference files and voice descriptions use --provider breeze-api.')
        for path in [args.reference_audio, args.reference_text_file]:
            if path and not path.expanduser().is_file():
                parser.error(f'Voice input does not exist: {path}')
    skill = Path(__file__).resolve().parents[1]
    workspace = args.workspace.expanduser().resolve()
    if workspace.exists() or workspace.is_relative_to(skill):
        parser.error('Choose a new project directory outside the installed skill.')
    workspace.mkdir(parents=True)
    shutil.copytree(skill / 'examples/images', workspace / 'images')
    shutil.copy2(skill / 'examples/bread-lesson.json', workspace / 'lesson.json')
    lesson = json.loads((workspace / 'lesson.json').read_text())
    (workspace / 'audio').mkdir()
    sections = [section for chapter in lesson['chapters'] for section in chapter['sections']]
    for section in sections:
        (workspace / section['audio']).with_suffix('.txt').write_text(section['text'])
    if args.prepare_only:
        print(json.dumps({'status': 'NEEDS_NARRATION', 'workspace': str(workspace), 'next': 'Generate and align each section using references/runtime.md, then compile lesson.json.'}))
        return 0
    scripts = skill / 'scripts'
    try:
        runner = [args.alignment_python] if args.alignment_python else ['uv', 'run', '--script']
        voice_options = []
        for flag, value in [('--server', args.server), ('--voice', args.voice), ('--voice-description', args.voice_description), ('--reference-audio', args.reference_audio), ('--reference-text-file', args.reference_text_file)]:
            if value is not None:
                voice_options.extend([flag, str(value.expanduser().resolve()) if isinstance(value, Path) else value])
        if args.provider == 'breeze-api' and not args.reference_audio:
            voices = workspace / 'voices'
            voices.mkdir()
            reference_text = voices / 'narrator.txt'
            reference_text.write_text('Welcome. We will explore one idea at a time, with clear explanations and simple examples.', encoding='utf-8')
            reference_audio = voices / 'narrator.wav'
            subprocess.run([sys.executable, str(scripts/'narrate.py'), '--provider', 'breeze-api', *voice_options, '--text-file', str(reference_text), '--output', str(reference_audio)], check=True)
            subprocess.run([*runner, str(scripts/'align.py'), str(reference_audio), '--text-file', str(reference_text), '--output', str(voices/'narrator.aligned.json')], check=True)
            voice_options = ['--reference-audio', str(reference_audio), '--reference-text-file', str(reference_text)]
            if args.server:
                voice_options.extend(['--server', args.server])
        for section in sections:
            audio = workspace / section['audio']
            script = audio.with_suffix('.txt')
            command = [sys.executable, str(scripts/'narrate.py'), '--provider', args.provider, '--text-file', str(script), '--output', str(audio)]
            command.extend(voice_options)
            subprocess.run(command, check=True)
            subprocess.run([*runner, str(scripts/'align.py'), str(audio), '--text-file', str(script), '--output', str(workspace/section['alignment'])], check=True)
        subprocess.run([sys.executable, str(scripts/'scaffold_tutorial.py'), '--lesson', str(workspace/'lesson.json'), '--output', str(workspace/'site')], check=True)
    except (OSError, subprocess.CalledProcessError) as error:
        parser.exit(1, f'EXAMPLE_IN_PROGRESS: {error}. Inputs are preserved in {workspace}; resume with the individual commands in references/runtime.md.\n')
    print(json.dumps({'status': 'NEEDS_BROWSER_VERIFICATION', 'site': str(workspace/'site'), 'next': f'python3 {workspace / "site/serve.py"} 8125'}))
    return 0


if __name__ == '__main__':
    sys.exit(main())
