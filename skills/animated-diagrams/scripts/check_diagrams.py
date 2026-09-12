#!/usr/bin/env python3
"""Check resources and declared QA completeness; this does not certify visual or sound parity."""

from __future__ import annotations

import argparse
from html.parser import HTMLParser
import json
import math
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
from urllib.parse import unquote, urlsplit


EXAMPLES = ("blog", "nodes", "models", "registry", "editor")
SOUND_KINDS = ("silent", "reference-effects")
# The runtime module is authoritative. An empty fallback fails closed when Node
# cannot import it, so an audible manifest cannot pass with unverified voices.
SOUND_VOICES: tuple[str, ...] = ()
SOUND_MEDIA_FIELDS = {
    "track", "cues", "media", "mediaurl", "media_url", "url", "src",
    "source", "audio", "audiourl", "audio_url",
}
REQUIRED = (
    "index.html", "gallery.js", "gallery.css", "serve.py",
    "sources.json", "fonts/CommitMono-Variable.woff2", "fonts/OFL.txt",
    "sound.js", "sound-events.js", "sfx-voices.js", "sound.json",
    *(f"scenes/{name}.js" for name in EXAMPLES),
)
QA_CHECKS = (
    "beginning", "middle", "end", "critical-transition", "interaction",
    "pause-resume", "backward-seek", "replay", "resize", "browser-errors",
    "visual-tone", "activity-lighting", "sound",
)
IMPORT = re.compile(r"(?:\bfrom\s*|\bimport\s*\(?\s*)['\"]([^'\"]+)['\"]")
PRIVATE_PATH = re.compile(r"(?:/Users/|/home/|[A-Za-z]:\\Users\\)[^\s'\"<>]+")


