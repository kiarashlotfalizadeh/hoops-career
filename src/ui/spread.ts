// Marks drawn small that land on one another (shots at the rim on a chart, ten discs in the lane on a phone's court):
// eased apart on the screen so each reads, none far from where it belongs.

interface Pt {
  x: number;
  y: number;
}

/**
 * Marks that land on one another (a dozen at the rim), eased apart: each pair closer than `gap` px is
 * pushed apart along the line between them, a few times over, and none ends up more than `most` px from
 * where it was. Two on the very same spot start a hair apart, each its own way round, so the same shots
 * always land in the same places.
 */
export function spread(pts: readonly Pt[], gap: number, most: number): Pt[] {
  const out = pts.map((p, i) => ({ x: p.x + Math.cos(i * 2.39996) * gap * 0.02, y: p.y + Math.sin(i * 2.39996) * gap * 0.02 }));
  for (let pass = 0; pass < 28; pass++) {
    let moved = false;
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const dx = out[j].x - out[i].x;
        const dy = out[j].y - out[i].y;
        const d = Math.hypot(dx, dy);
        if (d >= gap || d === 0) continue;
        const push = (gap - d) / 2;
        out[i].x -= (dx / d) * push;
        out[i].y -= (dy / d) * push;
        out[j].x += (dx / d) * push;
        out[j].y += (dy / d) * push;
        moved = true;
      }
    }
    // (never far from where it was taken)
    out.forEach((p, i) => {
      const dx = p.x - pts[i].x;
      const dy = p.y - pts[i].y;
      const d = Math.hypot(dx, dy);
      if (d > most) {
        p.x = pts[i].x + (dx / d) * most;
        p.y = pts[i].y + (dy / d) * most;
      }
    });
    if (!moved) break;
  }
  return out;
}
