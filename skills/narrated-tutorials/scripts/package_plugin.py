#!/usr/bin/env python3
"""Build a self-contained Claude Code and Codex plugin from the canonical skill."""
import argparse
import json
from pathlib import Path
import shutil
import sys
import tempfile


def package_plugin(output):
    source = Path(__file__).resolve().parents[1]
    output = output.expanduser().absolute()
    if output.exists() or output.is_symlink():
        raise ValueError(f'Output exists: {output}; choose a new directory.')
    if output.resolve().is_relative_to(source):
        raise ValueError('Write the plugin outside the source skill.')
    if output.name != 'narrated-tutorials':
        raise ValueError('Plugin output directory must be named narrated-tutorials.')
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.tutorial-plugin-', dir=output.parent) as directory:
        staging = Path(directory) / 'narrated-tutorials'
        shutil.copytree(source, staging / 'skills/narrated-tutorials', ignore=shutil.ignore_patterns('__pycache__', '*.pyc', '.DS_Store'))
        common = {'name': 'narrated-tutorials', 'version': '1.0.0', 'description': 'Build narrated interactive tutorial websites with synchronized visuals and continuous playback.', 'author': {'name': 'vishhvak'}, 'skills': './skills/'}
        for folder in ['.claude-plugin', '.codex-plugin']:
            (staging / folder).mkdir()
            manifest = dict(common)
            if folder == '.codex-plugin':
                manifest['interface'] = {'displayName': 'Narrated Tutorials', 'shortDescription': 'Teach any topic with speech and synchronized visuals.', 'longDescription': common['description'], 'developerName': 'vishhvak', 'category': 'Productivity', 'capabilities': ['Interactive', 'Write'], 'defaultPrompt': ['Build a narrated tutorial about a topic with continuous play.']}
            (staging / folder / 'plugin.json').write_text(json.dumps(manifest, indent=2) + '\n')
        staging.rename(output)
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    try:
        output = package_plugin(args.output)
    except (OSError, ValueError) as error:
        parser.exit(1, f'PACKAGE_FAILED: {error}\n')
    print(json.dumps({'status': 'PACKAGED', 'output': str(output), 'harnesses': ['Claude Code', 'Codex']}))


if __name__ == '__main__':
    main()