class Resources(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.urls: list[str] = []
        self.example: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        fields = dict(attrs)
        if tag == "html":
            self.example = fields.get("data-example")
        for key in ("src", "href"):
            if fields.get(key):
                self.urls.append(fields[key])


def positive(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value > 0


def load_json(path: Path, errors: list[str]) -> object:
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError) as error:
        errors.append(f"{path.name}: {error}")
        return None


def local_resource(root: Path, owner: Path, url: str, errors: list[str]) -> None:
    if not url or url.startswith("#"):
        return
    parsed = urlsplit(url)
    if parsed.scheme or parsed.netloc:
        errors.append(f"{owner.relative_to(root)}: bundle resource locally: {url}")
        return
    relative = unquote(parsed.path)
    target = (owner.parent / relative).resolve()
    if relative.startswith("/") or not target.is_relative_to(root):
        errors.append(f"{owner.relative_to(root)}: resource must stay inside workspace: {url}")
    elif not target.is_file():
        errors.append(f"{owner.relative_to(root)}: missing resource {url}")


def inspect_modules(root: Path, files: list[Path], errors: list[str]) -> list[dict]:
    node = shutil.which("node")
    if not node:
        errors.append("Node.js is required for JavaScript syntax and module checks; install it and rerun.")
        return []
    for file in files:
        result = subprocess.run([node, "--input-type=module", "--check"], input=file.read_text(), capture_output=True, text=True)
        if result.returncode:
            errors.append(f"{file.relative_to(root)}: JavaScript syntax failed: {result.stderr.strip()}")
    if errors:
        return []
    # A temporary module package makes .js imports work independently of a parent package.json.
    with tempfile.TemporaryDirectory(prefix="diagram-modules-") as directory:
        module_root = Path(directory)
        (module_root / "package.json").write_text('{"type":"module"}\n')
        for file in files:
            target = module_root / file.relative_to(root)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(file, target)
        probe = """
const metadata = [];
for (const id of JSON.parse(process.argv[1])) {
  const scene = await import(new URL(`./scenes/${id}.js`, process.argv[2]));
  if (typeof scene.mount !== 'function') throw new Error(`${id}: missing mount export`);
  metadata.push(scene.meta);
}
console.log('DIAGRAM_META:' + JSON.stringify(metadata));
"""
        try:
            result = subprocess.run(
                [node, "--input-type=module", "--eval", probe, json.dumps(EXAMPLES), module_root.as_uri() + "/"],
                capture_output=True, text=True, timeout=20,
            )
        except subprocess.TimeoutExpired:
            errors.append("Scene module imports exceeded 20 seconds; keep browser work inside mount().")
            return []
        if result.returncode:
            errors.append(f"Scene module imports failed: {result.stderr.strip()}")
            return []
        output = next((line.removeprefix("DIAGRAM_META:") for line in result.stdout.splitlines() if line.startswith("DIAGRAM_META:")), "[]")
        metadata = json.loads(output)
    for name, meta in zip(EXAMPLES, metadata):
        if not isinstance(meta, dict) or meta.get("id") != name:
            errors.append(f"scenes/{name}.js: meta.id must be {name}")
            continue
        if not positive(meta.get("duration")):
            errors.append(f"scenes/{name}.js: meta.duration must be finite and positive")
        box = meta.get("viewBox")
        if not isinstance(box, list) or len(box) != 2 or not all(positive(value) for value in box):
            errors.append(f"scenes/{name}.js: meta.viewBox must contain native width and height")
        if not all(isinstance(meta.get(key), str) and meta[key].strip() for key in ("title", "description")):
            errors.append(f"scenes/{name}.js: meta needs a title and description")
    return metadata


def inspect_sound_contract(root: Path, files: list[Path], errors: list[str]) -> tuple[set[str], set[str]]:
    """Load the sound module so JSON checks use its exported enums."""
    node = shutil.which("node")
    if not node:
        return set(SOUND_KINDS), set(SOUND_VOICES)
    with tempfile.TemporaryDirectory(prefix="diagram-sound-module-") as directory:
        module_root = Path(directory)
        (module_root / "package.json").write_text('{"type":"module"}\n')
        for file in files:
            target = module_root / file.relative_to(root)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(file, target)
        probe = """
const sound = await import(new URL('./sound.js', process.argv[1]));
const voiceModule = await import(new URL('./sfx-voices.js', process.argv[1]));
if (typeof sound.createSceneSound !== 'function') throw new Error('sound.js: missing createSceneSound export');
const engine = sound.createSceneSound();
for (const method of ['configure', 'play', 'prepare', 'pause', 'seek', 'effect', 'setEnabled', 'setVolume', 'destroy']) {
  if (typeof engine?.[method] !== 'function') throw new Error(`sound.js: createSceneSound missing ${method}() method`);
}
const kinds = sound.SOUND_KINDS;
if (!Array.isArray(kinds) || kinds.length === 0 || !kinds.every(kind => typeof kind === 'string' && kind.trim())) {
  throw new Error('sound.js: SOUND_KINDS must be a non-empty string array');
}
if (new Set(kinds).size !== kinds.length) throw new Error('sound.js: SOUND_KINDS must be unique');
if (new Set(kinds).size !== 2 || !kinds.includes('silent') || !kinds.includes('reference-effects')) {
  throw new Error('sound.js: SOUND_KINDS must contain silent and reference-effects');
}
const voices = sound.SOUND_VOICES;
if (!Array.isArray(voices) || voices.length === 0 || !voices.every(voice => typeof voice === 'string' && voice.trim())) {
  throw new Error('sound.js: SOUND_VOICES must be a non-empty string array');
}
if (new Set(voices).size !== voices.length) throw new Error('sound.js: SOUND_VOICES must be unique');
const synthVoices = voiceModule.SYNTH_VOICES;
if (!synthVoices || typeof synthVoices !== 'object' || Array.isArray(synthVoices)) {
  throw new Error('sfx-voices.js: SYNTH_VOICES must be a non-empty object');
}
const sourceVoices = Object.keys(synthVoices);
if (sourceVoices.length === 0 || !sourceVoices.every(voice => voice.trim())) {
  throw new Error('sfx-voices.js: SYNTH_VOICES must be a non-empty object with named voices');
}
if (JSON.stringify(voices) !== JSON.stringify(sourceVoices)) {
  throw new Error('sound.js: SOUND_VOICES must match Object.keys(sfx-voices.js SYNTH_VOICES)');
}
console.log('DIAGRAM_SOUND_CONTRACT:' + JSON.stringify({kinds, voices}));
"""
        try:
            result = subprocess.run(
                [node, "--input-type=module", "--eval", probe, module_root.as_uri() + "/"],
                capture_output=True, text=True, timeout=20,
            )
        except subprocess.TimeoutExpired:
            errors.append("Sound module import exceeded 20 seconds; keep browser work inside mount().")
            return set(SOUND_KINDS), set(SOUND_VOICES)
        if result.returncode:
            errors.append(f"sound.js: module import failed: {result.stderr.strip()}")
            return set(SOUND_KINDS), set(SOUND_VOICES)
        output = next((line.removeprefix("DIAGRAM_SOUND_CONTRACT:") for line in result.stdout.splitlines() if line.startswith("DIAGRAM_SOUND_CONTRACT:")), None)
        if output is None:
            errors.append("sound.js: module did not report SOUND_KINDS and SOUND_VOICES")
            return set(SOUND_KINDS), set(SOUND_VOICES)
        try:
            contract = json.loads(output)
        except ValueError as error:
            errors.append(f"sound.js: invalid SOUND_KINDS/SOUND_VOICES output: {error}")
            return set(SOUND_KINDS), set(SOUND_VOICES)
    if not isinstance(contract, dict):
        errors.append("sound.js: SOUND_KINDS/SOUND_VOICES output must be an object")
        return set(SOUND_KINDS), set(SOUND_VOICES)
    kinds = contract.get("kinds")
    voices = contract.get("voices")
    if not isinstance(kinds, list) or not isinstance(voices, list):
        errors.append("sound.js: SOUND_KINDS/SOUND_VOICES output must contain arrays")
        return set(SOUND_KINDS), set(SOUND_VOICES)
    return set(kinds), set(voices)


def inspect_sound_kinds(root: Path, files: list[Path], errors: list[str]) -> set[str]:
    """Compatibility wrapper returning only the runtime's exported kind set."""
    kinds, _voices = inspect_sound_contract(root, files, errors)
    return kinds


def check_sources(root: Path, metadata: list[dict], errors: list[str]) -> None:
    sources = load_json(root / "sources.json", errors)
    if not isinstance(sources, list):
        errors.append("sources.json: expected an array; use [] when there is no comparison video")
        return
    seen: set[str] = set()
    durations = {item["id"]: item["duration"] for item in metadata if isinstance(item, dict) and item.get("id") in EXAMPLES and positive(item.get("duration"))}
    for source in sources:
        if not isinstance(source, dict) or source.get("id") not in EXAMPLES or source["id"] in seen:
            errors.append("sources.json: each reference needs a unique known scene id")
            continue
        seen.add(source["id"])
        if not isinstance(source.get("file"), str) or not source["file"]:
            errors.append(f"sources.json: {source['id']} needs a local file")
        else:
            local_resource(root, root / "sources.json", source["file"], errors)
        if "duration" in source:
            duration = source["duration"]
            if not positive(duration):
                errors.append(f"sources.json: {source['id']} duration must be positive")
            elif source["id"] in durations and abs(duration - durations[source["id"]]) > 0.02:
                errors.append(f"sources.json: {source['id']} duration differs from meta.duration by more than 0.02s")


def check_sound(
    root: Path,
    _metadata: list[dict],
    sound_kinds: set[str],
    sound_voices: set[str],
    errors: list[str],
) -> None:
    sound = load_json(root / "sound.json", errors)
    if not isinstance(sound, dict):
        errors.append("sound.json: expected an object keyed by the five scene ids")
        return

    known = set(EXAMPLES)
    for name in sorted(set(sound) - known):
        errors.append(f"sound.json: unknown scene id {name}")
    for name in EXAMPLES:
        if name not in sound:
            errors.append(f"sound.json: missing scene entry {name}")

    kinds = sound_kinds or set(SOUND_KINDS)
    voices = sound_voices or set(SOUND_VOICES)
    for name in EXAMPLES:
        if name not in sound:
            continue
        scene = sound.get(name)
        if not isinstance(scene, dict):
            errors.append(f"sound.json: {name} must be an object")
            continue
        kind = scene.get("kind")
        if not isinstance(kind, str) or kind not in kinds:
            errors.append(f"sound.json: {name} has unknown kind {kind!r}; expected silent or reference-effects")
            continue
        if kind == "silent":
            extras = sorted(set(scene) - {"kind"})
            for field in extras:
                lowered = field.lower()
                if lowered in SOUND_MEDIA_FIELDS:
                    errors.append(
                        f"sound.json: {name} silent scene must not define {field}; "
                        "use exactly a kind field"
                    )
                else:
                    errors.append(f"sound.json: {name} silent scene has unexpected property {field}")
            continue
        extras = sorted(set(scene) - {"kind", "events"})
        for field in extras:
            lowered = field.lower()
            if lowered in SOUND_MEDIA_FIELDS:
                errors.append(
                    f"sound.json: {name} reference-effects scene must not define {field}; "
                    "map semantic events to synthesized voices instead"
                )
            else:
                errors.append(f"sound.json: {name} reference-effects scene has unexpected property {field}")
        events = scene.get("events")
        if not isinstance(events, dict) or not events:
            errors.append(f"sound.json: {name} reference-effects scene needs non-empty events")
            continue
        for event, voice in events.items():
            if not isinstance(event, str) or not event.strip():
                errors.append(f"sound.json: {name} event names must be non-empty semantic strings")
            if not isinstance(voice, str) or not voice.strip():
                errors.append(f"sound.json: {name} event {event!r} needs a non-empty voice name")
            elif voice not in voices:
                errors.append(f"sound.json: {name} event {event!r} uses unknown voice {voice!r}")


def check_shipped_scenes(manifest: dict, selected: str | None, errors: list[str]) -> tuple[str, ...]:
    """Return the browser-QA scope while rejecting malformed optional scope."""
    if "shippedScenes" not in manifest:
        return EXAMPLES
    shipped = manifest["shippedScenes"]
    if not isinstance(shipped, list):
        errors.append("diagram-manifest.json: shippedScenes must be a non-empty list of unique known scene ids")
        return ()
    if not shipped:
        errors.append("diagram-manifest.json: shippedScenes must be non-empty")
        return ()

    known = set(EXAMPLES)
    seen: set[str] = set()
    scope: list[str] = []
    for name in shipped:
        if not isinstance(name, str) or name not in known:
            errors.append(f"diagram-manifest.json: shippedScenes contains unknown scene id {name!r}")
            continue
        if name in seen:
            errors.append("diagram-manifest.json: shippedScenes must contain unique scene ids")
            continue
        seen.add(name)
        scope.append(name)
    if selected is not None and selected not in seen:
        errors.append("diagram-manifest.json: selectedExample must be included in shippedScenes")
    return tuple(scope)


def check_manifest(root: Path, metadata: list[dict], selected: str | None, errors: list[str], require_qa: bool) -> int:
    path = root / "diagram-manifest.json"
    if not path.exists():
        if require_qa:
            errors.append("diagram-manifest.json is required for --require-qa")
        return len(EXAMPLES) * len(QA_CHECKS)
    manifest = load_json(path, errors)
    if not isinstance(manifest, dict) or manifest.get("schemaVersion") != 1:
        errors.append("diagram-manifest.json: expected schemaVersion 1")
        return 0
    if manifest.get("selectedExample") != selected:
        errors.append("diagram-manifest.json: selectedExample must match index.html data-example")
    source = manifest.get("source")
    if not isinstance(source, dict) or not source.get("kind") or source.get("references") != "sources.json":
        errors.append("diagram-manifest.json: source needs a kind and references set to sources.json")
    scenes = manifest.get("scenes")
    if not isinstance(scenes, dict) or set(scenes) != set(EXAMPLES):
        errors.append("diagram-manifest.json: scenes must account for all five gallery entries")
        return 0
    shipped_scenes = set(check_shipped_scenes(manifest, selected, errors))
    pending = 0
    for name in EXAMPLES:
        scene = scenes[name]
        if not isinstance(scene, dict):
            errors.append(f"diagram-manifest.json: {name} must be an object")
            continue
        meta = next((item for item in metadata if isinstance(item, dict) and item.get("id") == name), None)
        if meta and scene.get("duration") != meta.get("duration"):
            errors.append(f"diagram-manifest.json: {name} duration must match meta.duration exactly")
        checks = scene.get("checks")
        if not isinstance(checks, dict) or set(checks) != set(QA_CHECKS):
            errors.append(f"diagram-manifest.json: {name} needs every browser check: {', '.join(QA_CHECKS)}")
            continue
        for label, record in checks.items():
            if not isinstance(record, dict) or record.get("status") not in {"pending", "pass", "fail", "blocked"}:
                errors.append(f"diagram-manifest.json: {name}/{label} has invalid status")
                continue
            evidence = record.get("evidence")
            if record["status"] == "pass" and (not isinstance(evidence, str) or not evidence.strip()):
                errors.append(f"diagram-manifest.json: {name}/{label} pass needs observed evidence")
            if record["status"] != "pass" and name in shipped_scenes:
                pending += 1
                if require_qa:
                    errors.append(f"Browser QA incomplete: {name}/{label} is {record['status']}")
    return pending


def validate(root: Path, require_qa: bool = False) -> tuple[list[str], list[dict], int]:
    root = root.resolve()
    errors: list[str] = []
    for name in REQUIRED:
        file = root / name
        if not file.is_file() or file.stat().st_size == 0:
            errors.append(f"Missing or empty required resource: {name}")
    if errors:
        return errors, [], 0
    files = sorted(root.rglob("*.js"))
    source_files = [root / "index.html", root / "gallery.css", root / "sources.json", root / "sound.json", *files]
    provenance = root / "audio/provenance.json"
    if provenance.is_file():
        source_files.append(provenance)
    for file in source_files:
        text = file.read_text()
        if PRIVATE_PATH.search(text):
            errors.append(f"{file.relative_to(root)}: remove private machine paths; keep provenance in workspace notes")
        if file.suffix == ".js":
            for resource in IMPORT.findall(text):
                local_resource(root, file, resource, errors)
    html = Resources()
    html.feed((root / "index.html").read_text())
    if html.example not in EXAMPLES:
        errors.append("index.html: data-example must name one of the five scenes")
    for resource in html.urls:
        local_resource(root, root / "index.html", resource, errors)
    for resource in re.findall(r"url\(\s*['\"]?([^)'\"]+)['\"]?\s*\)", (root / "gallery.css").read_text()):
        local_resource(root, root / "gallery.css", resource, errors)
    for name in EXAMPLES:
        scene = (root / f"scenes/{name}.js").read_text()
        if not ("<svg" in scene or "createElementNS" in scene or "mountDiagram" in scene):
            errors.append(f"scenes/{name}.js: expected native SVG geometry or the shared mountDiagram")
    metadata = inspect_modules(root, files, errors)
    check_sources(root, metadata, errors)
    sound_kinds, sound_voices = inspect_sound_contract(root, files, errors)
    check_sound(root, metadata, sound_kinds, sound_voices, errors)
    pending = check_manifest(root, metadata, html.example, errors, require_qa)
    return errors, metadata, pending


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, default=Path.cwd())
    parser.add_argument(
        "--require-declared-qa", "--require-qa", dest="require_qa", action="store_true",
        help="Require complete declared functional, visual, and sound QA records; does not certify perceptual parity",
    )
    args = parser.parse_args()
    try:
        errors, metadata, pending = validate(args.workspace, args.require_qa)
    except (OSError, ValueError) as error:
        errors, metadata, pending = [str(error)], [], 0
    if errors:
        print("FAIL\n" + "\n".join(f"- {error}" for error in errors), file=sys.stderr)
        return 1
    print(f"PASS (structural): {len(metadata)} scene modules, local resources, metadata, and reference manifest.")
    print(f"Declared QA completeness: {pending} checks pending, failed, or blocked." if pending else "Declared QA completeness: all scoped scene records contain a pass and evidence text.")
    print("This checker does not certify visual parity or perceptual sound parity. Inspect source-audio evidence and synthesized effects in the browser comparison, then quantify residual differences.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
