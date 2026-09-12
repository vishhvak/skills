# Player data and lesson schema

`scaffold_tutorial.py` accepts one JSON lesson object. Paths in `audio` and
`alignment` resolve relative to that file; absolute paths are also accepted.
The legacy one-chapter form remains valid:

```json
{
  "course": {"id": "bread", "title": "How bread rises"},
  "chapter": {"id": "inside-the-dough", "title": "Inside the dough"},
  "sections": [{
    "id": "gas",
    "title": "Where bubbles come from",
    "text": "Yeast releases carbon dioxide.",
    "audio": "audio/gas.webm",
    "alignment": "audio/gas.aligned.json"
  }]
}
```

For a real course with multiple topics, use `chapters`. Every chapter has its
own manifest and ordered section sequence:

```json
{
  "course": {
    "id": "stable-course-id",
    "title": "Course title",
    "description": "One sentence shown on the home page",
    "brand": "Course brand",
    "wordmark": "COURSE BRAND",
    "footerLabel": "LOCAL TUTORIAL",
    "footerLinks": [{"label": "Docs", "url": "https://example.com/docs"}]
  },
  "chapters": [
    {
      "id": "first-topic",
      "title": "First topic",
      "description": "Optional chapter description",
      "order": 1,
      "sections": [{
        "id": "first-lesson",
        "title": "First lesson",
        "text": "Authored narration goes here.",
        "audio": "audio/first.webm",
        "alignment": "aligned/first.json"
      }]
    },
    {
      "id": "second-topic",
      "title": "Second topic",
      "sections": [{
        "id": "second-lesson",
        "title": "Second lesson",
        "text": "The next topic starts here.",
        "audio": "audio/second.webm",
        "alignment": "aligned/second.json"
      }]
    }
  ]
}
```

`course.id`, chapter ids, and section ids use lowercase letters, digits, and
single hyphens. Course and chapter titles, section titles, and section text
are required. Chapter `description`, `order`, `draft`, `comingSoon`, `topic`,
`groupId`, and `groupTitle` are optional. A section may override its group
metadata. Empty chapter sections are rejected because the player cannot open
an empty topic. Course description, brand, wordmark, footer label, and footer
links are optional and receive local defaults. Footer and scene links must
start with `https://`, `http://`, `/`, or `#`.

Every section needs a real audio file (`.webm`, `.wav`, or `.wave`) and a real
alignment sidecar:

```json
{"text":"Authored narration goes here.","wordTimings":[
  {"word":"Authored","start":0.10,"end":0.42},
  {"word":"narration","start":0.48,"end":0.91},
  {"word":"goes","start":0.96,"end":1.15},
  {"word":"here.","start":1.20,"end":1.58}
]}
```

The compiler compares alignment words to authored words after case-folding and
removing only leading/trailing punctuation. It keeps authored spelling in the
generated output. Count, sequence, missing file, malformed timing, negative
time, non-monotonic start/end, or non-positive duration errors stop the build.
`ffprobe` also confirms each media file is readable and every word or visual
cue ends within the media duration, with a 0.1 second tolerance. Run
`scaffold_tutorial.py --lesson LESSON.json --check` to perform all authoring
validation without creating an output directory. Add `--output` only when
scaffolding; an existing output path is always refused.

## Code frames

Use `frames` for code examples. Each frame has exactly one cue. `atWord` maps
to the matching real word start; `nth` is 1-based and defaults to 1. `time` is
a non-negative explicit time. Cue times must be strictly increasing. Never
estimate word durations or invent cue times from section length.

```json
"frames": [
  {
    "atWord": "Authored",
    "lines": [{"id": "main", "text": "const value = 1"}],
    "spotlight": {"lineId": "main", "start": 0, "end": 5},
    "cursor": {"lineId": "main", "start": 0, "end": 5, "type": "hand"},
    "bursts": [{"lineId": "main", "start": 0, "end": 5, "emoji": "✨"}]
  },
  {"atWord": "goes", "lines": [{"id": "main", "text": "const value = 2"}]}
]
```

`lines` is a list of visible lines, including `[]` to clear the stage. A line
has a stable `id` and `text`, plus optional `tokens`, `partId`, `inline`,
`animateEntry`, `crossfade`, `entering`, `dimmed`, and `background`. Token text
must join exactly to line text. Reusing a line id with changed tokens emits
stable `versions`; changing a reused part id or structural properties is an
error. `spotlight`, `cursor`, `marks`, `glows`, `squiggles`, and `brightRanges`
use half-open `[start,end)` character ranges that fit the visible line.
Cursor types are `hand`, `pointer`, and `thumbsDown`. `bursts` accepts a
non-empty emoji string or string list.

