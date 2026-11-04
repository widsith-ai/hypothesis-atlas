"""
Paints the Monet-style (Impressionist) page backdrops used by the default
"monet" art style — see src/app/monet.css and issue #87.

One scene per colour mode (the existing `theme` key):

    light   → public/monet/water-lilies.webp      pale pond, sky reflections, lily pads
    vibrant → public/monet/japanese-bridge.webp   green footbridge over a lily pond
    dark    → public/monet/sunrise.webp           hazy harbour, orange sun, boats

These are original, procedurally painted images, not reproductions. Each scene
is first laid out as a soft colour study (numpy), then repainted with tens of
thousands of short broken-colour brush dabs, coarse to fine, each one sampling
the study, jittering its colour, sometimes pulling toward a complementary
accent, and following a per-scene stroke direction field (horizontal on water,
hanging for willows). The centre of each scene is kept calm and light (or calm
and dark at night) so page content stays readable.

    python3 scripts/gen-monet-scenes.py          # needs Pillow + numpy
"""

from __future__ import annotations

import math
import os
from dataclasses import dataclass

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 1920, 1200
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "monet")

# ── helpers ────────────────────────────────────────────────────────────────

U, V = np.meshgrid(np.linspace(0, 1, W), np.linspace(0, 1, H))


def hexrgb(h: str) -> np.ndarray:
    h = h.lstrip("#")
    return np.array([int(h[i : i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


def vgrad(stops: list[tuple[float, str]]) -> np.ndarray:
    """Vertical gradient through (v, colour) stops → (H, W, 3)."""
    vs = np.array([s[0] for s in stops])
    cols = np.stack([hexrgb(s[1]) for s in stops])
    out = np.empty((H, 3), dtype=np.float32)
    v = np.linspace(0, 1, H)
    for c in range(3):
        out[:, c] = np.interp(v, vs, cols[:, c])
    return np.repeat(out[:, None, :], W, axis=1)


def blend(img: np.ndarray, colour: str | np.ndarray, mask: np.ndarray) -> None:
    col = hexrgb(colour) if isinstance(colour, str) else colour
    m = np.clip(mask, 0, 1)[..., None]
    img[:] = img * (1 - m) + col * m


def blob(cx: float, cy: float, rx: float, ry: float, soft: float = 0.35) -> np.ndarray:
    d = np.sqrt(((U - cx) / rx) ** 2 + ((V - cy) / ry) ** 2)
    return np.clip((1 - d) / soft, 0, 1)


def noise(rng: np.random.Generator, scale: int, blur: float) -> np.ndarray:
    """Smooth value noise in [0, 1] — low-res random field upsampled + blurred."""
    small = rng.random((max(2, H // scale), max(2, W // scale))).astype(np.float32)
    im = Image.fromarray((small * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)
    im = im.filter(ImageFilter.GaussianBlur(blur))
    return np.asarray(im, dtype=np.float32) / 255.0


# ── painting ───────────────────────────────────────────────────────────────


@dataclass
class Scene:
    name: str
    study: np.ndarray  # (H, W, 3) float colour study
    angle: np.ndarray  # (H, W) stroke direction, radians
    accents: list[str]  # complementary "broken colour" pigments
    accent_p: float = 0.12
    calm: np.ndarray | None = None  # (H, W) 0..1 — where to suppress fine detail
    jitter: float = 14.0


# (length px, width px, strokes, alpha range)
PASSES = [
    (150, 44, 1800, (140, 190)),
    (88, 26, 6500, (150, 210)),
    (50, 15, 17000, (160, 220)),
    (28, 8, 24000, (170, 230)),
    (15, 4, 12000, (180, 235)),
]


def paint(scene: Scene, seed: int) -> Image.Image:
    rng = np.random.default_rng(seed)
    base = np.clip(scene.study, 0, 255).astype(np.uint8)
    canvas = Image.fromarray(base, "RGB").filter(ImageFilter.GaussianBlur(10))
    draw = ImageDraw.Draw(canvas, "RGBA")
    accents = [hexrgb(a) for a in scene.accents]

    for pi, (length, width, count, (a0, a1)) in enumerate(PASSES):
        xs = rng.integers(0, W, count)
        ys = rng.integers(0, H, count)
        fine = pi >= 3
        for x, y in zip(xs, ys):
            if fine and scene.calm is not None and rng.random() < scene.calm[y, x] * 0.85:
                continue
            col = scene.study[y, x].copy()
            # broken colour: per-channel jitter + shared value jitter
            col += rng.normal(0, scene.jitter * 0.45, 3) + rng.normal(0, scene.jitter)
            if accents and rng.random() < scene.accent_p:
                acc = accents[rng.integers(len(accents))]
                col = col * 0.62 + acc * 0.38
            col = np.clip(col, 0, 255).astype(int)
            ang = scene.angle[y, x] + rng.normal(0, 0.12)
            ln = length * rng.uniform(0.6, 1.25)
            wd = max(1, int(width * rng.uniform(0.7, 1.2)))
            dx, dy = math.cos(ang) * ln / 2, math.sin(ang) * ln / 2
            alpha = int(rng.uniform(a0, a1))
            draw.line([(x - dx, y - dy), (x + dx, y + dy)], fill=(*col, alpha), width=wd)
            # impasto: a thin lighter ridge along one side of the larger dabs
            if width >= 11 and rng.random() < 0.35:
                hi = np.clip(col + 22, 0, 255).astype(int)
                ox, oy = -math.sin(ang) * wd * 0.3, math.cos(ang) * wd * 0.3
                draw.line(
                    [(x - dx * 0.7 + ox, y - dy * 0.7 + oy), (x + dx * 0.7 + ox, y + dy * 0.7 + oy)],
                    fill=(*hi, 90),
                    width=max(1, wd // 4),
                )

    canvas = canvas.filter(ImageFilter.GaussianBlur(0.6))
    # faint canvas grain multiplied in (no periodic weave — it aliases when scaled)
    grain = rng.normal(0, 1, (H, W)).astype(np.float32)
    tex = 1 + grain * 0.012
    arr = np.asarray(canvas, dtype=np.float32) * tex[..., None]
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")


# ── scenes ─────────────────────────────────────────────────────────────────


def water_lilies(rng: np.random.Generator) -> Scene:
    """Light mode: a pale pond seen from above — sky and cloud reflections, lilac
    and rose glints, willow reflections hanging in from the top corners, lily
    pads drifting in loose horizontal rafts along the bottom and the sides."""
    img = vgrad([(0, "#9fb6cc"), (0.22, "#c4d3e2"), (0.48, "#e4e9ef"), (0.72, "#cbd9e3"), (1, "#9fb7c9")])
    n = noise(rng, 140, 50)
    blend(img, "#f3e2e8", (n - 0.5) * 2.4 * blob(0.5, 0.45, 0.75, 0.55, 0.8))  # pink cloud glow
    blend(img, "#bdb6dc", (0.42 - n) * 2.2)  # lilac shadow
    blend(img, "#f1e8c6", blob(0.6, 0.36, 0.25, 0.12, 0.9) * 0.55)  # warm light
    # willow reflections: blue-green curtains hanging in from the top corners
    curtain = noise(rng, 26, 5)
    for cx, rx in ((0.03, 0.2), (0.97, 0.17)):
        m = blob(cx, -0.05, rx, 0.6, 0.9) * (0.45 + curtain * 0.8)
        blend(img, "#4f7466", np.clip(m, 0, 1) * 0.9)
        blend(img, "#86a38a", np.clip(m - 0.5, 0, 1) * 0.6)
    # lily pads: flat perspective ellipses in rafts, denser toward bottom and edges
    pad_cols = ["#6e9058", "#8ba763", "#587a52", "#a6b873", "#7b9c7a", "#9aae6a"]
    flower_cols = ["#f4b3c4", "#e98aa4", "#fff4ec", "#f6d27a"]
    rafts = [(rng.random(), 0.45 + rng.beta(2.0, 1.1) * 0.6) for _ in range(34)]
    for _ in range(300):
        ru, rv = rafts[rng.integers(len(rafts))]
        u = ru + rng.normal(0, 0.07)
        v = rv + rng.normal(0, 0.025)
        if 0.3 < u < 0.7 and v < 0.62:
            continue  # keep the centre open
        scale = 0.014 + max(v, 0) * 0.03
        m = blob(u, v, scale * rng.uniform(1.0, 1.8), scale * 0.34, 0.3)
        blend(img, pad_cols[rng.integers(len(pad_cols))], m)
        blend(img, "#c6d18c", blob(u - scale * 0.3, v - scale * 0.08, scale * 0.6, scale * 0.1, 0.6) * 0.5)
        if rng.random() < 0.15:
            blend(img, flower_cols[rng.integers(len(flower_cols))], blob(u + scale * 0.2, v - scale * 0.12, scale * 0.3, scale * 0.2, 0.4))
    angle = (noise(rng, 60, 12) - 0.5) * 0.3  # water: horizontal strokes
    willow = np.maximum(blob(0.03, -0.05, 0.2, 0.6, 0.9), blob(0.97, -0.05, 0.17, 0.6, 0.9))
    angle = (angle * (1 - willow) + (math.pi / 2) * willow).astype(np.float32)
    calm = blob(0.5, 0.42, 0.42, 0.34, 1.0)
    return Scene("water-lilies", img, angle, ["#c4b2e6", "#f1aec0", "#f4e2a0", "#94c0d8"], 0.16, calm, 12.0)


def japanese_bridge(rng: np.random.Generator) -> Scene:
    """Vibrant mode: a pale blue-green footbridge arching across a wall of
    sunlit foliage and willow, over a pond thick with lily pads."""
    img = vgrad([(0, "#4c7148"), (0.25, "#6f9353"), (0.44, "#8fae68"), (0.52, "#6f9177"), (0.75, "#5f8770"), (1, "#4d7560")])
    n1, n2 = noise(rng, 160, 40), noise(rng, 60, 14)
    top = np.clip((0.5 - V) / 0.05, 0, 1)
    blend(img, "#c8cf78", np.clip((n1 - 0.5) * 2.6, 0, 1) * top * 0.9)  # sunlit masses
    blend(img, "#2f574c", np.clip((0.45 - n1) * 2.6, 0, 1) * 0.85)  # deep blue-green shadow
    blend(img, "#e0dc96", np.clip((n2 - 0.68) * 3.0, 0, 1) * top)  # leaf glints
    blend(img, "#8f8cc0", np.clip((0.32 - n2) * 2.0, 0, 1) * (V > 0.52) * 0.8)  # lilac water shadow
    blend(img, "#cbd9ad", blob(0.5, 0.6, 0.42, 0.08, 1.0) * 0.6)  # light on the water under the bridge
    # willow fronds: hanging streaks at the left and right
    fronds = noise(rng, 14, 3)
    for cx in (0.1, 0.9):
        m = blob(cx, 0.15, 0.13, 0.45, 0.9) * np.clip((fronds - 0.45) * 3, 0, 1)
        blend(img, "#a5b85f", m * 0.8)
    # lily pads across the water
    pad_cols = ["#93b05a", "#adc36a", "#6e914f", "#c5d07c", "#82a467"]
    for _ in range(480):
        v = 0.53 + rng.beta(1.3, 1.0) * 0.5
        u = rng.random()
        if 0.25 < u < 0.75 and v < 0.74 and rng.random() < 0.75:
            continue
        s_ = 0.012 + (v - 0.5) * 0.05
        blend(img, pad_cols[rng.integers(len(pad_cols))], blob(u, v, s_ * rng.uniform(1, 1.9), s_ * 0.32, 0.3))
        if rng.random() < 0.13:
            blend(img, ["#f2bfcd", "#fcf3e8", "#e5849f"][rng.integers(3)], blob(u, v - s_ * 0.1, s_ * 0.3, s_ * 0.2, 0.4))

    # the bridge: deck arc, rail arc above, a mid rail, posts between
    def arc(u, base, rise):
        return base - rise * np.sin(np.pi * np.clip(u, 0, 1))

    deck, rail = arc(U, 0.5, 0.14), arc(U, 0.38, 0.13)
    col, hi, sh = "#86b8a6", "#d3eadb", "#3f6f63"
    line = lambda c, t: np.clip(1 - np.abs(V - c) / t, 0, 1)
    blend(img, sh, line(deck + 0.012, 0.01) * 0.8)
    blend(img, col, line(deck, 0.016))
    blend(img, hi, line(deck - 0.01, 0.005))
    blend(img, col, line(rail, 0.009))
    blend(img, hi, line(rail - 0.004, 0.003))
    blend(img, col, line((rail + deck) / 2, 0.005) * 0.85)
    for pu in np.arange(0.035, 1.0, 0.077):
        between = (V > arc(pu, 0.38, 0.13)) & (V < arc(pu, 0.5, 0.14))
        blend(img, col, np.clip(1 - np.abs(U - pu) / 0.0045, 0, 1) * between)
    # bridge reflection, broken up in the water
    blend(img, "#9cc8b4", line(arc(U, 0.56, -0.1), 0.012) * 0.5)
    # strokes: hanging in the foliage, following the arc on the bridge, flat on the water
    hang = math.pi / 2 + (noise(rng, 40, 10) - 0.5) * 1.6
    tangent = np.arctan(-0.14 * np.pi * np.cos(np.pi * U) * (H / W))  # slope of the deck arc, in pixels
    near_bridge = np.clip(1 - np.minimum(np.abs(V - deck), np.abs(V - rail)) / 0.03, 0, 1)
    angle = np.where(V < 0.52, hang, (noise(rng, 50, 10) - 0.5) * 0.3)
    angle = (angle * (1 - near_bridge) + tangent * near_bridge).astype(np.float32)
    calm = np.maximum(blob(0.5, 0.62, 0.36, 0.14, 1.0) * 0.7, near_bridge * 0.9)
    return Scene("japanese-bridge", img, angle, ["#c1b0de", "#f0c0cd", "#ead27a", "#7aaec4"], 0.14, calm, 14.0)


def sunrise(rng: np.random.Generator) -> Scene:
    """Dark mode: a harbour at dawn in blue-grey haze — a small orange sun, its
    broken reflection down the water, dark boats, faint cranes and chimneys."""
    img = vgrad([(0, "#24303f"), (0.25, "#334256"), (0.44, "#4a5766"), (0.5, "#3b4a5b"), (0.75, "#2b394b"), (1, "#1b2533")])
    n = noise(rng, 180, 60)
    blend(img, "#6e5a70", blob(0.8, 0.2, 0.5, 0.3, 1.0) * 0.6)  # rose haze around the sun
    blend(img, "#9a6c5c", blob(0.8, 0.2, 0.18, 0.11, 1.0) * 0.55)
    blend(img, "#566c7c", np.clip((n - 0.5) * 1.6, 0, 1) * 0.7)
    blend(img, "#223244", np.clip((0.45 - n) * 1.6, 0, 1) * 0.7)
    # port silhouettes along the horizon — cranes, masts, chimneys with smoke
    for _ in range(30):
        u = rng.uniform(0.0, 0.32) if rng.random() < 0.7 else rng.uniform(0.86, 1.0)
        h = rng.uniform(0.04, 0.2)
        m = np.clip(1 - np.abs(U - u) / 0.0035, 0, 1) * ((V > 0.45 - h) & (V < 0.47))
        blend(img, "#1f2b39", m * 0.75)
        if rng.random() < 0.3:
            blend(img, "#5e6c7a", blob(u + 0.03, 0.45 - h - 0.02, 0.05, 0.015, 0.9) * 0.4)
    blend(img, "#253242", blob(0.14, 0.46, 0.22, 0.035, 0.8) * 0.8)
    # the sun and its broken reflection
    blend(img, "#f07a3a", blob(0.8, 0.2, 0.021, 0.034, 0.25))
    blend(img, "#ffb070", blob(0.8, 0.2, 0.009, 0.015, 0.4))
    width = 0.012 + (V - 0.47) * 0.06
    col = np.clip(1 - np.abs(U - 0.8 + (noise(rng, 30, 6) - 0.5) * 0.02) / width, 0, 1)
    bands = np.clip(np.sin(V * 230 + noise(rng, 40, 6) * 6) * 2, 0, 1)
    blend(img, "#e8743a", col * bands * (V > 0.49) * np.clip(1.15 - V, 0, 1) * 0.95)
    # boats: dark hulls with a figure, and their reflections
    for (u, v, s_) in [(0.43, 0.72, 1.8), (0.28, 0.61, 1.2), (0.18, 0.55, 0.85)]:
        blend(img, "#121a24", blob(u, v, 0.034 * s_, 0.009 * s_, 0.25))
        blend(img, "#121a24", blob(u + 0.005, v - 0.022 * s_, 0.006 * s_, 0.022 * s_, 0.3))
        blend(img, "#18222e", blob(u, v + 0.03 * s_, 0.03 * s_, 0.014 * s_, 0.6) * 0.55)
    angle = np.where(V < 0.47, -0.25 + (noise(rng, 30, 8) - 0.5) * 0.6, (noise(rng, 50, 10) - 0.5) * 0.2).astype(np.float32)
    calm = blob(0.45, 0.42, 0.34, 0.3, 1.0) * 0.6
    return Scene("sunrise", img, angle, ["#6f6a9a", "#5a8aa2", "#4f6f7f"], 0.08, calm, 7.0)


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    for i, make in enumerate([water_lilies, japanese_bridge, sunrise]):
        rng = np.random.default_rng(87 + i)
        scene = make(rng)
        img = paint(scene, 870 + i)
        out = os.path.join(OUT_DIR, f"{scene.name}.webp")
        img.save(out, "WEBP", quality=78, method=6)
        print(f"wrote {out} ({os.path.getsize(out) // 1024} KB)")


if __name__ == "__main__":
    main()
