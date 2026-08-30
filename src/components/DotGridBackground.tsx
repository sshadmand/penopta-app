"use client";

import { useEffect, useRef } from "react";

import { isPenoptaMacApp } from "@/lib/auth/native-shell";

// Grid + falloff tuning.
const SPACING = 22; // px between dot centers
const BASE_RADIUS = 1; // resting dot radius
const MAX_BUMP = 3.4; // extra radius added at the cursor's center
const INFLUENCE = 170; // px radius of the spherical "pull"
const PULL_FRAC = 0.42; // max fraction of the distance a dot warps toward cursor
const BASE_ALPHA = 0.45;
const FOCUS_DELAY = 140; // ms of stillness before the ramp begins to build
const FOCUS_RAMP = 1650; // ms over which scale/pull eases fully in
const PULSE_PERIOD = 3000; // ms for one idle inhale+exhale — loud while we verify
const PULSE_AMP = 0.3; // almost flattens on the exhale (1 → 0.08)
const MOVE_DEADZONE = 2.5; // px — ignore jitter so stillness can actually stick

const FALLBACK_BASE = [212, 212, 216] as const;
const FALLBACK_PEAK = [113, 113, 122] as const;

function readDotRgb(
  styles: CSSStyleDeclaration,
  name: "--dot-base" | "--dot-peak",
  fallback: readonly [number, number, number],
): [number, number, number] {
  const parts = styles
    .getPropertyValue(name)
    .trim()
    .split(/\s+/)
    .map((part) => Number.parseFloat(part));
  if (parts.length >= 3 && parts.every((n) => Number.isFinite(n))) {
    return [parts[0]!, parts[1]!, parts[2]!];
  }
  return [fallback[0], fallback[1], fallback[2]];
}

/**
 * Decorative dot grid rendered on a canvas. While the cursor moves, nearby dots
 * only highlight/darken. Once the cursor sits still for FOCUS_DELAY, the scale +
 * spacetime "pull" gradually ramps in — the closest dot grows largest and each
 * ring warps toward the pointer, easing back out the moment the cursor moves.
 * Once fully raised and still, that same scale + pull slowly breathes
 * in and out instead of sitting frozen.
 */
