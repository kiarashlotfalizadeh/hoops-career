// What the browser draws the 3D court with: WebGL 2 at all, and whether on the graphics chip or in software.

/** A WebGL 2 context asked for once and let go (`strict`: only one the browser draws with the graphics chip). */
function probeGL(strict: boolean): boolean {
  try {
    if (typeof document === 'undefined') return false;
    const gl = document.createElement('canvas').getContext('webgl2', strict ? { failIfMajorPerformanceCaveat: true } : undefined);
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

let probed: boolean | null = null;
/** This device draws WebGL 2 (asked once). */
export function canDraw3D(): boolean {
  probed ??= probeGL(false);
  return probed;
}

let soft: boolean | null = null;
/**
 * The browser draws WebGL 2 in software, not on the graphics chip (a headless browser's SwiftShader, a
 * chip it won't use): the 3D court runs slowly there whatever the device can do, and it's said so,
 * not blamed on the device (the playtests' headless phones read "3D is running slowly on this device").
 */
export function softwareGL(): boolean {
  soft ??= canDraw3D() && !probeGL(true);
  return soft;
}

/** How the live court is drawn: the 3D broadcast picture, or the 2D floor from above. */
export type CourtLook = '3d' | 'flat';

/** The court's look: the one chosen, else 3D where the browser draws it on the graphics chip, the 2D floor where it draws in software. */
export const courtLookOf = (chosen: CourtLook | undefined): CourtLook => chosen ?? (softwareGL() ? 'flat' : '3d');
