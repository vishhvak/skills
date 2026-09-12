import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

SCRIPTS = Path(__file__).resolve().parents[1] / 'scripts'
sys.path.insert(0, str(SCRIPTS))
from align import main as align_main, whisperx_alignment
from package_plugin import package_plugin
from doctor import authoring_stage


class AlignmentTests(unittest.TestCase):
    def test_whisperx_missing_word_time_is_not_invented(self):
        with self.assertRaisesRegex(ValueError, 'Unaligned word'):
            whisperx_alignment({'word_segments': [{'word': 'Hello'}]})

    def test_import_validates_transcript_and_preserves_output(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'audio.wav').write_bytes(b'input checked by renderer')
            (root / 'script.txt').write_text('Hello world.')
            exported = root / 'whisper.json'
            exported.write_text(json.dumps({'segments': [{'words': [{'word': 'Hello', 'start': 0.1, 'end': 0.3}, {'word': 'world.', 'start': 0.4, 'end': 0.7}]}]}))
            output = root / 'aligned.json'
            args = [str(root/'audio.wav'), '--text-file', str(root/'script.txt'), '--output', str(output), '--whisperx-json', str(exported)]
            self.assertEqual(align_main(args), 0)
            self.assertEqual(json.loads(output.read_text())['wordTimings'][1]['start'], .4)
            saved = output.read_bytes()
            with self.assertRaises(SystemExit):
                align_main(args)
            self.assertEqual(output.read_bytes(), saved)
            output.unlink()
            (root / 'script.txt').write_text('Goodbye world.')
            self.assertEqual(align_main(args), 1)
            self.assertFalse(output.exists())


class PackageTests(unittest.TestCase):
    def test_package_is_self_contained_and_preserves_existing_destination(self):
        with tempfile.TemporaryDirectory() as folder:
            output = package_plugin(Path(folder) / 'narrated-tutorials')
            skill = output / 'skills/narrated-tutorials'
            self.assertTrue((skill / 'assets/player/code-stage.js').is_file())
            self.assertTrue((skill / 'scripts/scaffold_tutorial.py').is_file())
            self.assertFalse(any(p.is_symlink() for p in output.rglob('*')))
            for directory in ['.claude-plugin', '.codex-plugin']:
                self.assertEqual(json.loads((output/directory/'plugin.json').read_text())['name'], 'narrated-tutorials')
            with self.assertRaisesRegex(ValueError, 'Output exists'):
                package_plugin(output)


class DoctorTests(unittest.TestCase):
    def test_resume_points_to_the_missing_input_then_browser_gate(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            self.assertEqual(authoring_stage(root)['stage'], 'AUTHOR_LESSON')
            (root / 'lesson.json').write_text(json.dumps({'sections': [{'id': 'one', 'audio': 'clip.wav', 'alignment': 'clip.json'}]}))
            self.assertEqual(len(authoring_stage(root)['missing_inputs']), 2)
            (root / 'clip.wav').write_bytes(b'input')
            (root / 'clip.json').write_text('{}')
            self.assertEqual(authoring_stage(root)['stage'], 'VALIDATE_LESSON')
            (root / 'site/content').mkdir(parents=True)
            (root / 'site/content/manifest.json').write_text('{}')
            self.assertEqual(authoring_stage(root)['stage'], 'BROWSER_VERIFICATION')


if __name__ == '__main__':
    unittest.main()
