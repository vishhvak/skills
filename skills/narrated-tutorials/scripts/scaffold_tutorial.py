#!/usr/bin/env python3
"""Build a standalone narrated tutorial from a small JSON lesson spec.

The script copies the maintained effect-kit renderer into a new directory and
compiles authored sections into the renderer's content contract.  Validation
happens before the output directory is created, so a bad spec cannot partially
overwrite an existing project.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import math
import re
import shutil
import subprocess
import sys
from collections import OrderedDict
from pathlib import Path
from typing import Any
from urllib.parse import quote


TEMPLATE_FILES = (
    "app.js",
    "index.html",
    "styles.css",
    "demos.js",
    "demos.css",
    "code-stage.js",
    "code-stage.css",
    "cursor-motion.js",
    "cursor-visuals.js",
    "cursor.css",
    "cursor.png",
    "basics-demos.js",
    "basics-demos.css",
    "lesson-scenes.js",
    "lesson-scenes.css",
    "diagram-host.js",
    "serve.py",
    "fonts/CommitMono-Variable.woff2",
    "fonts/OFL.txt",
)
DEFAULT_TEMPLATE_DIR = Path(__file__).resolve().parents[1] / "assets" / "player"
SECTION_ID = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
KEY_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]*$")
WORD = re.compile(r"\S+")
ALLOWED_CURSOR_TYPES = {"hand", "pointer", "thumbsDown"}
SCENE_ITEM_KINDS = ("node", "card", "label")


class Diagnostics:
    """Collect every useful validation error before failing once."""

    def __init__(self) -> None:
        self.errors: list[str] = []

    def add(self, path: str, message: str) -> None:
        self.errors.append(f"{path}: {message}")

    @property
    def ok(self) -> bool:
        return not self.errors


def nonempty_string(value: Any, path: str, diagnostics: Diagnostics) -> str | None:
    if not isinstance(value, str) or not value.strip():
        diagnostics.add(path, "expected a non-empty string")
        return None
    return value.strip()


def optional_string(
    value: Any, path: str, diagnostics: Diagnostics, default: str = ""
) -> str:
    if value is None or value == "":
        return default
    if not isinstance(value, str) or not value.strip():
        diagnostics.add(path, "expected a string when provided")
        return default
    return value.strip()


def safe_id(value: Any, path: str, diagnostics: Diagnostics) -> str | None:
    result = nonempty_string(value, path, diagnostics)
    if result is not None and not SECTION_ID.fullmatch(result):
        diagnostics.add(
            path,
            "use lowercase letters, digits, and single hyphens for stable ids",
        )
    return result if result and SECTION_ID.fullmatch(result) else None


def key_id(value: Any, path: str, diagnostics: Diagnostics) -> str | None:
    result = nonempty_string(value, path, diagnostics)
    if result is not None and not KEY_ID.fullmatch(result):
        diagnostics.add(path, "use letters, digits, dots, colons, or hyphens")
    return result if result and KEY_ID.fullmatch(result) else None


def finite_number(value: Any, path: str, diagnostics: Diagnostics) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        diagnostics.add(path, "expected a finite number")
        return None
    result = float(value)
    if not math.isfinite(result):
        diagnostics.add(path, "expected a finite number")
        return None
    return result


def integer(value: Any, path: str, diagnostics: Diagnostics) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int):
        diagnostics.add(path, "expected an integer")
        return None
    return value


def load_json(path: Path, label: str, diagnostics: Diagnostics) -> Any | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except OSError as error:
        diagnostics.add(label, f"could not read {path}: {error}")
    except json.JSONDecodeError as error:
        diagnostics.add(label, f"invalid JSON at line {error.lineno}, column {error.colno}")
    return None


def resolve_input_path(
    value: Any,
    lesson_path: Path,
    path: str,
    diagnostics: Diagnostics,
) -> Path | None:
    raw = nonempty_string(value, path, diagnostics)
    if raw is None:
        return None
    source = Path(raw).expanduser()
    if not source.is_absolute():
        source = lesson_path.parent / source
    source = source.resolve()
    if not source.is_file():
        diagnostics.add(path, f"file does not exist: {source}")
        return None
    return source


def normalized_word(value: str) -> str:
    result = value.casefold()
    result = re.sub(r"^\W+|\W+$", "", result, flags=re.UNICODE)
    return result


def words_in(text: str) -> list[str]:
    return WORD.findall(text)


def first_difference(expected: list[str], actual: list[str]) -> str:
    limit = min(len(expected), len(actual))
    for index in range(limit):
        if normalized_word(expected[index]) != normalized_word(actual[index]):
            return (
                f"word {index + 1} is {actual[index]!r}, "
                f"authored text has {expected[index]!r}"
            )
    if len(expected) != len(actual):
        return f"word count is {len(actual)}, authored text has {len(expected)}"
    return "word sequence differs"


def authored_word_timings(
    text: str,
    alignment: Any,
    section_path: str,
    diagnostics: Diagnostics,
) -> list[dict[str, Any]] | None:
    if not isinstance(alignment, dict):
        diagnostics.add(f"{section_path}.alignment", "expected a JSON object")
        return None

    raw_timings = alignment.get("wordTimings")
    if not isinstance(raw_timings, list) or not raw_timings:
        diagnostics.add(
            f"{section_path}.alignment.wordTimings",
            "must be a non-empty list from the real alignment output",
        )
        return None

    timed: list[tuple[str, float, float]] = []
    previous_start = -math.inf
    previous_end = -math.inf
    for index, item in enumerate(raw_timings):
        item_path = f"{section_path}.alignment.wordTimings[{index}]"
        if not isinstance(item, dict):
            diagnostics.add(item_path, "expected {word,start,end}")
            continue
        word = nonempty_string(item.get("word"), f"{item_path}.word", diagnostics)
        start = finite_number(item.get("start"), f"{item_path}.start", diagnostics)
        end = finite_number(item.get("end"), f"{item_path}.end", diagnostics)
        if start is not None and start < 0:
            diagnostics.add(f"{item_path}.start", "must be >= 0")
        if end is not None and start is not None and end <= start:
            diagnostics.add(f"{item_path}.end", "must be greater than start")
        if start is not None and start < previous_start:
            diagnostics.add(item_path, "start times must be non-decreasing")
        if end is not None and end < previous_end:
            diagnostics.add(item_path, "end times must be non-decreasing")
        if start is not None:
            previous_start = start
        if end is not None:
            previous_end = end
        if word is not None and start is not None and end is not None:
            timed.append((word, start, end))

    authored = words_in(text)
    aligned_words = [word for word, _start, _end in timed]
    if len(authored) != len(aligned_words):
        diagnostics.add(
            f"{section_path}.alignment",
            "word count does not match authored text: "
            f"alignment has {len(aligned_words)}, authored text has {len(authored)}; "
            "regenerate alignment after fixing the narration",
        )
    elif any(
        normalized_word(expected) != normalized_word(actual)
        for expected, actual in zip(authored, aligned_words)
    ):
        diagnostics.add(
            f"{section_path}.alignment",
            "word sequence does not match authored text: "
            f"{first_difference(authored, aligned_words)}; "
            "regenerate alignment instead of replacing the transcript silently",
        )

    alignment_text = alignment.get("text")
    if isinstance(alignment_text, str):
        alignment_words = words_in(alignment_text)
        if len(authored) != len(alignment_words) or any(
            normalized_word(expected) != normalized_word(actual)
            for expected, actual in zip(authored, alignment_words)
        ):
            diagnostics.add(
                f"{section_path}.alignment.text",
                "does not match authored text; regenerate alignment instead of "
                "silently changing the lesson",
            )

    if diagnostics.errors and not timed:
        return None
    if len(authored) != len(timed) or len(authored) != len(aligned_words):
        return None

    matches = list(WORD.finditer(text))
    result: list[dict[str, Any]] = []
    for index, (authored_word, (_aligned, start, end)) in enumerate(
        zip(authored, timed)
    ):
        entry: dict[str, Any] = {
            "word": authored_word,
            "start": start,
            "end": end,
        }
        if index and "\n\n" in text[matches[index - 1].end() : matches[index].start()]:
            entry["paragraphBreak"] = True
        result.append(entry)
    return result


def token_list(
    line: dict[str, Any],
    line_path: str,
    diagnostics: Diagnostics,
) -> tuple[str, list[dict[str, Any]], dict[str, Any]] | None:
    text_value = line.get("text")
    raw_tokens = line.get("tokens")
    if text_value is not None and not isinstance(text_value, str):
        diagnostics.add(f"{line_path}.text", "expected a string")
        return None
    if raw_tokens is None:
        if not isinstance(text_value, str):
            diagnostics.add(line_path, "requires text when tokens are omitted")
            return None
        raw_tokens = [{"text": text_value, "type": "default", "color": "#E1E4E8"}]
    if not isinstance(raw_tokens, list) or not raw_tokens:
        diagnostics.add(f"{line_path}.tokens", "must be a non-empty list")
        return None

    tokens: list[dict[str, Any]] = []
    for index, raw_token in enumerate(raw_tokens):
        token_path = f"{line_path}.tokens[{index}]"
        if not isinstance(raw_token, dict):
            diagnostics.add(token_path, "expected an object with text")
            continue
        token_text = raw_token.get("text")
        if not isinstance(token_text, str):
            diagnostics.add(f"{token_path}.text", "expected a string")
            continue
        token: dict[str, Any] = {"text": token_text}
        for key in ("type", "color"):
            if key in raw_token:
                if not isinstance(raw_token[key], str):
                    diagnostics.add(f"{token_path}.{key}", "expected a string")
                else:
                    token[key] = raw_token[key]
        tokens.append(token)

    joined = "".join(token["text"] for token in tokens)
    if text_value is None:
        text_value = joined
    if isinstance(text_value, str) and joined != text_value:
        diagnostics.add(
            line_path,
            f"tokens join to {joined!r}, which differs from text {text_value!r}",
        )
    props: dict[str, Any] = {}
    for key in ("inline", "animateEntry", "crossfade"):
        if key in line:
            value = line[key]
            if key == "inline":
                if not isinstance(value, str):
                    diagnostics.add(f"{line_path}.{key}", "expected a string")
                else:
                    props[key] = value
            elif not isinstance(value, bool):
                diagnostics.add(f"{line_path}.{key}", "expected a boolean")
            else:
                props[key] = value
    part_id = key_id(line.get("partId", "p0"), f"{line_path}.partId", diagnostics)
    if part_id is None:
        return None
    return text_value, tokens, {"partId": part_id, **props}


def frame_lines(
    frame: dict[str, Any],
    frame_path: str,
    diagnostics: Diagnostics,
) -> list[dict[str, Any]]:
    raw_lines = frame.get("lines")
    if not isinstance(raw_lines, list):
        diagnostics.add(f"{frame_path}.lines", "must be a list, including [] to clear the stage")
        return []

    result: list[dict[str, Any]] = []
    seen: set[str] = set()
    for index, raw_line in enumerate(raw_lines):
        line_path = f"{frame_path}.lines[{index}]"
        if not isinstance(raw_line, dict):
            diagnostics.add(line_path, "expected an object with id and text")
            continue
        line_id = key_id(raw_line.get("id"), f"{line_path}.id", diagnostics)
        if line_id is None:
            continue
        if line_id in seen:
            diagnostics.add(line_path, f"duplicate line id {line_id!r} in one frame")
            continue
        seen.add(line_id)
        parsed = token_list(raw_line, line_path, diagnostics)
        if parsed is None:
            continue
        text_value, tokens, props = parsed
        result.append(
            {
                "id": line_id,
                "text": text_value,
                "tokens": tokens,
                "props": props,
                "entering": raw_line.get("entering", False),
                "dimmed": raw_line.get("dimmed", False),
                "background": raw_line.get("background"),
            }
        )
        if not isinstance(result[-1]["entering"], bool):
            diagnostics.add(f"{line_path}.entering", "expected a boolean")
        if not isinstance(result[-1]["dimmed"], bool):
            diagnostics.add(f"{line_path}.dimmed", "expected a boolean")
        if result[-1]["background"] is not None and not isinstance(
            result[-1]["background"], str
        ):
            diagnostics.add(f"{line_path}.background", "expected a string")
    return result


def line_range(
    value: Any,
    path: str,
    line_index: dict[str, int],
    line_text: dict[str, str],
    diagnostics: Diagnostics,
) -> tuple[str, int, int] | None:
    if not isinstance(value, dict):
        diagnostics.add(path, "expected {lineId,start,end}")
        return None
    line_id = key_id(value.get("lineId"), f"{path}.lineId", diagnostics)
    start = integer(value.get("start"), f"{path}.start", diagnostics)
    end = integer(value.get("end"), f"{path}.end", diagnostics)
    if line_id is None or start is None or end is None:
        return None
    if line_id not in line_index:
        diagnostics.add(f"{path}.lineId", f"line {line_id!r} is not visible in this frame")
        return None
    if start < 0 or end <= start or end > len(line_text[line_id]):
        diagnostics.add(
            path,
            f"range [{start}, {end}) is outside line {line_id!r} length "
            f"{len(line_text[line_id])}",
        )
        return None
    return line_id, start, end


def compile_decorations(
    frame: dict[str, Any],
    frame_path: str,
    field: str,
    line_index: dict[str, int],
    line_text: dict[str, str],
    diagnostics: Diagnostics,
) -> list[dict[str, Any]]:
    raw_values = frame.get(field, [])
    if raw_values is None:
        return []
    if not isinstance(raw_values, list):
        diagnostics.add(f"{frame_path}.{field}", "must be a list")
        return []
    result: list[dict[str, Any]] = []
    for index, value in enumerate(raw_values):
        parsed = line_range(
            value,
            f"{frame_path}.{field}[{index}]",
            line_index,
            line_text,
            diagnostics,
        )
        if parsed is None:
            continue
        line_id, start, end = parsed
        item: dict[str, Any] = {
            "lineIndex": line_index[line_id],
            "start": start,
            "end": end,
        }
        if isinstance(value, dict) and "color" in value:
            if not isinstance(value["color"], str):
                diagnostics.add(
                    f"{frame_path}.{field}[{index}].color", "expected a string"
                )
            else:
                item["color"] = value["color"]
        result.append(item)
    return result


def frame_time(
    frame: dict[str, Any],
    frame_path: str,
    word_timings: list[dict[str, Any]],
    diagnostics: Diagnostics,
) -> float | None:
    has_word = "atWord" in frame
    has_time = "time" in frame
    if has_word == has_time:
        diagnostics.add(
            frame_path,
            "provide exactly one cue: atWord (mapped to real wordTimings) or time",
        )
        return None
    if has_time:
        result = finite_number(frame.get("time"), f"{frame_path}.time", diagnostics)
        if result is not None and result < 0:
            diagnostics.add(f"{frame_path}.time", "must be >= 0")
        return result

    at_word = nonempty_string(frame.get("atWord"), f"{frame_path}.atWord", diagnostics)
    nth_value = frame.get("nth", 1)
    nth = integer(nth_value, f"{frame_path}.nth", diagnostics)
    if nth is not None and nth < 1:
        diagnostics.add(f"{frame_path}.nth", "is 1-based and must be >= 1")
    if at_word is None or nth is None or nth < 1:
        return None
    matches = [
        item
        for item in word_timings
        if (
            normalized_word(at_word)
            and normalized_word(str(item["word"])) == normalized_word(at_word)
        )
        or (not normalized_word(at_word) and str(item["word"]) == at_word)
    ]
    if len(matches) < nth:
        diagnostics.add(
            f"{frame_path}.atWord",
            f"word {at_word!r} occurrence {nth} is missing from supplied wordTimings",
        )
        return None
    return float(matches[nth - 1]["start"])


def compile_diagram(
    raw_diagram: Any,
    section_path: str,
    word_timings: list[dict[str, Any]],
    lesson_path: Path,
    chapter_id: str,
    section_id: str,
    diagnostics: Diagnostics,
) -> tuple[dict[str, Any] | None, dict[str, Path] | None]:
    """Validate an authored diagram module without importing or executing it."""

    diagram_path = f"{section_path}.diagram"
    if not isinstance(raw_diagram, dict):
        diagnostics.add(
            diagram_path, "expected an object with directory, entry, and cues"
        )
        return None, None

    raw_directory = nonempty_string(
        raw_diagram.get("directory"), f"{diagram_path}.directory", diagnostics
    )
    raw_entry = nonempty_string(
        raw_diagram.get("entry"), f"{diagram_path}.entry", diagnostics
    )
    source_directory: Path | None = None
    entry_relative: Path | None = None

    if raw_directory is not None:
        unresolved_directory = Path(raw_directory).expanduser()
        if not unresolved_directory.is_absolute():
            unresolved_directory = lesson_path.parent / unresolved_directory
        if unresolved_directory.is_symlink():
            diagnostics.add(f"{diagram_path}.directory", "must not be a symlink")
        else:
            try:
                source_directory = unresolved_directory.resolve(strict=True)
            except OSError as error:
                diagnostics.add(
                    f"{diagram_path}.directory",
                    f"directory does not exist: {unresolved_directory} ({error})",
                )
            else:
                if not source_directory.is_dir():
                    diagnostics.add(
                        f"{diagram_path}.directory",
                        f"expected a directory: {source_directory}",
                    )
                    source_directory = None

    if raw_entry is not None:
        entry_relative = Path(raw_entry)
        if (
            entry_relative.is_absolute()
            or ".." in entry_relative.parts
            or entry_relative.suffix.lower() not in {".js", ".mjs"}
        ):
            diagnostics.add(
                f"{diagram_path}.entry",
                "must be a relative .js or .mjs path within the diagram directory",
            )
            entry_relative = None

    if source_directory is not None:
        try:
            members = list(source_directory.rglob("*"))
        except OSError as error:
            diagnostics.add(
                f"{diagram_path}.directory", f"could not inspect directory: {error}"
            )
            members = []
            source_directory = None
        for member in members:
            member_label = (
                f"{diagram_path}.directory/{member.relative_to(source_directory)}"
            )
            if member.is_symlink():
                diagnostics.add(
                    member_label, "symlinks are not allowed in diagram directories"
                )
            elif not member.is_dir() and not member.is_file():
                diagnostics.add(member_label, "only regular files and directories are allowed")

    if source_directory is not None and entry_relative is not None:
        entry_path = source_directory / entry_relative
        try:
            resolved_entry = entry_path.resolve(strict=True)
            resolved_entry.relative_to(source_directory)
        except (OSError, ValueError):
            diagnostics.add(
                f"{diagram_path}.entry",
                "entry file does not exist within the diagram directory: "
                f"{entry_relative.as_posix()}",
            )
            entry_relative = None
        else:
            if not resolved_entry.is_file() or entry_path.is_symlink():
                diagnostics.add(
                    f"{diagram_path}.entry", "entry must be a regular file"
                )
                entry_relative = None

    raw_cues = raw_diagram.get("cues")
    cues: list[dict[str, Any]] = []
    if not isinstance(raw_cues, list):
        diagnostics.add(f"{diagram_path}.cues", "must be a list")
    else:
        cue_ids: set[str] = set()
        previous_time = -math.inf
        for cue_index, raw_cue in enumerate(raw_cues):
            cue_path = f"{diagram_path}.cues[{cue_index}]"
            if not isinstance(raw_cue, dict):
                diagnostics.add(cue_path, "expected an object with id and one cue")
                continue
            cue_id = key_id(raw_cue.get("id"), f"{cue_path}.id", diagnostics)
            cue_time = frame_time(raw_cue, cue_path, word_timings, diagnostics)
            if cue_id is not None:
                if cue_id in cue_ids:
                    diagnostics.add(f"{cue_path}.id", f"duplicate cue id {cue_id!r}")
                cue_ids.add(cue_id)
            if cue_time is not None:
                if cue_time <= previous_time:
                    diagnostics.add(cue_path, "cue times must be strictly increasing")
                previous_time = cue_time
            if cue_id is not None and cue_time is not None:
                cues.append({"id": cue_id, "time": cue_time})

    if source_directory is None or entry_relative is None:
        return None, None
    encoded_entry = quote(entry_relative.as_posix(), safe="/")
    module_path = f"/diagrams/{chapter_id}/{section_id}/{encoded_entry}"
    return (
        {"module": module_path, "cues": cues},
        {
            "source": source_directory,
            "target": Path("diagrams") / chapter_id / section_id,
        },
    )


def compile_frames(
    raw_frames: Any,
    section_path: str,
    word_timings: list[dict[str, Any]],
    diagnostics: Diagnostics,
) -> tuple[list[float], dict[str, Any], list[dict[str, Any]], str]:
    if raw_frames is None:
        raw_frames = []
    if not isinstance(raw_frames, list):
        diagnostics.add(f"{section_path}.frames", "must be a list")
        return [], {"lines": {}}, [], ""

    line_templates: OrderedDict[str, dict[str, Any]] = OrderedDict()
    frame_records: list[tuple[float | None, list[dict[str, Any]], dict[str, Any]]] = []
    for frame_index, raw_frame in enumerate(raw_frames):
        frame_path = f"{section_path}.frames[{frame_index}]"
        if not isinstance(raw_frame, dict):
            diagnostics.add(frame_path, "expected an object")
            continue
        cue = frame_time(raw_frame, frame_path, word_timings, diagnostics)
        lines = frame_lines(raw_frame, frame_path, diagnostics)
        line_index = {line["id"]: index for index, line in enumerate(lines)}
        line_text = {line["id"]: line["text"] for line in lines}
        for line in lines:
            line_id = line["id"]
            props = line["props"]
            template = line_templates.setdefault(
                line_id,
                {
                    "partId": props["partId"],
                    "props": props,
                    "variants": OrderedDict(),
                },
            )
            if template["partId"] != props["partId"]:
                diagnostics.add(
                    f"{frame_path}.lines[{line_index[line_id]}].partId",
                    f"line {line_id!r} changed part id from {template['partId']!r}; "
                    "keep line and part ids stable",
                )
            stable_props = {key: value for key, value in props.items() if key != "partId"}
            template_props = {
                key: value for key, value in template["props"].items() if key != "partId"
            }
            if stable_props != template_props:
                diagnostics.add(
                    f"{frame_path}.lines[{line_index[line_id]}]",
                    f"line {line_id!r} changed part properties; keep inline, "
                    "animateEntry, and crossfade stable",
                )
            variant_key = json.dumps(
                line["tokens"], ensure_ascii=False, sort_keys=True, separators=(",", ":")
            )
            template["variants"].setdefault(variant_key, line["tokens"])

        spotlight = None
        raw_spotlight = raw_frame.get("spotlight")
        if raw_spotlight is not None:
            parsed = line_range(
                raw_spotlight,
                f"{frame_path}.spotlight",
                line_index,
                line_text,
                diagnostics,
            )
            if parsed is not None:
                line_id, start, end = parsed
                spotlight = {
                    "ranges": {
                        str(line_index[line_id]): [{"start": start, "end": end}]
                    },
                }
                if isinstance(raw_spotlight, dict) and "glow" in raw_spotlight:
                    if not isinstance(raw_spotlight["glow"], bool):
                        diagnostics.add(
                            f"{frame_path}.spotlight.glow", "expected a boolean"
                        )
                    else:
                        spotlight["glow"] = raw_spotlight["glow"]

        cursor = None
        raw_cursor = raw_frame.get("cursor")
        if raw_cursor is not None:
            parsed = line_range(
                raw_cursor,
                f"{frame_path}.cursor",
                line_index,
                line_text,
                diagnostics,
            )
            if parsed is not None:
                line_id, start, end = parsed
                cursor_type = "hand"
                if isinstance(raw_cursor, dict) and "type" in raw_cursor:
                    cursor_type = raw_cursor["type"]
                if cursor_type not in ALLOWED_CURSOR_TYPES:
                    diagnostics.add(
                        f"{frame_path}.cursor.type",
                        f"must be one of {sorted(ALLOWED_CURSOR_TYPES)}",
                    )
                else:
                    cursor = {
                        "lineIndex": line_index[line_id],
                        "charOffset": start,
                        "textLength": end - start,
                        "type": cursor_type,
                    }

        bursts: list[dict[str, Any]] = []
        raw_bursts = raw_frame.get("bursts", [])
        if raw_bursts is None:
            raw_bursts = []
        if not isinstance(raw_bursts, list):
            diagnostics.add(f"{frame_path}.bursts", "must be a list")
        else:
            for burst_index, raw_burst in enumerate(raw_bursts):
                burst_path = f"{frame_path}.bursts[{burst_index}]"
                parsed = line_range(
                    raw_burst,
                    burst_path,
                    line_index,
                    line_text,
                    diagnostics,
                )
                if parsed is None:
                    continue
                line_id, start, end = parsed
                emoji = raw_burst.get("emoji") if isinstance(raw_burst, dict) else None
                if isinstance(emoji, str) and emoji:
                    emoji_values = [emoji]
                elif isinstance(emoji, list) and emoji and all(
                    isinstance(value, str) and value for value in emoji
                ):
                    emoji_values = emoji
                else:
                    diagnostics.add(f"{burst_path}.emoji", "must be a non-empty string or list")
                    continue
                bursts.append(
                    {
                        "lineIndex": line_index[line_id],
                        "charOffset": start,
                        "textLength": end - start,
                        "emoji": emoji_values,
                    }
                )

        frame_state: dict[str, Any] = {}
        for line in lines:
            template = line_templates[line["id"]]
            variant_key = json.dumps(
                line["tokens"], ensure_ascii=False, sort_keys=True, separators=(",", ":")
            )
            variant_index = list(template["variants"]).index(variant_key)
            frame_state[line["id"]] = {
                "parts": {template["partId"]: f"v{variant_index}"},
            }
            if line["entering"]:
                frame_state[line["id"]]["entering"] = True
            if line["dimmed"]:
                frame_state[line["id"]]["dimmed"] = True
            if line["background"] is not None:
                frame_state[line["id"]]["background"] = line["background"]

        frame = {
            "id": frame_index,
            "lineOrder": [line["id"] for line in lines],
            "state": frame_state,
            "marks": compile_decorations(
                raw_frame,
                frame_path,
                "marks",
                line_index,
                line_text,
                diagnostics,
            ),
            "glows": compile_decorations(
                raw_frame,
                frame_path,
                "glows",
                line_index,
                line_text,
                diagnostics,
            ),
            "squiggles": compile_decorations(
                raw_frame,
                frame_path,
                "squiggles",
                line_index,
                line_text,
                diagnostics,
            ),
            "brightRanges": compile_decorations(
                raw_frame,
                frame_path,
                "brightRanges",
                line_index,
                line_text,
                diagnostics,
            ),
            "bursts": bursts,
        }
        if spotlight is not None:
            frame["spotlight"] = spotlight
        if cursor is not None:
            frame["cursor"] = cursor
        if "sound" in raw_frame:
            if not isinstance(raw_frame["sound"], str):
                diagnostics.add(f"{frame_path}.sound", "expected a string")
            else:
                frame["sound"] = raw_frame["sound"]
        frame_records.append((cue, lines, frame))

    previous: float | None = None
    for index, (cue, _lines, _frame) in enumerate(frame_records):
        if cue is None:
            continue
        if previous is not None and cue <= previous:
            diagnostics.add(
                f"{section_path}.frames[{index}]",
                "cue times must be strictly increasing so seeking selects one frame",
            )
        previous = cue

    template_lines: OrderedDict[str, Any] = OrderedDict()
    for line_id, template in line_templates.items():
        variants = list(template["variants"].items())
        first_tokens = variants[0][1] if variants else []
        part: dict[str, Any] = {"tokens": first_tokens}
        for key in ("inline", "animateEntry", "crossfade"):
            if key in template["props"]:
                part[key] = template["props"][key]
        if len(variants) > 1:
            part["versions"] = {f"v{index}": tokens for index, (_key, tokens) in enumerate(variants)}
        template_lines[line_id] = {
            "parts": {template["partId"]: part},
            "partOrder": [template["partId"]],
        }

    times = [cue for cue, _lines, _frame in frame_records if cue is not None]
    frames = [frame for _cue, _lines, frame in frame_records]
    final_lines = frame_records[-1][1] if frame_records else []
    final_code = "\n".join(line["text"] for line in final_lines)
    return times, {"lines": template_lines}, frames, final_code


def safe_scene_url(value: Any, path: str, diagnostics: Diagnostics) -> str | None:
    """Validate a URL that will be emitted into a generated scene.

    Scenes are authored locally, but cards and labels may still carry a link.
    Keep the same small URL vocabulary as course footer links and explicitly
    reject protocol-relative and executable URLs.
    """

    result = nonempty_string(value, path, diagnostics)
    if result is None:
        return None
    if result.startswith("//") or not (
        result.startswith("https://")
        or result.startswith("http://")
        or result.startswith("/")
        or result.startswith("#")
    ):
        diagnostics.add(
            path,
            "must start with https://, http://, /, or #; executable and "
            "protocol-relative URLs are not allowed",
        )
        return None
    return result


def scene_asset(
    value: Any,
    lesson_path: Path,
    chapter_id: str,
    path: str,
    diagnostics: Diagnostics,
    assets: OrderedDict[str, dict[str, Any]],
) -> dict[str, str] | None:
    """Resolve one local scene image and return its generated content URL."""

    alt = ""
    raw = value
    if isinstance(value, dict):
        raw = value.get("src", value.get("path"))
        alt_value = value.get("alt", "")
        if alt_value not in (None, ""):
            alt = optional_string(alt_value, f"{path}.alt", diagnostics)
    if not isinstance(raw, str) or not raw.strip():
        diagnostics.add(path, "expected a local image path or {src,path,alt}")
        return None
    raw = raw.strip()
    # A scene image is copied into content. It cannot be a remote resource or
    # a browser URL, even if it happens to use an otherwise permitted scheme.
    if raw.startswith("//") or re.match(r"^[A-Za-z][A-Za-z0-9+.-]*:", raw):
        diagnostics.add(
            path,
            "must be a local image path; remote, data, and executable URLs are "
            "not allowed",
        )
        return None
    lesson_root = lesson_path.parent.resolve()
    source = Path(raw).expanduser()
    if not source.is_absolute():
        source = lesson_root / source
    source = source.resolve()
    try:
        source.relative_to(lesson_root)
    except ValueError:
        diagnostics.add(
            path,
            f"asset escapes the lesson directory: {source}; use a path below "
            f"{lesson_root}",
        )
        return None
    if not source.is_file():
        diagnostics.add(path, f"file does not exist: {source}")
        return None
    try:
        digest = hashlib.sha256(source.read_bytes()).hexdigest()[:12]
    except OSError as error:
        diagnostics.add(path, f"could not read image {source}: {error}")
        return None
    basename = re.sub(r"[^A-Za-z0-9._-]+", "-", source.name).strip(".-") or "image"
    target = f"assets/{digest}-{basename}"
    assets.setdefault(
        str(source),
        {"source": source, "target": target},
    )
    return {
        "src": f"/content/{chapter_id}/{target}",
        "alt": alt,
    }


def scene_number(
    value: Any,
    path: str,
    diagnostics: Diagnostics,
    *,
    minimum: float | None = None,
    maximum: float | None = None,
    strictly_positive: bool = False,
) -> float | None:
    result = finite_number(value, path, diagnostics)
    if result is None:
        return None
    if minimum is not None and result < minimum:
        diagnostics.add(path, f"must be >= {minimum}")
    if maximum is not None and result > maximum:
        diagnostics.add(path, f"must be <= {maximum}")
    if strictly_positive and result <= 0:
        diagnostics.add(path, "must be greater than 0")
    return result


def scene_items(
    frame: dict[str, Any],
    frame_path: str,
    kind: str,
    raw_values: Any,
    lesson_path: Path,
    chapter_id: str,
    diagnostics: Diagnostics,
    assets: OrderedDict[str, dict[str, Any]],
    visible: dict[str, str],
    known_kinds: dict[str, str],
) -> list[dict[str, Any]]:
    if raw_values is None:
        return []
    if not isinstance(raw_values, list):
        diagnostics.add(
            f"{frame_path}.{kind}s",
            "must be a list; use [] to clear that visual layer",
        )
        return []
    result: list[dict[str, Any]] = []
    for index, raw_item in enumerate(raw_values):
        item_path = f"{frame_path}.{kind}s[{index}]"
        if not isinstance(raw_item, dict):
            diagnostics.add(item_path, "expected an object")
            continue
        item_id = key_id(raw_item.get("id"), f"{item_path}.id", diagnostics)
        if item_id is None:
            continue
        if item_id in visible:
            diagnostics.add(item_path, f"duplicate visual id {item_id!r} in one scene")
            continue
        prior_kind = known_kinds.get(item_id)
        if prior_kind is not None and prior_kind != kind:
            diagnostics.add(
                f"{item_path}.id",
                f"visual id {item_id!r} changed kind from {prior_kind} to {kind}",
            )
        known_kinds[item_id] = kind
        item: dict[str, Any] = {"id": item_id}

        if "position" in raw_item:
            position = raw_item["position"]
            if not isinstance(position, dict):
                diagnostics.add(f"{item_path}.position", "expected {x,y}")
            else:
                for coordinate in ("x", "y"):
                    if coordinate not in raw_item and coordinate in position:
                        raw_item = {**raw_item, coordinate: position[coordinate]}

        for field in (
            "label",
            "text",
            "title",
            "body",
            "description",
            "tone",
            "variant",
            "className",
        ):
            if field in raw_item:
                value = raw_item[field]
                if not isinstance(value, str):
                    diagnostics.add(f"{item_path}.{field}", "expected a string")
                elif value.strip() or field not in {"label", "text", "title", "body"}:
                    item[field] = value
        for field in ("x", "y"):
            if field in raw_item:
                value = scene_number(
                    raw_item[field],
                    f"{item_path}.{field}",
                    diagnostics,
                    minimum=0,
                    maximum=100,
                )
                if value is not None:
                    item[field] = value
        for field in ("width", "height"):
            if field in raw_item:
                value = scene_number(
                    raw_item[field],
                    f"{item_path}.{field}",
                    diagnostics,
                    minimum=0,
                    maximum=100,
                    strictly_positive=True,
                )
                if value is not None:
                    item[field] = value
        for field in ("rotation", "radius"):
            if field in raw_item:
                value = scene_number(raw_item[field], f"{item_path}.{field}", diagnostics)
                if value is not None:
                    item[field] = value
        if "opacity" in raw_item:
            value = scene_number(
                raw_item["opacity"],
                f"{item_path}.opacity",
                diagnostics,
                minimum=0,
                maximum=1,
            )
            if value is not None:
                item["opacity"] = value
        for field in ("hidden", "selected", "muted"):
            if field in raw_item:
                value = raw_item[field]
                if not isinstance(value, bool):
                    diagnostics.add(f"{item_path}.{field}", "expected a boolean")
                else:
                    item[field] = value
        for field in ("color", "background"):
            if field in raw_item:
                value = raw_item[field]
                if not isinstance(value, str):
                    diagnostics.add(f"{item_path}.{field}", "expected a string")
                else:
                    item[field] = value
        if "image" in raw_item or "imageSrc" in raw_item:
            image = raw_item.get("image", raw_item.get("imageSrc"))
            compiled = scene_asset(
                image,
                lesson_path,
                chapter_id,
                f"{item_path}.image",
                diagnostics,
                assets,
            )
            if compiled is not None:
                item["image"] = compiled
        if "url" in raw_item or "href" in raw_item:
            raw_url = raw_item.get("url", raw_item.get("href"))
            url = safe_scene_url(raw_url, f"{item_path}.url", diagnostics)
            if url is not None:
                item["url"] = url

        if kind == "label" and not any(
            field in item for field in ("text", "label", "title", "body")
        ):
            diagnostics.add(item_path, "text labels require text or label")
        if kind in {"node", "card"} and not any(
            field in item for field in ("text", "label", "title", "body", "description", "image")
        ):
            diagnostics.add(item_path, f"{kind}s require text, label, title, body, or image")
        visible[item_id] = kind
        result.append(item)
    return result


def scene_target(
    value: Any,
    path: str,
    visible: dict[str, str],
    diagnostics: Diagnostics,
) -> str | None:
    target = value
    if isinstance(value, dict):
        target = next(
            (value.get(key) for key in ("target", "id", "nodeId", "cardId", "labelId") if key in value),
            None,
        )
    target = key_id(target, f"{path}.target" if isinstance(value, dict) else path, diagnostics)
    if target is not None and target not in visible:
        diagnostics.add(path, f"visual target {target!r} is not visible in this scene")
        return None
    return target


def compile_scene_highlights(
    value: Any,
    path: str,
    visible: dict[str, str],
    diagnostics: Diagnostics,
) -> list[dict[str, Any]]:
    if value is None:
        return []
    values = value if isinstance(value, list) else [value]
    result: list[dict[str, Any]] = []
    for index, raw in enumerate(values):
        item_path = f"{path}[{index}]" if isinstance(value, list) else path
        target = scene_target(raw, item_path, visible, diagnostics)
        if target is None:
            continue
        item: dict[str, Any] = {"target": target}
        if isinstance(raw, dict) and "color" in raw:
            color = nonempty_string(raw["color"], f"{item_path}.color", diagnostics)
            if color is not None:
                item["color"] = color
        result.append(item)
    return result


def compile_scene_cursor(
    value: Any,
    path: str,
    visible: dict[str, str],
    diagnostics: Diagnostics,
) -> dict[str, Any] | None:
    if value is None:
        return None
    raw = {"target": value} if isinstance(value, str) else value
    if not isinstance(raw, dict):
        diagnostics.add(path, "expected a target id or {target,type}")
        return None
    target = scene_target(raw, path, visible, diagnostics) if any(
        key in raw for key in ("target", "id", "nodeId", "cardId", "labelId")
    ) else None
    if target is None and not ("x" in raw and "y" in raw):
        diagnostics.add(path, "requires a visible target or both x and y")
        return None
    cursor_type = raw.get("type", "pointer")
    if cursor_type not in ALLOWED_CURSOR_TYPES:
        diagnostics.add(f"{path}.type", f"must be one of {sorted(ALLOWED_CURSOR_TYPES)}")
        return None
    item: dict[str, Any] = {"type": cursor_type}
    if target is not None:
        item["target"] = target
    for field in ("x", "y"):
        if field in raw:
            value_number = scene_number(
                raw[field], f"{path}.{field}", diagnostics, minimum=0, maximum=100
            )
            if value_number is not None:
                item[field] = value_number
    return item


def compile_scene_emojis(
    value: Any,
    path: str,
    visible: dict[str, str],
    diagnostics: Diagnostics,
) -> list[dict[str, Any]]:
    if value is None:
        return []
    values = value if isinstance(value, list) else [value]
    result: list[dict[str, Any]] = []
    for index, raw in enumerate(values):
        item_path = f"{path}[{index}]" if isinstance(value, list) else path
        if isinstance(raw, str):
            emoji = nonempty_string(raw, item_path, diagnostics)
            target = None
        elif isinstance(raw, dict):
            emoji = nonempty_string(
                raw.get("value", raw.get("emoji", raw.get("text"))),
                f"{item_path}.emoji",
                diagnostics,
            )
            target = scene_target(raw, item_path, visible, diagnostics) if any(
                key in raw for key in ("target", "id", "nodeId", "cardId", "labelId")
            ) else None
        else:
            diagnostics.add(item_path, "expected an emoji string or {emoji,target}")
            continue
        if emoji is None:
            continue
        item: dict[str, Any] = {"value": emoji}
        if target is not None:
            item["target"] = target
        result.append(item)
    return result


def compile_scenes(
    raw_scenes: Any,
    section_path: str,
    word_timings: list[dict[str, Any]],
    lesson_path: Path,
    chapter_id: str,
    diagnostics: Diagnostics,
) -> tuple[list[float], list[dict[str, Any]], OrderedDict[str, dict[str, Any]]]:
    """Compile general visual snapshots without inventing timing."""

    if raw_scenes is None:
        return [], [], OrderedDict()
    if isinstance(raw_scenes, dict):
        if isinstance(raw_scenes.get("frames"), list):
            raw_scenes = raw_scenes["frames"]
        elif isinstance(raw_scenes.get("scenes"), list):
            raw_scenes = raw_scenes["scenes"]
        else:
            diagnostics.add(
                f"{section_path}.scenes",
                "expected a list of snapshots or an object with frames",
            )
            return [], [], OrderedDict()
    if not isinstance(raw_scenes, list):
        diagnostics.add(f"{section_path}.scenes", "must be a list")
        return [], [], OrderedDict()

    assets: OrderedDict[str, dict[str, Any]] = OrderedDict()
    frames: list[dict[str, Any]] = []
    records: list[tuple[float | None, dict[str, Any]]] = []
    known_kinds: dict[str, str] = {}
    for scene_index, raw_scene in enumerate(raw_scenes):
        scene_path = f"{section_path}.scenes[{scene_index}]"
        if not isinstance(raw_scene, dict):
            diagnostics.add(scene_path, "expected an object")
            continue
        cue = frame_time(raw_scene, scene_path, word_timings, diagnostics)
        visible: dict[str, str] = {}
        nodes = scene_items(
            raw_scene,
            scene_path,
            "node",
            raw_scene.get("nodes", []),
            lesson_path,
            chapter_id,
            diagnostics,
            assets,
            visible,
            known_kinds,
        )
        cards = scene_items(
            raw_scene,
            scene_path,
            "card",
            raw_scene.get("cards", []),
            lesson_path,
            chapter_id,
            diagnostics,
            assets,
            visible,
            known_kinds,
        )
        raw_labels = raw_scene.get("labels", raw_scene.get("textLabels", []))
        labels = scene_items(
            raw_scene,
            scene_path,
            "label",
            raw_labels,
            lesson_path,
            chapter_id,
            diagnostics,
            assets,
            visible,
            known_kinds,
        )

        raw_edges = raw_scene.get("edges", [])
        edges: list[dict[str, Any]] = []
        if raw_edges is None:
            raw_edges = []
        if not isinstance(raw_edges, list):
            diagnostics.add(f"{scene_path}.edges", "must be a list")
        else:
            for edge_index, raw_edge in enumerate(raw_edges):
                edge_path = f"{scene_path}.edges[{edge_index}]"
                if not isinstance(raw_edge, dict):
                    diagnostics.add(edge_path, "expected {from,to}")
                    continue
                source = raw_edge.get("from", raw_edge.get("source"))
                target = raw_edge.get("to", raw_edge.get("target"))
                source_id = scene_target(source, f"{edge_path}.from", visible, diagnostics)
                target_id = scene_target(target, f"{edge_path}.to", visible, diagnostics)
                if source_id is None or target_id is None:
                    continue
                edge: dict[str, Any] = {"from": source_id, "to": target_id}
                if "id" in raw_edge:
                    edge_id = key_id(raw_edge["id"], f"{edge_path}.id", diagnostics)
                    if edge_id is not None:
                        edge["id"] = edge_id
                for field in ("label", "text", "tone", "color", "style"):
                    if field in raw_edge:
                        value = raw_edge[field]
                        if not isinstance(value, str):
                            diagnostics.add(f"{edge_path}.{field}", "expected a string")
                        else:
                            edge[field] = value
                for field in ("dashed", "directed"):
                    if field in raw_edge:
                        value = raw_edge[field]
                        if not isinstance(value, bool):
                            diagnostics.add(f"{edge_path}.{field}", "expected a boolean")
                        else:
                            edge[field] = value
                edges.append(edge)

        highlight_value = raw_scene.get("highlights", raw_scene.get("highlight"))
        highlights = compile_scene_highlights(
            highlight_value,
            f"{scene_path}.highlight",
            visible,
            diagnostics,
        )
        cursor = compile_scene_cursor(
            raw_scene.get("cursor"), f"{scene_path}.cursor", visible, diagnostics
        )
        emoji_field = "emojis"
        if "emojis" in raw_scene:
            emoji_value = raw_scene["emojis"]
        elif "emoji" in raw_scene:
            emoji_field = "emoji"
            emoji_value = raw_scene["emoji"]
        else:
            emoji_field = "bursts"
            emoji_value = raw_scene.get("bursts")
        emojis = compile_scene_emojis(
            emoji_value,
            f"{scene_path}.{emoji_field}",
            visible,
            diagnostics,
        )
        frame: dict[str, Any] = {
            "id": scene_index,
            "nodes": nodes,
            "cards": cards,
            "labels": labels,
            "edges": edges,
            "highlights": highlights,
            "emojis": emojis,
        }
        if "bursts" in raw_scene:
            frame["bursts"] = emojis
        if cursor is not None:
            frame["cursor"] = cursor
        if "background" in raw_scene:
            background = raw_scene["background"]
            if not isinstance(background, str):
                diagnostics.add(f"{scene_path}.background", "expected a string")
            else:
                frame["background"] = background
        records.append((cue, frame))

    previous: float | None = None
    for index, (cue, _frame) in enumerate(records):
        if cue is None:
            continue
        if previous is not None and cue <= previous:
            diagnostics.add(
                f"{section_path}.scenes[{index}]",
                "cue times must be strictly increasing so seeking selects one scene",
            )
        previous = cue
    times = [cue for cue, _frame in records if cue is not None]
    frames = [frame for _cue, frame in records]
    return times, frames, assets


def validate_links(value: Any, path: str, diagnostics: Diagnostics) -> list[dict[str, str]]:
    if value is None:
        return []
    if not isinstance(value, list):
        diagnostics.add(path, "must be a list of {label,url} objects")
        return []
    result: list[dict[str, str]] = []
    for index, item in enumerate(value):
        item_path = f"{path}[{index}]"
        if not isinstance(item, dict):
            diagnostics.add(item_path, "expected an object")
            continue
        label = nonempty_string(item.get("label"), f"{item_path}.label", diagnostics)
        url = nonempty_string(item.get("url"), f"{item_path}.url", diagnostics)
        if url is not None and not (
            url.startswith("https://")
            or url.startswith("http://")
            or url.startswith("/")
            or url.startswith("#")
        ):
            diagnostics.add(
                f"{item_path}.url",
                "must start with https://, http://, /, or #",
            )
        if label is not None and url is not None:
            result.append({"label": label, "url": url})
    return result


def lesson_chapters(
    lesson: dict[str, Any], diagnostics: Diagnostics
) -> list[tuple[str, dict[str, Any]]]:
    """Normalize the one-chapter legacy shape and the course shape."""

    raw_chapters = lesson.get("chapters")
    if raw_chapters is not None:
        if not isinstance(raw_chapters, list) or not raw_chapters:
            diagnostics.add("chapters", "must be a non-empty list")
            return []
        result: list[tuple[str, dict[str, Any]]] = []
        for index, value in enumerate(raw_chapters):
            path = f"chapters[{index}]"
            if not isinstance(value, dict):
                diagnostics.add(path, "expected an object with sections")
                continue
            result.append((path, value))
        return result

    chapter = lesson.get("chapter")
    sections = lesson.get("sections")
    if not isinstance(chapter, dict):
        diagnostics.add("chapter", "expected an object")
        chapter = {}
    # Copy the legacy chapter before attaching sections so caller-owned JSON is
    # never mutated while validation is in progress.
    normalized = dict(chapter)
    normalized["sections"] = sections
    return [("chapter", normalized)]


def compile_chapter(
    chapter: dict[str, Any],
    chapter_path: str,
    chapter_index: int,
    lesson_path: Path,
    course_description: str,
    diagnostics: Diagnostics,
) -> dict[str, Any] | None:
    chapter_id = safe_id(chapter.get("id"), f"{chapter_path}.id", diagnostics)
    chapter_title = nonempty_string(
        chapter.get("title"), f"{chapter_path}.title", diagnostics
    )
    chapter_description = optional_string(
        chapter.get("description"),
        f"{chapter_path}.description",
        diagnostics,
        course_description,
    )
    group_id = safe_id(
        chapter.get("groupId", "main"), f"{chapter_path}.groupId", diagnostics
    )
    group_title = nonempty_string(
        chapter.get("groupTitle", chapter_title or "Lesson"),
        f"{chapter_path}.groupTitle",
        diagnostics,
    )
    raw_order = chapter.get("order", chapter_index + 1)
    order = integer(raw_order, f"{chapter_path}.order", diagnostics)
    if order is not None and order < 1:
        diagnostics.add(f"{chapter_path}.order", "must be >= 1")
    draft = chapter.get("draft", False)
    if not isinstance(draft, bool):
        diagnostics.add(f"{chapter_path}.draft", "expected a boolean")
        draft = False
    coming_soon = chapter.get("comingSoon", False)
    if not isinstance(coming_soon, bool):
        diagnostics.add(f"{chapter_path}.comingSoon", "expected a boolean")
        coming_soon = False
    topic = chapter.get("topic")
    if topic is not None and not isinstance(topic, str):
        diagnostics.add(f"{chapter_path}.topic", "expected a string when provided")
        topic = None

    sections = chapter.get("sections")
    if not isinstance(sections, list) or not sections:
        diagnostics.add(f"{chapter_path}.sections", "must be a non-empty list")
        sections = []
    section_ids: set[str] = set()
    compiled_sections: list[dict[str, Any]] = []
    groups: OrderedDict[str, dict[str, Any]] = OrderedDict()
    for section_index, section in enumerate(sections):
        section_path = f"{chapter_path}.sections[{section_index}]"
        if not isinstance(section, dict):
            diagnostics.add(section_path, "expected an object")
            continue
        section_id = safe_id(section.get("id"), f"{section_path}.id", diagnostics)
        title = nonempty_string(section.get("title"), f"{section_path}.title", diagnostics)
        text = nonempty_string(section.get("text"), f"{section_path}.text", diagnostics)
        audio_path = resolve_input_path(
            section.get("audio"), lesson_path, f"{section_path}.audio", diagnostics
        )
        alignment_path = resolve_input_path(
            section.get("alignment"), lesson_path, f"{section_path}.alignment", diagnostics
        )
        if section_id is not None:
            if section_id in section_ids:
                diagnostics.add(section_path, f"duplicate section id {section_id!r}")
            section_ids.add(section_id)
        if audio_path is not None and audio_path.suffix.lower() not in {
            ".webm",
            ".wav",
            ".wave",
        }:
            diagnostics.add(
                f"{section_path}.audio",
                "must be WebM or WAV; WAV is transcoded to WebM for seekable serving",
            )

        alignment = (
            load_json(alignment_path, f"{section_path}.alignment", diagnostics)
            if alignment_path is not None
            else None
        )
        word_timings = (
            authored_word_timings(text, alignment, section_path, diagnostics)
            if text is not None and alignment is not None
            else None
        )
        if word_timings is None:
            word_timings = []

        visual_modes = [
            field for field in ("frames", "scenes", "diagram") if field in section
        ]
        if len(visual_modes) > 1:
            diagnostics.add(
                section_path,
                "frames, scenes, and diagram are mutually exclusive visual modes",
            )

        step_times, template, frames, derived_code = compile_frames(
            section.get("frames", []), section_path, word_timings, diagnostics
        )
        scene_times, scene_frames, scene_assets = compile_scenes(
            section.get("scenes"),
            section_path,
            word_timings,
            lesson_path,
            chapter_id or "chapter",
            diagnostics,
        )
        diagram_data: dict[str, Any] | None = None
        diagram_asset: dict[str, Path] | None = None
        if "diagram" in section:
            diagram_data, diagram_asset = compile_diagram(
                section.get("diagram"),
                section_path,
                word_timings,
                lesson_path,
                chapter_id or "chapter",
                section_id or "section",
                diagnostics,
            )
        section_group_id = safe_id(
            section.get("groupId", group_id or "main"),
            f"{section_path}.groupId",
            diagnostics,
        )
        section_group_title = nonempty_string(
            section.get("groupTitle", group_title or chapter_title or "Lesson"),
            f"{section_path}.groupTitle",
            diagnostics,
        )
        if section_id is None or title is None or text is None or audio_path is None:
            continue
        actual_group_id = section_group_id or "main"
        actual_group_title = section_group_title or chapter_title or "Lesson"
        group = groups.setdefault(
            actual_group_id,
            {"id": actual_group_id, "title": actual_group_title, "sectionIds": []},
        )
        if group["title"] != actual_group_title:
            diagnostics.add(
                f"{section_path}.groupTitle",
                f"group {actual_group_id!r} changed title; keep group metadata stable",
            )
        data: dict[str, Any] = {
            "id": section_id,
            "title": title,
            "text": text,
            "code": section.get("code", derived_code),
            "contentHash": hashlib.sha256(text.encode("utf-8")).hexdigest()[:8],
            "groupId": actual_group_id,
            "groupTitle": actual_group_title,
            "isFirstInGroup": not group["sectionIds"],
            "wordTimings": word_timings,
            "stepTimes": step_times,
        }
        if not isinstance(data["code"], str):
            diagnostics.add(f"{section_path}.code", "expected a string when provided")
            data["code"] = ""
        if frames:
            data["slideshowData"] = {"template": template, "frames": frames}
        if "scenes" in section:
            data["sceneData"] = {
                "name": "LessonScene",
                "frames": scene_frames,
                "stepTimes": scene_times,
            }
            # Keep the short top-level form convenient for a router and for
            # authors inspecting generated JSON. Both forms are generated from
            # the same validated records.
            data["scenes"] = scene_frames
            data["sceneStepTimes"] = scene_times
        if diagram_data is not None:
            data["diagramData"] = diagram_data
        group["sectionIds"].append(section_id)
        compiled_sections.append(
            {
                "data": data,
                "audio": audio_path,
                "sectionId": section_id,
                "sceneAssets": list(scene_assets.values()),
                "diagramAssets": [diagram_asset] if diagram_asset is not None else [],
            }
        )

    if chapter_id is None or chapter_title is None:
        return None
    if not compiled_sections or len(compiled_sections) != len(section_ids):
        return None
    chapter_manifest: dict[str, Any] = {
        "id": chapter_id,
        "title": chapter_title,
        "description": chapter_description or "",
        "sections": [
            {"id": item["sectionId"], "file": f"{item['sectionId']}.json"}
            for item in compiled_sections
        ],
        "groups": list(groups.values()),
    }
    if order is not None:
        chapter_manifest["order"] = order
    if draft:
        chapter_manifest["draft"] = True
    if coming_soon:
        chapter_manifest["comingSoon"] = True
    if topic:
        chapter_manifest["topic"] = topic
    return {"manifest": chapter_manifest, "sections": compiled_sections}


def compile_lesson(
    lesson: Any,
    lesson_path: Path,
    diagnostics: Diagnostics,
) -> dict[str, Any] | None:
    if not isinstance(lesson, dict):
        diagnostics.add("lesson", "expected a JSON object")
        return None
    course = lesson.get("course")
    if not isinstance(course, dict):
        diagnostics.add("course", "expected an object")
        course = {}
    course_id = safe_id(course.get("id"), "course.id", diagnostics)
    course_title = nonempty_string(course.get("title"), "course.title", diagnostics)
    course_description = optional_string(
        course.get("description"), "course.description", diagnostics
    )
    brand = nonempty_string(
        course.get("brand", course_title or ""), "course.brand", diagnostics
    )
    wordmark = nonempty_string(
        course.get("wordmark", brand.upper() if brand else ""),
        "course.wordmark",
        diagnostics,
    )
    footer_label = nonempty_string(
        course.get("footerLabel", "LOCAL TUTORIAL"),
        "course.footerLabel",
        diagnostics,
    )
    footer_links = validate_links(
        course.get("footerLinks", []), "course.footerLinks", diagnostics
    )
    chapter_inputs = lesson_chapters(lesson, diagnostics)
    chapters: list[dict[str, Any]] = []
    chapter_ids: set[str] = set()
    for chapter_index, (chapter_path, chapter) in enumerate(chapter_inputs):
        compiled = compile_chapter(
            chapter,
            chapter_path,
            chapter_index,
            lesson_path,
            course_description,
            diagnostics,
        )
        if compiled is None:
            continue
        chapter_id = compiled["manifest"]["id"]
        if chapter_id in chapter_ids:
            diagnostics.add(f"{chapter_path}.id", f"duplicate chapter id {chapter_id!r}")
        chapter_ids.add(chapter_id)
        chapters.append(compiled)
    if (
        not diagnostics.ok
        or course_id is None
        or course_title is None
        or not chapters
        or len(chapters) != len(chapter_inputs)
    ):
        return None
    course_chapters: list[dict[str, Any]] = []
    for index, chapter in enumerate(chapters):
        summary: dict[str, Any] = {
            "id": chapter["manifest"]["id"],
            "title": chapter["manifest"]["title"],
            "description": chapter["manifest"].get("description", ""),
            "order": chapter["manifest"].get("order", index + 1),
            "draft": chapter["manifest"].get("draft", False),
            "comingSoon": chapter["manifest"].get("comingSoon", False),
            "sectionsCount": len(chapter["sections"]),
        }
        if "topic" in chapter["manifest"]:
            summary["topic"] = chapter["manifest"]["topic"]
        course_chapters.append(summary)
    course_manifest = {
        "id": course_id,
        "title": course_title,
        "description": course_description or "",
        "chapters": course_chapters,
    }
    config = {
        "courseId": course_id,
        "brand": brand or course_title,
        "wordmark": wordmark or (brand or course_title).upper(),
        "description": course_description or "",
        "footerLabel": footer_label or "LOCAL TUTORIAL",
        "footerLinks": footer_links,
    }
    return {"courseManifest": course_manifest, "chapters": chapters, "config": config}


def patch_runtime(output: Path, config: dict[str, Any], diagnostics: Diagnostics) -> None:
    app_path = output / "app.js"
    index_path = output / "index.html"
    try:
        app = app_path.read_text(encoding="utf-8")
        index = index_path.read_text(encoding="utf-8")
    except OSError as error:
        diagnostics.add("template", f"could not read copied runtime: {error}")
        return

    marker = 'const CONTENT = "/content";'
    if app.count(marker) != 1:
        diagnostics.add("template/app.js", "missing unique CONTENT marker")
    else:
        app = app.replace(
            marker,
            'const SITE_CONFIG = window.NARRATED_TUTORIAL_CONFIG || {};\n' + marker,
            1,
        )

    app = app.replace(
        'document.title = `${chapter.title} · effect.institute`;',
        'document.title = `${chapter.title} · ${SITE_CONFIG.brand || "Narrated tutorial"}`;',
    )
    app = app.replace(
        'document.title = "effect.institute";',
        'document.title = SITE_CONFIG.brand || "Narrated tutorial";',
    )
    app = app.replace(
        'const chars = Array.from("EFFECT INSTITUTE → EFFECT INSTITUTE → ");',
        'const badgeText = SITE_CONFIG.wordmark || "NARRATED TUTORIAL";\n'
        '  const chars = Array.from(`${badgeText} → ${badgeText} → `);',
    )
    app = app.replace(
        'char === " " ? "&nbsp;" : char',
        'char === " " ? "&nbsp;" : esc(char)',
    )
    app = app.replace(
        '<a class="setting-item" href="https://discord.com/channels/795981131316985866/1449050466464956416" target="_blank" rel="noopener noreferrer">${icon("chat")} Discord</a>',
        '<span class="setting-item">${icon("chat")} Local copy</span>',
    )

    feedback_start = "  const feedback = ["
    feedback_end = "  const ticker = feedback"
    if feedback_start in app and feedback_end in app:
        start = app.index(feedback_start)
        end = app.index(feedback_end, start)
        app = app[:start] + "  const feedback = [];\n" + app[end:]
    else:
        diagnostics.add("template/app.js", "missing feedback data marker")

    footer_start = '  document\n    .querySelectorAll(".footer-links")'
    footer_end = '  $("feedback-close").onclick'
    if footer_start in app and footer_end in app:
        start = app.index(footer_start)
        end = app.index(footer_end, start)
        footer_code = """  const footerMarkup = (SITE_CONFIG.footerLinks || [])
    .map(
      (item) =>
        `<a href=\"${esc(item.url)}\" target=\"_blank\" rel=\"noopener noreferrer\">${esc(item.label)}</a>`,
    )
    .join(\"\");
  document
    .querySelectorAll(\".footer-links\")
    .forEach((el) => (el.innerHTML = footerMarkup));
"""
        app = app[:start] + footer_code + app[end:]
    else:
        diagnostics.add("template/app.js", "missing footer data marker")

    # The empty testimonial ticker is replaced with a short course description.
    old_ticker = "  const ticker = feedback\n    .map(\n      ([id, text]) =>\n        `<span class=\"ticker-item\"><b>Feedback No. ${id}</b>${esc(text)}</span><span class=\"ticker-separator\">■</span>`,\n    )\n    .join(\"\");\n  $(\"ticker-track\").innerHTML = ticker + ticker;"
    new_ticker = """  const ticker = SITE_CONFIG.description
    ? `<span class=\"ticker-item\"><b>${esc(SITE_CONFIG.wordmark || \"COURSE\")}</b>${esc(SITE_CONFIG.description)}</span>`
    : \"\";
  $(\"ticker-track\").innerHTML = ticker + ticker;"""
    if old_ticker in app:
        app = app.replace(old_ticker, new_ticker, 1)
    else:
        diagnostics.add("template/app.js", "missing ticker data marker")

    app = app.replace("effect.institute", "narrated tutorial")
    try:
        app_path.write_text(app, encoding="utf-8")
    except OSError as error:
        diagnostics.add("output/app.js", f"could not write patched runtime: {error}")

    brand = html.escape(str(config["brand"]))
    wordmark = html.escape(str(config["wordmark"]))
    footer_label = html.escape(str(config["footerLabel"]))
    index = index.replace("<title>effect.institute</title>", f"<title>{brand}</title>", 1)
    if 'aria-label="Effect Institute"' not in index:
        diagnostics.add("template/index.html", "missing original brand label marker")
    else:
        index = index.replace('aria-label="Effect Institute"', f'aria-label="{brand}"', 1)
    index = re.sub(r"\n\s*<link rel=\"icon\"[^>]* />", "", index, count=1)
    index, count = re.subn(
        r'(<a class="wordmark"[^>]*>).*?(</a\s*>)',
        lambda match: f"{match.group(1)}{wordmark}{match.group(2)}",
        index,
        count=1,
        flags=re.DOTALL,
    )
    if count != 1:
        diagnostics.add("template/index.html", "missing wordmark marker")
    index, count = re.subn(
        r'<a\s+href="https://effect\.website"[^>]*>.*?</a\s*>',
        f'<span class="home-credit">{footer_label}</span>',
        index,
        count=1,
        flags=re.DOTALL,
    )
    if count != 1:
        diagnostics.add("template/index.html", "missing original footer marker")
    index = index.replace('aria-label="Learner feedback ticker"', 'aria-label="Course description"')
    # The maintained app's cache-busting hash changes. Match the stable path
    # and tolerate either a query string or no query string.
    app_script_pattern = re.compile(
        r'(?m)^[ \t]*<script\s+src="/app\.js(?:\?[^"<>]*)?"\s*></script>'
    )
    app_scripts = list(app_script_pattern.finditer(index))
    if len(app_scripts) != 1:
        diagnostics.add(
            "template/index.html",
            "missing unique app script marker (expected /app.js with any version)",
        )
    else:
        app_script = app_scripts[0].group(0)
        prefix = ''
        if not re.search(r'src="/site-config\.js(?:\?[^"<>]*)?"', index):
            prefix += '    <script src="/site-config.js"></script>\n'
        if not re.search(r'src="/lesson-scenes\.js(?:\?[^"<>]*)?"', index):
            prefix += '    <script src="/lesson-scenes.js"></script>\n'
        if not re.search(r'src="/diagram-host\.js(?:\?[^"<>]*)?"', index):
            prefix += '    <script src="/diagram-host.js"></script>\n'
        index = index.replace(app_script, prefix + app_script, 1)
    if not re.search(r'href="/lesson-scenes\.css(?:\?[^"<>]*)?"', index):
        head_marker = "</head>"
        if head_marker not in index:
            diagnostics.add("template/index.html", "missing </head> marker for scene CSS")
        else:
            index = index.replace(
                head_marker,
                '    <link rel="stylesheet" href="/lesson-scenes.css" />\n' + head_marker,
                1,
            )
    try:
        index_path.write_text(index, encoding="utf-8")
    except OSError as error:
        diagnostics.add("output/index.html", f"could not write patched shell: {error}")

    # Remove the source site's name from copied provenance comments as well as
    # user-visible strings. Renderer class names remain intentionally stable.
    for relative in TEMPLATE_FILES:
        if Path(relative).suffix not in {".js", ".css", ".html"}:
            continue
        path = output / relative
        try:
            source = path.read_text(encoding="utf-8")
            path.write_text(source.replace("effect.institute", "narrated tutorial"), encoding="utf-8")
        except OSError as error:
            diagnostics.add(f"output/{relative}", f"could not sanitize copied source: {error}")


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Scaffold a fresh narrated tutorial from a JSON lesson spec."
    )
    parser.add_argument("--lesson", required=True, type=Path, help="lesson JSON specification")
    parser.add_argument(
        "--output",
        type=Path,
        help="new output directory (required unless --check is used)",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="validate lesson, audio, cues, and scene assets without creating output",
    )
    parser.add_argument(
        "--template-dir",
        type=Path,
        default=DEFAULT_TEMPLATE_DIR,
        help="maintained player template directory (default: skill assets/player)",
    )
    parser.add_argument(
        "--ffmpeg",
        default="ffmpeg",
        help="ffmpeg executable used only when a section audio input is WAV",
    )
    parser.add_argument(
        "--ffprobe",
        default="ffprobe",
        help="ffprobe executable used to verify readable media and cue bounds",
    )
    return parser.parse_args(argv)


def template_root(template_path: Path) -> Path:
    """Accept either a player directory or the maintained effect-kit root."""

    candidate = template_path.expanduser().resolve()
    if not (candidate / "index.html").is_file() and (
        candidate / "assets" / "player"
    ).is_dir():
        return (candidate / "assets" / "player").resolve()
    return candidate


def validate_paths(
    lesson_path: Path,
    output_path: Path | None,
    template_path: Path,
    diagnostics: Diagnostics,
    *,
    check: bool = False,
) -> tuple[Path, Path | None, Path] | None:
    lesson_path = lesson_path.expanduser().resolve()
    output_path = output_path.expanduser().resolve() if output_path is not None else None
    template_path = template_root(template_path)
    if not lesson_path.is_file():
        diagnostics.add("--lesson", f"file does not exist: {lesson_path}")
    if not check and output_path is None:
        diagnostics.add("--output", "is required unless --check is used")
    if not template_path.is_dir():
        diagnostics.add(
            "--template-dir",
            f"template directory does not exist: {template_path}; pass a maintained player template explicitly",
        )
    if output_path is not None and (output_path.exists() or output_path.is_symlink()):
        diagnostics.add(
            "--output",
            f"refusing to overwrite existing path: {output_path}; choose a new directory",
        )
    if output_path is not None and (
        template_path == output_path or template_path in output_path.parents
    ):
        diagnostics.add(
            "--output",
            "must be outside --template-dir so the maintained renderer cannot be changed",
        )
    for relative in TEMPLATE_FILES:
        source = template_path / relative
        if not source.is_file():
            diagnostics.add(
                f"--template-dir/{relative}",
                f"required renderer asset is missing: {source}",
            )
    return (lesson_path, output_path, template_path) if diagnostics.ok else None


def copy_template(template_path: Path, output_path: Path, diagnostics: Diagnostics) -> bool:
    created = False
    try:
        output_path.mkdir(parents=True, exist_ok=False)
        created = True
        for relative in TEMPLATE_FILES:
            source = template_path / relative
            destination = output_path / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)
    except (OSError, shutil.Error) as error:
        diagnostics.add("output", f"could not copy renderer: {error}")
        if created:
            shutil.rmtree(output_path, ignore_errors=True)
        return False
    return True


def validate_audio_durations(
    chapters: list[dict[str, Any]],
    ffprobe: str,
    diagnostics: Diagnostics,
) -> None:
    """Require readable media and keep every authored cue inside its duration."""

    if not chapters:
        return
    if shutil.which(ffprobe) is None:
        diagnostics.add(
            "--ffprobe",
            f"executable {ffprobe!r} was not found; readable media validation is required",
        )
        return
    for chapter in chapters:
        chapter_id = chapter["manifest"]["id"]
        for item in chapter["sections"]:
            source: Path = item["audio"]
            section_id = item["sectionId"]
            label = f"{chapter_id}/{section_id}.audio"
            try:
                result = subprocess.run(
                    [
                        ffprobe,
                        "-v",
                        "error",
                        "-show_entries",
                        "format=duration",
                        "-of",
                        "default=noprint_wrappers=1:nokey=1",
                        str(source),
                    ],
                    capture_output=True,
                    text=True,
                    check=False,
                    timeout=15,
                )
            except (OSError, subprocess.SubprocessError) as error:
                diagnostics.add(label, f"could not inspect media: {error}")
                continue
            if result.returncode != 0:
                detail = result.stderr.strip() or f"exit status {result.returncode}"
                diagnostics.add(label, f"media is not readable by ffprobe: {detail}")
                continue
            try:
                duration = float(result.stdout.strip())
            except ValueError:
                duration = math.nan
            if not math.isfinite(duration) or duration <= 0:
                diagnostics.add(label, "media has no finite positive duration")
                continue
            data = item["data"]
            cue_values = [
                float(timing["end"])
                for timing in data.get("wordTimings", [])
                if isinstance(timing, dict) and isinstance(timing.get("end"), (int, float))
            ]
            cue_values.extend(
                float(value)
                for value in data.get("stepTimes", [])
                if isinstance(value, (int, float))
            )
            cue_values.extend(
                float(value)
                for value in data.get("sceneStepTimes", [])
                if isinstance(value, (int, float))
            )
            cue_values.extend(
                float(cue["time"])
                for cue in data.get("diagramData", {}).get("cues", [])
                if isinstance(cue, dict) and isinstance(cue.get("time"), (int, float))
            )
            last_cue = max(cue_values, default=0.0)
            if last_cue > duration + 0.1:
                diagnostics.add(
                    label,
                    f"last authored cue {last_cue:.3f}s exceeds media duration "
                    f"{duration:.3f}s (0.1s tolerance)",
                )


def validate_diagram_output_paths(
    chapters: list[dict[str, Any]],
    output_path: Path | None,
    diagnostics: Diagnostics,
) -> None:
    """Reject output locations that would be recursively copied as diagram assets."""

    if output_path is None:
        return
    for chapter in chapters:
        for item in chapter["sections"]:
            for asset in item.get("diagramAssets", []):
                source: Path = asset["source"]
                if source == output_path or source in output_path.parents:
                    diagnostics.add(
                        "--output",
                        f"must be outside diagram directory {source}",
                    )


def write_output(
    output_path: Path,
    course_manifest: dict[str, Any],
    chapters: list[dict[str, Any]],
    config: dict[str, Any],
    ffmpeg: str,
    diagnostics: Diagnostics,
) -> bool:
    try:
        content_path = output_path / "content"
        json_path = content_path / "manifest.json"
        content_path.mkdir(parents=True, exist_ok=True)
        json_path.write_text(
            json.dumps(course_manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        for chapter in chapters:
            chapter_manifest = chapter["manifest"]
            chapter_path = content_path / chapter_manifest["id"]
            chapter_path.mkdir(parents=True, exist_ok=True)
            (chapter_path / "manifest.json").write_text(
                json.dumps(chapter_manifest, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            for item in chapter["sections"]:
                section_id = item["sectionId"]
                data = item["data"]
                audio_source: Path = item["audio"]
                audio_target = chapter_path / f"{section_id}.webm"
                if audio_source.suffix.lower() == ".webm":
                    shutil.copy2(audio_source, audio_target)
                else:
                    if shutil.which(ffmpeg) is None:
                        raise RuntimeError(
                            f"WAV input {audio_source} requires ffmpeg, but {ffmpeg!r} was not found"
                        )
                    command = [
                        ffmpeg,
                        "-hide_banner",
                        "-loglevel",
                        "error",
                        "-y",
                        "-i",
                        str(audio_source),
                        "-vn",
                        "-c:a",
                        "libopus",
                        "-b:a",
                        "96k",
                        str(audio_target),
                    ]
                    result = subprocess.run(
                        command,
                        capture_output=True,
                        text=True,
                        check=False,
                        timeout=120,
                    )
                    if result.returncode != 0:
                        detail = result.stderr.strip() or f"exit status {result.returncode}"
                        raise RuntimeError(f"ffmpeg could not transcode {audio_source}: {detail}")
                data["audioFile"] = audio_target.name
                for asset in item.get("sceneAssets", []):
                    source: Path = asset["source"]
                    target = chapter_path / asset["target"]
                    try:
                        target.relative_to(chapter_path)
                    except ValueError as error:
                        raise RuntimeError(f"scene asset target escapes chapter content: {target}") from error
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(source, target)
                for asset in item.get("diagramAssets", []):
                    source = asset["source"]
                    target = output_path / asset["target"]
                    try:
                        target.relative_to(output_path / "diagrams")
                    except ValueError as error:
                        raise RuntimeError(
                            f"diagram asset target escapes output diagrams: {target}"
                        ) from error
                    shutil.copytree(source, target)
                (chapter_path / f"{section_id}.json").write_text(
                    json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
                )

        config_path = output_path / "site-config.js"
        config_json = json.dumps(config, ensure_ascii=False, indent=2)
        config_json = (
            config_json.replace("<", "\\u003c")
            .replace(">", "\\u003e")
            .replace("&", "\\u0026")
        )
        config_path.write_text(
            "window.NARRATED_TUTORIAL_CONFIG = " + config_json + ";\n",
            encoding="utf-8",
        )
        patch_runtime(output_path, config, diagnostics)
        if not diagnostics.ok:
            raise RuntimeError("runtime patching failed")
    except (OSError, RuntimeError, subprocess.SubprocessError) as error:
        diagnostics.add("output", str(error))
        shutil.rmtree(output_path, ignore_errors=True)
        return False
    return True


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    diagnostics = Diagnostics()
    paths = validate_paths(
        args.lesson,
        args.output,
        args.template_dir,
        diagnostics,
        check=args.check,
    )
    if paths is None:
        print("scaffold_tutorial: validation failed", file=sys.stderr)
        for error in diagnostics.errors:
            print(f"  - {error}", file=sys.stderr)
        return 2
    lesson_path, output_path, template_path = paths
    lesson = load_json(lesson_path, "--lesson", diagnostics)
    compiled = compile_lesson(lesson, lesson_path, diagnostics) if lesson is not None else None
    if compiled is None or not diagnostics.ok:
        print("scaffold_tutorial: validation failed", file=sys.stderr)
        for error in diagnostics.errors:
            print(f"  - {error}", file=sys.stderr)
        return 2
    course_manifest = compiled["courseManifest"]
    chapters = compiled["chapters"]
    config = compiled["config"]
    validate_diagram_output_paths(chapters, output_path, diagnostics)
    validate_audio_durations(chapters, args.ffprobe, diagnostics)
    if not diagnostics.ok:
        print("scaffold_tutorial: validation failed", file=sys.stderr)
        for error in diagnostics.errors:
            print(f"  - {error}", file=sys.stderr)
        return 2
    diagram_count = sum(bool(item["data"].get("diagramData")) for chapter in chapters for item in chapter["sections"])
    if args.check:
        section_count = sum(len(chapter["sections"]) for chapter in chapters)
        frame_count = sum(
            len(item["data"].get("slideshowData", {}).get("frames", []))
            for chapter in chapters
            for item in chapter["sections"]
        )
        scene_count = sum(
            len(item["data"].get("sceneData", {}).get("frames", []))
            for chapter in chapters
            for item in chapter["sections"]
        )
        print(
            f"valid {course_manifest['title']} ({len(chapters)} chapters, "
            f"{section_count} sections, {frame_count} code frames, {scene_count} scenes, {diagram_count} authored diagrams)"
        )
        return 0
    if args.output is None:
        # validate_paths reports this, but retain a defensive guard for callers
        # that invoke main with a custom Namespace.
        print("scaffold_tutorial: validation failed", file=sys.stderr)
        print("  - --output: is required unless --check is used", file=sys.stderr)
        return 2
    if not copy_template(template_path, output_path, diagnostics):
        print("scaffold_tutorial: copy failed", file=sys.stderr)
        for error in diagnostics.errors:
            print(f"  - {error}", file=sys.stderr)
        return 2
    if not write_output(
        output_path,
        course_manifest,
        chapters,
        config,
        args.ffmpeg,
        diagnostics,
    ):
        print("scaffold_tutorial: build failed", file=sys.stderr)
        for error in diagnostics.errors:
            print(f"  - {error}", file=sys.stderr)
        return 2
    section_count = sum(len(chapter["sections"]) for chapter in chapters)
    frame_count = sum(
        len(item["data"].get("slideshowData", {}).get("frames", []))
        for chapter in chapters
        for item in chapter["sections"]
    )
    scene_count = sum(
        len(item["data"].get("sceneData", {}).get("frames", []))
        for chapter in chapters
        for item in chapter["sections"]
    )
    print(f"created {output_path}")
    print(f"  course: {course_manifest['title']}")
    print(
        f"  chapters: {len(chapters)} ({section_count} sections, "
        f"{frame_count} code frames, {scene_count} scenes, {diagram_count} authored diagrams)"
    )
    print("  run: python3 serve.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