## General scenes

Use `scenes` for diagrams, processes, recipes, maps, or UI demonstrations
that do not fit a code block. Scenes are snapshots selected by the same audio
clock as code frames. A snapshot has one `atWord` or `time` cue and optional
`nodes`, `cards`, `labels`, `edges`, `highlight`/`highlights`, `cursor`, and
`emoji`/`emojis` (or the `bursts` alias):

```json
"scenes": [
  {
    "time": 0,
    "nodes": [
      {"id": "sugar", "label": "Sugars", "x": 15, "y": 45, "width": 24, "height": 18},
      {"id": "yeast", "label": "Yeast", "x": 50, "y": 45, "width": 24, "height": 18}
    ],
    "edges": [{"from": "sugar", "to": "yeast", "directed": true}],
    "highlight": "yeast",
    "cursor": {"target": "yeast", "type": "hand"}
  },
  {
    "atWord": "pockets",
    "nodes": [
      {"id": "sugar", "label": "Sugars", "x": 15, "y": 45, "width": 24, "height": 18},
      {"id": "yeast", "label": "Yeast", "x": 50, "y": 45, "width": 24, "height": 18},
      {"id": "gas", "label": "Carbon dioxide", "x": 82, "y": 45, "width": 28, "height": 18}
    ],
    "edges": [{"from": "yeast", "to": "gas"}],
    "highlight": "gas",
    "cursor": {"target": "gas", "type": "pointer"},
    "emojis": [{"emoji": "🫧", "target": "gas"}]
  }
]
```

Coordinates are percentages from the top-left of the stage (`0` to `100`).
Nodes and cards accept `id`, text fields (`label`, `text`, `title`, `body`,
`description`), coordinates, `tone`, `color`, `background`, `hidden`,
`selected`, `muted`, and an optional local `image`. Cards can also carry a
safe `url`. Labels use `text` or `label`. Edges use `from`, `to`, and optional
`label`, `style`, `color`, `dashed`, and `directed`; endpoints must be visible
in that snapshot. Highlights target visible ids. Cursors target a visible id
or provide `x` and `y`; their types use the code cursor vocabulary. Targeted cursors point from outside the object so labels remain clear, choosing another side when the stage edge leaves too little space. Their [curved motion](cursor-motion.md) is sampled from narration time, including while seeking. Emojis and
bursts are strings or `{emoji|value,target}` objects. Item ids remain stable across
snapshots so the player can transition and seek deterministically.

Scene images must be local paths below the lesson file's directory. The
compiler copies each image to
`content/<chapter-id>/assets/<digest>-<basename>` and emits that generated
`/content/<chapter-id>/assets/...` URL in the section. Missing, escaping,
remote, `data:`, executable, and protocol-relative image paths are rejected.

The generated section contains the canonical scene contract:

```json
{
  "sceneData": {
    "name": "LessonScene",
    "frames": [{"id": 0, "nodes": [], "cards": [], "labels": [], "edges": [], "highlights": [], "emojis": []}],
    "stepTimes": [0]
  },
  "scenes": "same validated frame list",
  "sceneStepTimes": "same validated cue list"
}
```

The aliases keep the router easy to extend; they are compiled from the same
records and are not authoring inputs. The copied `lesson-scenes.js` module
exports `window.NarratedTutorialScenes` with the native lifecycle
`mount(root, section)`, `paint(audioTime, options)`, and `destroy()`. The app
router should call its `mount` when `section.sceneData` exists, call `paint`
from the existing audio-clock loop, and call `destroy` before mounting another
section. The module uses keyed DOM identity and CSS transitions only. It owns
no timers, so pause, playback-rate changes, and backward scrubs remain tied to
the audio clock.

## Generated files

The player reads one course manifest, one chapter manifest per topic, and one
JSON/audio pair per section:

```text
content/manifest.json
content/<chapter-id>/manifest.json
content/<chapter-id>/<section-id>.json
content/<chapter-id>/<section-id>.webm
content/<chapter-id>/assets/<digest>-<basename>   # when scenes use images
```

The compiler copies the player shell, code/demo modules, generic scene module
and CSS, local font and its `fonts/OFL.txt` license. It never copies the
reference renderer's `content/` directory or testimonial data. The generated
shell receives the supplied brand/configuration and local footer links.

## Custom diagram modules

Sections may use `diagram` instead of `scenes` or `frames` for authored SVG/HTML composition and motion. Read [diagram-modules.md](diagram-modules.md) for the directory/entry/cue schema and runtime lifecycle. The compiler packages the complete local module directory and resolves cues against the same real word alignment.
