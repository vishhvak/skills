// Shared visual shell. Motion is sampled from narration time by cursor-motion.js.
(function (global) {
  "use strict";

  function glyph(document, type) {
    if (type === "pointer") {
      const offset = document.createElement("span");
      offset.className = "tutorial-cursor-art";
      const image = document.createElement("img");
      image.src = "/cursor.png";
      image.alt = "";
      image.draggable = false;
      image.width = 23;
      image.height = 24;
      offset.appendChild(image);
      return offset;
    }
    const svg = global.EffectCodeStage.createCursorIcon(document, type);
    svg.classList.add("tutorial-cursor-hand");
    for (const path of svg.querySelectorAll("path")) {
      path.setAttribute("fill", "#15191f");
      path.setAttribute("stroke", "#f3f5f7");
      path.setAttribute("stroke-width", "13");
      path.setAttribute("stroke-linejoin", "round");
    }
    if (type === "thumbsDown") svg.style.transform = "rotate(180deg)";
    return svg;
  }

  function draw(element, pose, type = "pointer") {
    element.classList.add("tutorial-cursor");
    if (element.dataset.type !== type) {
      element.replaceChildren(glyph(element.ownerDocument, type));
      element.dataset.type = type;
    }
    element.style.left = "0px";
    element.style.top = "0px";
    element.style.width = "24px";
    element.style.height = "24px";
    element.style.transformOrigin = "12px 12px";
    element.style.transition = "none";
    element.style.filter = "none";
    element.style.transform = `translate3d(${pose.x - 12}px, ${pose.y - 12}px, 0) rotate(${pose.angle}deg) scale(${pose.scaleX}, ${pose.scaleY})`;
    element.style.opacity = String(pose.opacity);
    element.dataset.motion = pose.mode;
    element.dataset.settled = String(pose.settled);
  }

  global.TutorialCursorVisual = { draw };
})(typeof window !== "undefined" ? window : globalThis);