export function DotGridBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Keep tunables in a ref so the `[]` RAF loop can read the latest values.
  // Sync after render (not during) so Fast Refresh still updates the loop
  // without tripping React's "no refs during render" rule.
  const tunablesRef = useRef({
    pulsePeriod: PULSE_PERIOD,
    pulseAmp: PULSE_AMP,
    focusDelay: FOCUS_DELAY,
    focusRamp: FOCUS_RAMP,
  });
  useEffect(() => {
    tunablesRef.current = {
      pulsePeriod: PULSE_PERIOD,
      pulseAmp: PULSE_AMP,
      focusDelay: FOCUS_DELAY,
      focusRamp: FOCUS_RAMP,
    };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Full-viewport canvas RAF races WKWebView layer commits on reload
    // (macOS 26 SIGSEGV). The Mac app never needs this decoration.
    if (isPenoptaMacApp()) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let width = 0;
    let height = 0;
    let dpr = 1;

    // Target = raw pointer; current = smoothed value we render.
    let targetX = -9999;
    let targetY = -9999;
    let currentX = targetX;
    let currentY = targetY;
    let strength = 0; // 0 when pointer absent, eases to 1 when present
    let targetStrength = 0;
    let focus = 0; // 0 while moving; time-eased toward 1 as the cursor rests
    let lastMoveTime = 0;
    let pointerInside = false;
    let raf = 0;
    let baseRgb: [number, number, number] = [
      FALLBACK_BASE[0],
      FALLBACK_BASE[1],
      FALLBACK_BASE[2],
    ];
    let peakRgb: [number, number, number] = [
      FALLBACK_PEAK[0],
      FALLBACK_PEAK[1],
      FALLBACK_PEAK[2],
    ];

    const readThemeDots = () => {
      const styles = getComputedStyle(document.documentElement);
      baseRgb = readDotRgb(styles, "--dot-base", FALLBACK_BASE);
      peakRgb = readDotRgb(styles, "--dot-peak", FALLBACK_PEAK);
    };
    readThemeDots();

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      const cx = currentX;
      const cy = currentY;
      const influenceSq = INFLUENCE * INFLUENCE;

      // Idle breath is applied here (not by freezing `focus`) so it keeps
      // running even after the raise ramp has finished.
      let breath = 1;
      if (pointerInside) {
        const { pulsePeriod, pulseAmp, focusDelay, focusRamp } =
          tunablesRef.current;
        const stillMs =
          performance.now() - lastMoveTime - focusDelay - focusRamp;
        if (stillMs > 0) {
          const wave =
            0.5 + 0.5 * Math.cos((stillMs / pulsePeriod) * Math.PI * 2);
          breath = 1 - pulseAmp + pulseAmp * wave;
        }
      }

      // Offset the grid so dots sit centered within the viewport.
      const startX = (width % SPACING) / 2 || 0;
      const startY = (height % SPACING) / 2 || 0;

      for (let x = startX; x <= width; x += SPACING) {
        for (let y = startY; y <= height; y += SPACING) {
          let drawX = x;
          let drawY = y;
          let radius = BASE_RADIUS;
          let r = baseRgb[0];
          let g = baseRgb[1];
          let b = baseRgb[2];
          let alpha = BASE_ALPHA;

          if (strength > 0.001) {
            const dx = x - cx;
            const dy = y - cy;
            const distSq = dx * dx + dy * dy;
            if (distSq < influenceSq) {
              const t = 1 - Math.sqrt(distSq) / INFLUENCE;
              // Smoothstep for a soft spherical dome.
              const f = t * t * (3 - 2 * t) * strength;
              // Scale + warp only after the cursor settles (see `focus`).
              const ff = f * focus * breath;

              // Spacetime warp: push each dot away from the cursor by a fraction
              // of its own distance, opening a void that widens near the center.
              const pull = PULL_FRAC * ff;
              drawX = x + dx * pull;
              drawY = y + dy * pull;

              radius = BASE_RADIUS + MAX_BUMP * ff;
              r = baseRgb[0] + (peakRgb[0] - baseRgb[0]) * f;
              g = baseRgb[1] + (peakRgb[1] - baseRgb[1]) * f;
              b = baseRgb[2] + (peakRgb[2] - baseRgb[2]) * f;
              alpha = BASE_ALPHA + (1 - BASE_ALPHA) * f;
            }
          }

          ctx.beginPath();
          ctx.fillStyle = `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${alpha})`;
          ctx.arc(drawX, drawY, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    const tick = () => {
      currentX += (targetX - currentX) * 0.15;
      currentY += (targetY - currentY) * 0.15;
      strength += (targetStrength - strength) * 0.12;

      // Time-eased focus: once the cursor rests, scale/pull blend in along a
      // smoothstep curve. Its slope is zero at the start, so there's no sudden
      // onset — the pull grows out of nothing instead of snapping on.
      const elapsed = performance.now() - lastMoveTime;
      const { focusDelay, focusRamp } = tunablesRef.current;
      const p = pointerInside
        ? Math.min(Math.max((elapsed - focusDelay) / focusRamp, 0), 1)
        : 0;
      const targetFocus = p * p * (3 - 2 * p);
      // Follow the ramp up directly (already smooth); ease gently on the way down.
      if (targetFocus >= focus) focus = targetFocus;
      else focus += (targetFocus - focus) * 0.1;

      draw();

      // Never park the loop while the pointer is in the window — the idle
      // breath is painted every frame from `draw()`.
      if (pointerInside) {
        raf = requestAnimationFrame(tick);
        return;
      }

      const settled =
        Math.abs(targetX - currentX) < 0.5 &&
        Math.abs(targetY - currentY) < 0.5 &&
        Math.abs(targetStrength - strength) < 0.01 &&
        focus < 0.002;

      if (settled) {
        strength = targetStrength;
        focus = targetFocus;
        currentX = targetX;
        currentY = targetY;
        draw();
        raf = 0;
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    const ensureRunning = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };

    const onPointerMove = (e: PointerEvent) => {
      const dx = e.clientX - targetX;
      const dy = e.clientY - targetY;
      const moved = Math.hypot(dx, dy);
      targetX = e.clientX;
      targetY = e.clientY;
      targetStrength = 1;
      pointerInside = true;
      // Ignore sub-pixel jitter so the stillness clock can actually start.
      if (moved > MOVE_DEADZONE || currentX < -1000) {
        lastMoveTime = performance.now();
      }
      // Snap position on the very first move so the lens doesn't fly in.
      if (currentX < -1000) {
        currentX = targetX;
        currentY = targetY;
      }
      ensureRunning();
    };

    const onPointerLeave = () => {
      targetStrength = 0;
      pointerInside = false;
      ensureRunning();
    };

    resize();
    window.addEventListener("resize", resize);

    const themeObserver = new MutationObserver(() => {
      readThemeDots();
      draw();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    if (!reduceMotion) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      document.addEventListener("pointerleave", onPointerLeave);
    }

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerleave", onPointerLeave);
      themeObserver.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
