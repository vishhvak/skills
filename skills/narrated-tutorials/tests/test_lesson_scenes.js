const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync(
  `${__dirname}/../assets/player/lesson-scenes.js`,
  "utf8",
);
const window = {};
vm.runInNewContext(source, { window });
const api = window.NarratedTutorialScenes;
const test = api.__test;

assert.equal(test.frameAt([0, 4.8, 7.1], [{}, {}, {}], 6), 1);
assert.equal(test.frameAt([0, 4.8, 7.1], [{}, {}, {}], 1), 0);
assert.equal(test.frameAt([0, 4.8, 7.1], [{}, {}, {}], Infinity), 2);

const horizontal = test.edgeGeometry(
  { x: 10, y: 20, width: 20, height: 20 },
  0,
  "node",
  { x: 70, y: 20, width: 20, height: 20 },
  0,
  "node",
  1000,
  500,
);
assert.equal(horizontal.from.x, 300);
assert.equal(horizontal.from.y, 150);
assert.equal(horizontal.to.x, 700);
assert.equal(horizontal.to.y, 150);

const diagonal = test.edgeGeometry(
  { x: 10, y: 10, width: 20, height: 20 },
  0,
  "node",
  { x: 70, y: 70, width: 20, height: 20 },
  0,
  "node",
  1000,
  500,
);
assert(Math.abs(diagonal.from.x - 300) < 1e-9);
assert(Math.abs(diagonal.from.y - 150) < 1e-9);
assert(Math.abs(diagonal.to.x - 700) < 1e-9);
assert(Math.abs(diagonal.to.y - 350) < 1e-9);
assert(diagonal.length > 0);

assert(Math.abs(test.emojiProgress([0, 4.8], 1, 5.5, false) - 0.5) < 1e-9);
assert.equal(test.emojiProgress([0, 4.8], 1, 5.5, true), 0);

const cursorBelow = test.cursorPlacement({ left: 400, top: 100, width: 180, height: 70 }, 640, 360);
assert.equal(cursorBelow.y, 182);
assert.equal(cursorBelow.angle, 0);
assert(cursorBelow.x >= 400 && cursorBelow.x <= 580);
const cursorAbove = test.cursorPlacement({ left: 400, top: 290, width: 180, height: 60 }, 640, 360);
assert(cursorAbove.y < 290);
assert.equal(cursorAbove.angle, 180);
const cursorBeside = test.cursorPlacement({ left: 5, top: 5, width: 300, height: 350 }, 640, 360);
assert(cursorBeside.x > 305);
assert.equal(cursorBeside.angle, -90);

const cursorCues = test.cursorCues([
  { cursor: { target: "node", type: "pointer" }, nodes: [{ id: "node", x: 10, y: 20, width: 20, height: 20 }] },
  {},
], [0, 4], { width: 1000, height: 500 });
assert(Math.abs(cursorCues[0].x - 208.336) < 0.001);
assert(Math.abs(cursorCues[0].y - 220.632) < 0.001);
assert.equal(cursorCues[0].angle, -44);
assert.equal(cursorCues[0].time, 0);
assert.equal(cursorCues[1].visible, false);
assert.equal(cursorCues[1].time, 4);

assert(source.includes("ResizeObserver"));
assert(source.includes("removeEventListener"));
assert(!source.includes("setTimeout"));
assert(!source.includes("requestAnimationFrame"));
console.log("lesson scene geometry and clock tests passed");
