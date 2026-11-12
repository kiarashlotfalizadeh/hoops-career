// What the ball, the glass and the lights round the board are made of. The ball's leather is pebbled: a
// tile of pebbles is painted on a canvas, and the leather's material reads it from three sides (so the
// ball needs no map of its own), tipping the light on every pebble and dulling the dips between them. The
// glass is clear but for what it mirrors: the lamps show on it however little of the pane itself does.
import {
  CanvasTexture,
  Color,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  RGBAFormat,
  type Texture,
} from 'three';

/** The pebbles' tile: this many dots a side, this many pebbles on it, each about this wide (dots). */
const TILE = 256;
const PEBBLES = 1500;
const PEBBLE_PX = 7.2;
/** How many tiles to a foot of leather (a pebble is then a tenth of an inch: twice life size, to be seen at all). */
const TILES_FT = 2.3;
/** How far a pebble tips the light. */
const DEPTH = 0.9;

/** A number in 0..1 from `i`, the same every time. */
const rnd = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * The pebbles as a tile that repeats: how the leather's face leans at each dot (red and green: across and
 * up the tile) and how high it stands (blue), painted as soft dots on a canvas and read back.
 */
export function pebbles(): Texture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = TILE;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, TILE, TILE);
  ctx.globalCompositeOperation = 'lighten';
  // (a jittered grid, so they pack like pebbles and none sits on another; each drawn again across the tile's edges)
  const side = Math.round(Math.sqrt(PEBBLES));
  for (let i = 0; i < side * side; i++) {
    const cx = (((i % side) + 0.5 + (rnd(i) - 0.5) * 0.7 + (Math.floor(i / side) % 2) * 0.5) / side) * TILE;
    const cy = ((Math.floor(i / side) + 0.5 + (rnd(i + 0.5) - 0.5) * 0.7) / side) * TILE;
    const r = (PEBBLE_PX / 2) * (0.8 + 0.4 * rnd(i + 0.25));
    for (const ox of [-TILE, 0, TILE])
      for (const oy of [-TILE, 0, TILE]) {
        const x = cx + ox;
        const y = cy + oy;
        if (x < -r || y < -r || x > TILE + r || y > TILE + r) continue;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, '#fff');
        g.addColorStop(0.55, '#c8c8c8');
        g.addColorStop(1, '#000');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
  }
  const px = ctx.getImageData(0, 0, TILE, TILE).data;
  const h = (x: number, y: number) => px[(((y + TILE) % TILE) * TILE + ((x + TILE) % TILE)) * 4] / 255;
  const out = new Uint8Array(TILE * TILE * 4);
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const o = (y * TILE + x) * 4;
      out[o] = Math.round(255 * Math.min(1, Math.max(0, 0.5 + (h(x + 1, y) - h(x - 1, y)) * 1.6)));
      out[o + 1] = Math.round(255 * Math.min(1, Math.max(0, 0.5 + (h(x, y + 1) - h(x, y - 1)) * 1.6)));
      out[o + 2] = Math.round(255 * h(x, y));
      out[o + 3] = 255;
    }
  const tex = new DataTexture(out, TILE, TILE, RGBAFormat);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/** The ball's leather in this colour: `skin` is its pebbles (see pebbles). */
export function leather(fill: string, skin: Texture): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({ color: fill, roughness: 0.56, vertexColors: true });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uPebble = { value: skin };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBallP;\nvarying vec3 vBallN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBallP = position;\nvBallN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uPebble;\nuniform mat3 normalMatrix;\nvarying vec3 vBallP;\nvarying vec3 vBallN;')
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `#include <roughnessmap_fragment>
        // the pebbles, read from the three sides of the ball and mixed by which way its face looks
        vec3 ballN = normalize(vBallN);
        vec3 ballW = pow(abs(ballN), vec3(4.0));
        ballW /= ballW.x + ballW.y + ballW.z;
        vec3 pebX = texture2D(uPebble, vBallP.yz * ${TILES_FT.toFixed(2)}).rgb;
        vec3 pebY = texture2D(uPebble, vBallP.zx * ${TILES_FT.toFixed(2)}).rgb;
        vec3 pebZ = texture2D(uPebble, vBallP.xy * ${TILES_FT.toFixed(2)}).rgb;
        float pebH = dot(ballW, vec3(pebX.b, pebY.b, pebZ.b));
        vec3 pebLean = ballW.x * vec3(0.0, pebX.r - 0.5, pebX.g - 0.5) + ballW.y * vec3(pebY.g - 0.5, 0.0, pebY.r - 0.5) + ballW.z * vec3(pebZ.r - 0.5, pebZ.g - 0.5, 0.0);
        // (the dips between pebbles are duller and a little darker: dust and no polish)
        roughnessFactor = clamp(roughnessFactor + (0.55 - pebH) * 0.3, 0.2, 1.0);
        diffuseColor.rgb *= 0.86 + 0.2 * pebH;`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `#include <normal_fragment_maps>
        normal = normalize(normalMatrix * normalize(ballN - pebLean * ${DEPTH.toFixed(2)}));`,
      );
  };
  mat.customProgramCacheKey = () => 'leather';
  return mat;
}

/**
 * The board's glass: all but clear, and what it mirrors (the lamps, the building's light) is drawn at its
 * full strength however clear the pane is.
 */
export function pane(): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({ color: 0xdfeee9, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.13, depthWrite: false, envMapIntensity: 1.1 });
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <opaque_fragment>',
      /* glsl */ `
      // (a pane this clean mirrors more of the building than its bare face would: the stands and the boards show in it faintly)
      totalSpecular *= 2.2;
      float shine = clamp(max(totalSpecular.r, max(totalSpecular.g, totalSpecular.b)), 0.0, 1.0);
      float seen = clamp(diffuseColor.a + shine * (1.0 - diffuseColor.a), 0.0, 1.0);
      outgoingLight = (totalDiffuse * diffuseColor.a + totalSpecular) / max(seen, 1e-3);
      diffuseColor.a = seen;
      #include <opaque_fragment>`,
    );
  };
  mat.customProgramCacheKey = () => 'pane';
  return mat;
}

/** The lights round the board, off. */
const LED_OFF = new Color(0x2a0707);
const LED_ON = new Color(1, 0.035, 0.02);

/** The strip of lights round each board: red at the horn, dark the rest of the time (see lit). */
export function lights(): MeshBasicMaterial {
  return new MeshBasicMaterial({ color: LED_OFF.clone(), toneMapped: false });
}

/** The board's lights on or off. */
export function lit(mat: MeshBasicMaterial, on: boolean) {
  mat.color.copy(on ? LED_ON : LED_OFF);
}

/** The ball's shadow where it meets the floor: a soft round dark, darkest in the middle. */
export function blob(): CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const ctx = cv.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.62)');
  g.addColorStop(0.8, 'rgba(0,0,0,0.14)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new CanvasTexture(cv);
}
