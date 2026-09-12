#!/usr/bin/env python3
"""Check tutorial authoring capabilities without installing or starting services."""
import argparse
import json
from pathlib import Path
import shutil
import sys
from urllib.error import URLError
from urllib.request import urlopen

from scaffold_tutorial import TEMPLATE_FILES


def authoring_stage(workspace):
    lesson = workspace / 'lesson.json'
    if not lesson.is_file():
        return {'stage': 'AUTHOR_LESSON', 'next': 'Write lesson.json using references/authoring.md and references/player-data.md.'}
    try:
        data = json.loads(lesson.read_text())
        sections = [section for chapter in data['chapters'] for section in chapter['sections']] if 'chapters' in data else data['sections']
        missing = []
        for section in sections:
            for field in ['audio', 'alignment']:
                path = Path(section[field]).expanduser()
                if not path.is_absolute():
                    path = workspace / path
                if not path.is_file():
                    missing.append({'section': section['id'], 'kind': field, 'path': str(path)})
        if missing:
            return {'stage': 'NARRATE_AND_ALIGN', 'missing_inputs': missing, 'next': 'Generate the missing recordings or alignments with references/runtime.md, then rerun doctor.'}
    except (OSError, ValueError, KeyError, TypeError):
        return {'stage': 'VALIDATE_LESSON', 'next': 'Run scaffold_tutorial.py --lesson lesson.json --check for exact schema diagnostics.'}
    if (workspace / 'site/content/manifest.json').is_file():
        return {'stage': 'BROWSER_VERIFICATION', 'next': 'Verify the generated site with references/verification.md. Rebuild into a new directory if the authored inputs changed.'}
    return {'stage': 'VALIDATE_LESSON', 'next': 'Run scaffold_tutorial.py --lesson lesson.json --check, then compile into a new site directory.'}


def inspect_environment(workspace, voice_server=None, breeze_server=None):
    skill = Path(__file__).resolve().parents[1]
    blockers = []
    player = skill / 'assets/player'
    missing = [name for name in TEMPLATE_FILES if not (player / name).is_file()]
    if missing:
        blockers.append({'code': 'INCOMPLETE_BUNDLE', 'files': missing, 'next': 'Restore the complete skill including assets/player.'})
    for tool in ['ffmpeg', 'ffprobe']:
        if not shutil.which(tool):
            blockers.append({'code': 'MISSING_TOOL', 'tool': tool, 'next': 'Install FFmpeg in the authoring environment; generated sites only need Python.'})
    workspace = workspace.expanduser().resolve()
    if workspace.exists() and not workspace.is_dir():
        blockers.append({'code': 'WORKSPACE_NOT_DIRECTORY', 'next': 'Choose a project directory.'})
    if workspace.is_relative_to(skill):
        blockers.append({'code': 'WORKSPACE_INSIDE_SKILL', 'next': 'Choose a project directory outside the installed skill for narration and generated files.'})
    voice = {'status': 'not_requested'}
    if breeze_server:
        try:
            with urlopen(breeze_server.rstrip('/') + '/health', timeout=4) as response:
                voice = json.load(response)
            if not isinstance(voice, dict) or voice.get('status') != 'ok':
                blockers.append({'code': 'BREEZE_NOT_READY', 'next': 'Start the upstream Breeze API on your selected compute host; see references/voices.md.'})
            voice = {'api': 'breeze-native', 'health': voice}
        except (URLError, OSError, ValueError, KeyError, TypeError) as error:
            blockers.append({'code': 'BREEZE_UNREACHABLE', 'next': 'Choose an available Breeze endpoint or set up the upstream API on a compatible machine; see references/voices.md.', 'detail': str(error)})
    elif voice_server:
        try:
            with urlopen(voice_server.rstrip('/') + '/api/status', timeout=4) as response:
                voice = json.load(response)
            if voice.get('status') != 'ready':
                blockers.append({'code': 'VOICE_NOT_READY', 'next': 'Start Voice Lab or select another provider in references/voices.md.'})
            with urlopen(voice_server.rstrip('/') + '/api/voices', timeout=4) as response:
                voice['voices'] = [{'id': item['id'], 'ready': item.get('ready', False)} for item in json.load(response)['voices']]
        except (URLError, OSError, ValueError, KeyError, TypeError) as error:
            blockers.append({'code': 'VOICE_UNREACHABLE', 'next': 'Start Voice Lab or choose another endpoint/provider.', 'detail': str(error)})
    stage = authoring_stage(workspace)
    return {
        'status': 'BLOCKED' if blockers else 'READY',
        'workspace': str(workspace),
        'bundle': str(player),
        'voice': voice,
        'blockers': blockers,
        **stage,
        'next': 'Resolve blockers and rerun.' if blockers else stage['next'],
        'capabilities_to_confirm': ['Browser control in the active harness', 'Parakeet runtime on Apple Silicon or an aligned WhisperX export'],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workspace', required=True, type=Path)
    voice = parser.add_mutually_exclusive_group()
    voice.add_argument('--breeze-server', help='Optional upstream Breeze /health readiness check; local or remote URL')
    voice.add_argument('--voice-server', help='Optional legacy Voice Lab readiness check')
    args = parser.parse_args()
    report = inspect_environment(args.workspace, args.voice_server, args.breeze_server)
    print(json.dumps(report, indent=2))
    return int(report['status'] == 'BLOCKED')


if __name__ == '__main__':
    sys.exit(main())
