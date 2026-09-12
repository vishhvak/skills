const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const document = {
  createElement(tag) {
    return {
      tag, ownerDocument: document, children: [], dataset: {}, style: {},
      classList: { add() {} },
      appendChild(child) { this.children.push(child); },
      replaceChildren(...children) { this.children = children; },
    };
  },
};
const window = {};
vm.runInNewContext(fs.readFileSync(`${__dirname}/../assets/player/cursor-visuals.js`, "utf8"), { window });
const element = document.createElement("div");
const pose = { x: 200, y: 130, angle: 40, scaleX: 0.8, scaleY: 1, opacity: 1, mode: "bezier", settled: false };
window.TutorialCursorVisual.draw(element, pose, "pointer");
assert.equal(element.style.transform, "translate3d(188px, 118px, 0) rotate(40deg) scale(0.8, 1)");
assert.equal(element.style.transition, "none");
assert.equal(element.children[0].children[0].src, "/cursor.png");
const glyph = element.children[0];
window.TutorialCursorVisual.draw(element, pose, "pointer");
assert.equal(element.children[0], glyph, "ordinary samples keep the same artwork node");
window.TutorialCursorVisual.draw(element, { ...pose, opacity: 0, settled: true }, "pointer");
assert.equal(element.style.opacity, "0");
assert.equal(element.dataset.settled, "true");
console.log("cursor visual integration tests passed");
