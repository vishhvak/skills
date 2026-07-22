# Motion doctrine

The register's observed values, organized so an agent never has to guess. Method
borrowed from Emil Kowalski's "Agents with Taste": strict rules with the why
attached, so taste survives delegation.

## Duration table (observed across the source products)

| What | Duration | Source |
|---|---|---|
| Element swap (wiki page flip) | 100ms fade+scale | `transition={{duration: 0.1}}` |
| Overlay fade (mobile backdrop) | 100–200ms | navbar drawer |
| Hover/color transitions | 150–200ms `ease-in-out` | 2020-dashboard `all 0.15s` |
| Drawer/panel slide | spring `{damping 30, stiffness 300, mass 0.8}` | mobile nav |
| Chart bar growth | `whileInView`, stagger `index * 0.05`–`0.1` | timeseries charts |
| Terminal line reveal | 100–180ms base × jitter `(0.6 + rand*0.8)` | agent-loop |

Rules: nothing decorative exceeds 300ms; exits match or run faster than
entrances; larger travel = slightly longer duration; loop animations (typed
terminals) get randomized jitter so they read as alive, not metronomic.

## Easing decision

```
Entering or exiting the viewport?        → ease-out (or expo-out)
Moving/morphing while on screen?         → ease-in-out
Hover state change?                      → ease / 150ms
Physical panel (drawer, sheet)?          → spring, damping 30 stiffness 300 mass 0.8
Constant motion (marquee — avoid anyway) → linear
```

No bounce, no elastic, no overshoot. The register's springs are critically damped —
they settle, they don't wobble.

## Scale grammar

Elements never appear from nothing. The wiki window enters at
`scale: 0.85 → 1` (a deflated balloon still has shape); icons/buttons press
to `scale(0.97)` on `:active`; hover growth caps at ~1.2 on tiny ornaments
(dots), 1.0 on content (content never zooms).

## Scenario → solution

| Scenario | Do this |
|---|---|
| Section content on first paint | Staggered settle-in: `translateY(4px)` + fade, 50ms/item offsets, ease-out |
| Demo starts offscreen | Gate on `useInView(ref, {once: true})`, never on mount |
| Scroll-driven story | Progress = `clamp(-rect.top / (trackHeight - viewportHeight), 0, 1)`, rAF-throttled; state changes at hand-tuned thresholds |
| Window/page swap | `AnimatePresence`, fade + scale 0.85↔1, 100ms |
| Hover flicker on cards | Animate the child, not the hovered parent |
| Button feels dead | `transform: scale(0.97)` on `:active`, 120ms |
| Anything still feels off | You're probably over-animating — remove one layer before adding blur |

## Reduced motion — non-negotiable

Every animation ships a `@media (prefers-reduced-motion: reduce)` branch:
entrances become instant (opacity 1, no transform), loops stop, view
transitions fall back to the plain state change. Content must never be
invisible when animations don't run (no opacity-0-until-JS reveals).
