"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const sourcePath = `${__dirname}/../assets/player/cursor-motion.js`;
const motion = require(sourcePath);
const bounds = { width: 900, height: 600 };

function closeTo(actual, expected, tolerance = 1e-9) {
  assert(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

function closePose(actual, expected, tolerance = 1e-9) {
  for (const key of ["x", "y", "angle", "scaleX", "scaleY", "opacity"])
    closeTo(actual[key], expected[key], tolerance);
  assert.equal(actual.mode, expected.mode);
  assert.equal(actual.settled, expected.settled);
}

assert.equal(typeof motion.createTimeline, "function", "exports the CommonJS API");
const browserWindow = {};
vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), { window: browserWindow });
assert.equal(
  typeof browserWindow.TutorialCursorMotion.createTimeline,
  "function",
  "exports the browser global API",
);

{
  const timeline = motion.createTimeline(
    [
      { time: 0, x: 80, y: 300, angle: 0, type: "pointer" },
      { time: 1, x: 760, y: 300, angle: 25, type: "hand" },
    ],
    bounds,
  );
  const midpoint = timeline.sample(1.3);
  assert(midpoint.x > 80 && midpoint.x < 760);
  assert(
    Math.abs(midpoint.y - 300) > 8,
    "a long move follows a visibly curved rather than collinear midpoint",
  );
  assert.equal(midpoint.mode, "bezier");
}

{
  const timeline = motion.createTimeline(
    [
      { time: 0, x: 30, y: 40, angle: -20, type: "pointer" },
      { time: 0.6, x: 700, y: 450, angle: 40, type: "hand" },
    ],
    bounds,
  );
  const first = timeline.sample(0.83);
  timeline.sample(1.4);
  timeline.sample(0.2);
  closePose(timeline.sample(0.83), first);
  closePose(timeline.sample(0.83), timeline.sample(0.83), 0);

  const cadenceA = [0, 0.1, 0.2, 0.4, 0.83].map((time) => timeline.sample(time)).at(-1);
  const cadenceB = [0, 0.01, 0.37, 0.51, 0.72, 0.83]
    .map((time) => timeline.sample(time))
    .at(-1);
  closePose(cadenceA, cadenceB, 0);
}

{
  const base = motion.createTimeline(
    [
      { time: 0, x: 20, y: 20, angle: 0, type: "pointer" },
      { time: 1, x: 800, y: 500, angle: 30, type: "pointer" },
    ],
    bounds,
  );
  const interrupted = motion.createTimeline(
    [
      { time: 0, x: 20, y: 20, angle: 0, type: "pointer" },
      { time: 1, x: 800, y: 500, angle: 30, type: "pointer" },
      { time: 1.05, x: 300, y: 80, angle: -10, type: "thumbsDown" },
    ],
    bounds,
  );
  const beforeInterruption = base.sample(1.05);
  const atInterruption = interrupted.sample(1.05);
  for (const key of ["x", "y", "angle", "scaleX", "scaleY", "opacity"])
    closeTo(atInterruption[key], beforeInterruption[key], 1e-9);
  assert.equal(atInterruption.settled, beforeInterruption.settled);
  assert.equal(interrupted.sample(1.050001).mode, "bezier");
}

{
  const timeline = motion.createTimeline(
    [
      { time: 0, x: 5, y: 5, angle: 0, type: "pointer" },
      { time: 0.4, x: 895, y: 595, angle: 0, type: "pointer" },
    ],
    bounds,
  );
  for (let index = 0; index <= 200; index += 1) {
    const pose = timeline.sample(0.4 + index / 200);
    assert(pose.x >= 0 && pose.x <= bounds.width);
    assert(pose.y >= 0 && pose.y <= bounds.height);
  }
}

{
  const timeline = motion.createTimeline(
    [
      { time: 0, x: 100, y: 100, angle: 350, type: "hand" },
      { time: 1, x: 100, y: 100, angle: 10, type: "hand" },
    ],
    bounds,
  );
  const middle = timeline.sample(1.1);
  for (const key of ["x", "y", "angle", "scaleX", "scaleY", "opacity"])
    assert(Number.isFinite(middle[key]), `${key} remains finite for a zero-distance move`);
  const normalizedAngle = ((middle.angle % 360) + 360) % 360;
  assert(normalizedAngle > 350 || normalizedAngle < 10, "angle takes the shortest route through zero");
}

{
  const timeline = motion.createTimeline(
    [
      { time: 0.5, x: 120, y: 90, angle: 0, type: "hand" },
      { time: 1, visible: false, type: "hand" },
      { time: 1.5, x: 400, y: 300, angle: 90, type: "thumbsDown" },
      { time: 2, x: 600, y: 320, angle: 180, type: "pointer" },
    ],
    bounds,
  );
  assert.equal(timeline.sample(0.49).opacity, 0, "first delayed cue stays hidden during pre-roll");
  assert.equal(timeline.sample(0.5).opacity, 1);
  assert.equal(timeline.sample(1.2).opacity, 0);
  assert.equal(timeline.sample(1.5).opacity, 1);
  assert.equal(timeline.sample(1.5).mode, "still");

  const reduced = timeline.sample(2.05, { reducedMotion: true });
  assert.deepEqual(
    reduced,
    {
      x: 600,
      y: 320,
      angle: 180,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      mode: "still",
      settled: true,
    },
    "reduced motion resolves immediately to the current target",
  );
  assert.deepEqual(timeline.sample(Infinity), reduced, "Infinity resolves the final authored frame");
}

assert.equal(motion.createTimeline([], bounds).sample(100).opacity, 0, "missing cursor stays hidden");
assert.equal(motion.createTimeline(null, bounds).sample(Infinity).settled, true);
assert.equal(motion.createTimeline([], bounds).sample(0).mode, "hidden");
assert.throws(
  () =>
    motion.createTimeline(
      [
        { time: 1, x: 10, y: 10 },
        { time: 0.5, x: 20, y: 20 },
      ],
      bounds,
    ),
  /before the preceding cue/,
  "out-of-order cues fail instead of producing order-dependent samples",
);

console.log("cursor motion tests: 11 contracts passed");
