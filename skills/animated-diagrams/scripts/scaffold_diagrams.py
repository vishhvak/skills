#!/usr/bin/env python3
"""Copy the five bundled diagrams into a fresh, independently runnable workspace."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import shlex
import shutil
import sys

from check_diagrams import EXAMPLES, QA_CHECKS, validate


STARTER = Path(__file__).resolve().parents[1] / "assets" / "starter"


def single_gallery(markup: str, example: str) -> str:
    """Restrict the generated gallery at the starter's stable catalog anchor."""
    catalog = re.search(r"(?ms)^const catalog = \[\n(?P<entries>(?:^  \{[^\n]*\},?\n)+)^\];", markup)
    if catalog is None:
        raise ValueError("Bundled gallery.js needs the documented const catalog declaration")
    entries = catalog.group("entries").splitlines(keepends=True)
    selected = next((entry for entry in entries if re.match(rf"^  \{{id:'{re.escape(example)}',", entry)), None)
    if selected is None:
        raise ValueError(f"Bundled gallery.js catalog has no entry for {example}")
    entry = selected if selected.endswith("\n") else selected + "\n"
    replacement = "const catalog = [\n" + entry + "];"
    markup = markup[:catalog.start()] + replacement + markup[catalog.end():]

    fallback = "  const item=catalog.find(item=>item.id===id)||catalog[0];"
    count = markup.count(fallback)
    if count != 1:
        raise ValueError("Bundled gallery.js needs the documented catalog fallback anchor")
    redirect = fallback + "\n  if(id && id!==item.id)history.replaceState(null,'',`#${item.id}`);"
    return markup.replace(fallback, redirect, 1)


def scaffold(output: Path, example: str = "nodes", single: bool = False) -> None:
    output = output.expanduser().absolute()
    if output.exists() or output.is_symlink():
        raise ValueError(f"Output already exists; choose a new directory: {output}")
    if example not in EXAMPLES:
        raise ValueError(f"Unknown example: {example}")
    errors, metadata, _ = validate(STARTER)
    if errors:
        raise ValueError("Bundled starter failed validation:\n" + "\n".join(errors))
    markup = (STARTER / "index.html").read_text()
    markup, count = re.subn(r'(<html\b[^>]*\bdata-example=)[\"\'][^\"\']*[\"\']', rf'\1"{example}"', markup, count=1)
    if count != 1:
        raise ValueError("Bundled index.html needs an explicit html data-example attribute")
    gallery = (STARTER / "gallery.js").read_text()
    if single:
        gallery = single_gallery(gallery, example)
    # mkdir is the final collision check, including another process creating output after validation.
    output.mkdir(parents=True, exist_ok=False)
    shutil.copytree(STARTER, output, dirs_exist_ok=True, ignore=shutil.ignore_patterns("__pycache__", ".DS_Store"))
    (output / "index.html").write_text(markup)
    if single:
        (output / "gallery.js").write_text(gallery)
    manifest = {
        "schemaVersion": 1,
        "selectedExample": example,
        "source": {"kind": "bundled studies", "references": "sources.json", "notes": "Original video files are not bundled. Model names and prices are demonstration data."},
        "scenes": {
            meta["id"]: {
                "duration": meta["duration"],
                "checks": {check: {"status": "pending", "evidence": ""} for check in QA_CHECKS},
            }
            for meta in metadata
        },
    }
    if single:
        manifest["shippedScenes"] = [example]
    (output / "diagram-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    qa = output / "verification"
    qa.mkdir(exist_ok=True)
    (qa / "qa.md").write_text(
        "# Diagram verification\n\n"
        "Status: browser QA pending.\n\n"
        "- Source and intended teaching outcome:\n"
        "- Viewport and browser:\n"
        "- Per-scene beginning, middle, end, and critical transition times/screenshots:\n"
        "- Actual interactions and observed outcomes:\n"
        "- Pause/resume, backward seek, Replay, resize, and browser error results:\n"
        "- Sound: source audibility, synthesized effect mappings, active/passive/transport silence, and listening evidence:\n"
        "- Reference comparison, observed mismatches, and timing uncertainty:\n\n"
        "Update each scene check in diagram-manifest.json with status and specific evidence. "
        "Keep screenshots and run notes in this workspace.\n"
    )
    script = Path(__file__).resolve().with_name("check_diagrams.py")
    print(f"CREATED: {output}")
    print(f"NEXT: python3 {shlex.quote(str(script))} --workspace {shlex.quote(str(output))}")
    print(f"SERVE: python3 {shlex.quote(str(output / 'serve.py'))} 8126")
    print(f"OPEN: http://127.0.0.1:8126/#{example}")
    print(f"RECORD: {output / 'verification' / 'qa.md'} and {output / 'diagram-manifest.json'}")
    print(f"FINISH: python3 {shlex.quote(str(script))} --workspace {shlex.quote(str(output))} --require-declared-qa")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True, help="New output directory; existing paths are refused")
    parser.add_argument("--example", choices=EXAMPLES, default="nodes")
    parser.add_argument("--single", action="store_true", help="Expose and QA only the selected example while retaining all bundled resources")
    args = parser.parse_args()
    try:
        scaffold(args.output, args.example, args.single)
    except (OSError, ValueError) as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
