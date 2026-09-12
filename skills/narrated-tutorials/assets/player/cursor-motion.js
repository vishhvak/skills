(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TutorialCursorMotion = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const DIRECT_DISTANCE = 196;
  const MIN_SETTLING_WINDOW = 0.12;
  const EPSILON = 1e-9;

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function distance(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  function shortestAngleDelta(from, to) {
    let delta = ((to - from + 180) % 360 + 360) % 360 - 180;
    if (delta === -180) delta = 180;
    return delta;
  }

  function mixAngle(from, to, progress) {
    return from + shortestAngleDelta(from, to) * progress;
  }

  function smoothstep(value) {
    const t = clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  }

  // A critically damped response supplies the spring feel. Its short tail is
  // joined to a Hermite segment so progress reaches exactly 1 with zero speed.
  function springProgress(value) {
    const t = clamp(value, 0, 1);
    const join = 0.78;
    const omega = 8;
    const response = (time) => 1 - (1 + omega * time) * Math.exp(-omega * time);
    if (t <= join) return response(t);

    const start = response(join);
    const startSlope = omega * omega * join * Math.exp(-omega * join);
    const span = 1 - join;
    const u = (t - join) / span;
    const h00 = 2 * u * u * u - 3 * u * u + 1;
    const h10 = u * u * u - 2 * u * u + u;
    const h01 = -2 * u * u * u + 3 * u * u;
    return clamp(h00 * start + h10 * span * startSlope + h01, 0, 1);
  }

  function springSpeed(value) {
    const t = clamp(value, 0, 1);
    if (t === 0 || t === 1) return 0;
    const step = 1 / 240;
    const before = springProgress(Math.max(0, t - step));
    const after = springProgress(Math.min(1, t + step));
    return (after - before) / (Math.min(1, t + step) - Math.max(0, t - step));
  }

  function cubicPoint(curve, t) {
    const inverse = 1 - t;
    const a = inverse * inverse * inverse;
    const b = 3 * inverse * inverse * t;
    const c = 3 * inverse * t * t;
    const d = t * t * t;
    return {
      x: curve.start.x * a + curve.control1.x * b + curve.control2.x * c + curve.end.x * d,
      y: curve.start.y * a + curve.control1.y * b + curve.control2.y * c + curve.end.y * d,
    };
  }

  function cubicTangent(curve, t) {
    const inverse = 1 - t;
    return {
      x:
        3 * inverse * inverse * (curve.control1.x - curve.start.x) +
        6 * inverse * t * (curve.control2.x - curve.control1.x) +
        3 * t * t * (curve.end.x - curve.control2.x),
      y:
        3 * inverse * inverse * (curve.control1.y - curve.start.y) +
        6 * inverse * t * (curve.control2.y - curve.control1.y) +
        3 * t * t * (curve.end.y - curve.control2.y),
    };
  }

  function pointInBounds(point, bounds) {
    return (
      point.x >= -EPSILON &&
      point.x <= bounds.width + EPSILON &&
      point.y >= -EPSILON &&
      point.y <= bounds.height + EPSILON
    );
  }

  function candidateCurve(start, end, bounds, bend, sign) {
    const moveX = end.x - start.x;
    const moveY = end.y - start.y;
    const length = Math.max(EPSILON, Math.hypot(moveX, moveY));
    const direction = { x: moveX / length, y: moveY / length };
    const normal = { x: -direction.y * sign, y: direction.x * sign };
    const keepInside = (point) => ({
      x: clamp(point.x, 0, bounds.width),
      y: clamp(point.y, 0, bounds.height),
    });

    return {
      start,
      control1: keepInside({
        x: start.x + moveX * 0.36 + normal.x * bend,
        y: start.y + moveY * 0.36 + normal.y * bend,
      }),
      control2: keepInside({
        x: end.x - moveX * 0.24 + normal.x * bend * 0.72,
        y: end.y - moveY * 0.24 + normal.y * bend * 0.72,
      }),
      end,
    };
  }

  function scoreCurve(curve, bounds, desiredBend) {
    let length = 0;
    let previous = curve.start;
    let invalid = false;
    let maximumDeparture = 0;
    const moveX = curve.end.x - curve.start.x;
    const moveY = curve.end.y - curve.start.y;
    const chordLength = Math.max(EPSILON, Math.hypot(moveX, moveY));

    for (let index = 1; index <= 32; index += 1) {
      const point = cubicPoint(curve, index / 32);
      invalid ||= !pointInBounds(point, bounds);
      length += distance(previous, point);
      maximumDeparture = Math.max(
        maximumDeparture,
        Math.abs(moveX * (curve.start.y - point.y) - (curve.start.x - point.x) * moveY) /
          chordLength,
      );
      previous = point;
    }

    const bendPenalty = Math.abs(maximumDeparture - desiredBend * 0.55);
    return (invalid ? 1e9 : 0) + length + bendPenalty * 0.35;
  }

  function planCurve(start, end, bounds) {
    const moveDistance = distance(start, end);
    const baseBend = Math.min(120, Math.max(30, moveDistance * 0.18));
    const bendScales = [0.65, 0.85, 1, 1.2, 1.4];
    let best = null;
    let bestScore = Infinity;

    for (const sign of [1, -1]) {
      for (const bendScale of bendScales) {
        const bend = baseBend * bendScale;
        const curve = candidateCurve(start, end, bounds, bend, sign);
        const score = scoreCurve(curve, bounds, baseBend);
        if (score < bestScore) {
          best = curve;
          bestScore = score;
        }
      }
    }

    return best;
  }

  function directionAngle(vector, fallback) {
    if (Math.hypot(vector.x, vector.y) < EPSILON) return fallback;
    return (Math.atan2(vector.y, vector.x) * 180) / Math.PI + 90;
  }

  function normalizeBounds(bounds) {
    return {
      width: Math.max(0, Number.isFinite(bounds?.width) ? bounds.width : 0),
      height: Math.max(0, Number.isFinite(bounds?.height) ? bounds.height : 0),
    };
  }

  function normalizeCues(cues, bounds) {
    if (!Array.isArray(cues)) return [];
    let previousTime = -Infinity;
    return cues.map((cue, index) => {
      const time = Number(cue?.time);
      if (!Number.isFinite(time) || time < 0)
        throw new TypeError(`Cursor cue ${index} has an invalid time`);
      if (time < previousTime)
        throw new TypeError(`Cursor cue ${index} occurs before the preceding cue`);
      previousTime = time;
      const visible = cue?.visible !== false;
      const x = Number(cue?.x);
      const y = Number(cue?.y);
      return {
        time,
        visible: visible && Number.isFinite(x) && Number.isFinite(y),
        x: Number.isFinite(x) ? clamp(x, 0, bounds.width) : 0,
        y: Number.isFinite(y) ? clamp(y, 0, bounds.height) : 0,
        angle: Number.isFinite(Number(cue?.angle)) ? Number(cue.angle) : 0,
      };
    });
  }

  function hiddenPose() {
    return {
      x: 0,
      y: 0,
      angle: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 0,
      mode: "hidden",
      settled: true,
    };
  }

  function targetPose(cue, opacity = 1) {
    return {
      x: cue.x,
      y: cue.y,
      angle: cue.angle,
      scaleX: 1,
      scaleY: 1,
      opacity,
      mode: "still",
      settled: true,
    };
  }

  function naturalDuration(moveDistance, angleDistance) {
    if (moveDistance < EPSILON)
      return angleDistance < EPSILON ? 0 : clamp(0.16 + angleDistance / 900, 0.16, 0.34);
    if (moveDistance <= DIRECT_DISTANCE)
      return clamp(0.18 + moveDistance / 650, 0.2, 0.46);
    return clamp(0.38 + moveDistance / 1200, 0.5, 0.9);
  }

  function transitionDuration(start, cue, nextCue) {
    const duration = naturalDuration(
      distance(start, cue),
      Math.abs(shortestAngleDelta(start.angle, cue.angle)),
    );
    if (!nextCue || duration === 0) return duration;
    const available = nextCue.time - cue.time;
    return available >= MIN_SETTLING_WINDOW ? Math.min(duration, available) : duration;
  }

  function transitionPose(entry, time) {
    if (time === Infinity || entry.duration === 0 || time >= entry.time + entry.duration)
      return targetPose(entry.target);

    const elapsed = Math.max(0, time - entry.time);
    const clockProgress = clamp(elapsed / entry.duration, 0, 1);
    const progress = springProgress(clockProgress);
    const start = entry.start;
    const target = entry.target;
    let point;
    let tangent;

    if (entry.curve) {
      point = cubicPoint(entry.curve, progress);
      tangent = cubicTangent(entry.curve, progress);
    } else {
      point = {
        x: start.x + (target.x - start.x) * progress,
        y: start.y + (target.y - start.y) * progress,
      };
      tangent = { x: target.x - start.x, y: target.y - start.y };
    }

    const travelAngle = directionAngle(tangent, target.angle);
    let angle;
    if (entry.moveDistance < EPSILON) {
      angle = mixAngle(start.angle, target.angle, progress);
    } else if (clockProgress < 0.2) {
      angle = mixAngle(start.angle, travelAngle, smoothstep(clockProgress / 0.2));
    } else if (clockProgress > 0.68) {
      angle = mixAngle(travelAngle, target.angle, smoothstep((clockProgress - 0.68) / 0.32));
    } else {
      angle = travelAngle;
    }

    const pathSpeed =
      (Math.hypot(tangent.x, tangent.y) * springSpeed(clockProgress)) / entry.duration;
    const squash = Math.min(0.15, pathSpeed / 5500);
    const scaleBlend = smoothstep(clockProgress / 0.12);
    const movingScaleX = 1 - squash;
    const movingScaleY = 1 + squash * 0.24;
    return {
      x: point.x,
      y: point.y,
      angle,
      scaleX: start.scaleX + (movingScaleX - start.scaleX) * scaleBlend,
      scaleY: start.scaleY + (movingScaleY - start.scaleY) * scaleBlend,
      opacity: 1,
      mode: entry.curve ? "bezier" : "scoot",
      settled: false,
    };
  }

  function sampleEntries(entries, time) {
    let selected = null;
    for (const entry of entries) {
      if (entry.time > time) break;
      selected = entry;
    }
    if (!selected) return hiddenPose();
    if (selected.kind === "hidden") return hiddenPose();
    if (selected.kind === "static") return targetPose(selected.target);
    return transitionPose(selected, time);
  }

  function createTimeline(cues, rawBounds) {
    const bounds = normalizeBounds(rawBounds);
    const normalized = normalizeCues(cues, bounds);
    const entries = [];

    normalized.forEach((cue, index) => {
      if (!cue.visible) {
        entries.push({ kind: "hidden", time: cue.time });
        return;
      }

      const start = sampleEntries(entries, cue.time);
      if (start.opacity === 0) {
        entries.push({ kind: "static", time: cue.time, target: cue });
        return;
      }

      const moveDistance = distance(start, cue);
      const duration = transitionDuration(start, cue, normalized[index + 1]);
      entries.push({
        kind: "transition",
        time: cue.time,
        duration,
        start,
        target: cue,
        moveDistance,
        curve: moveDistance > DIRECT_DISTANCE ? planCurve(start, cue, bounds) : null,
      });
    });

    return Object.freeze({
      sample(time, { reducedMotion = false } = {}) {
        const sampleTime = time === Infinity ? Infinity : Math.max(0, Number(time) || 0);
        if (!reducedMotion) return sampleEntries(entries, sampleTime);

        let target = null;
        for (const cue of normalized) {
          if (cue.time > sampleTime) break;
          target = cue;
        }
        return target?.visible ? targetPose(target) : hiddenPose();
      },
    });
  }

  return Object.freeze({ createTimeline });
});
