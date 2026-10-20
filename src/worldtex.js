// Procedural textures for the world: wall finishes (brick, clapboard,
// concrete panels, plaster), asphalt, grass, dirt, floors and vehicle grime.
// Everything is drawn into canvases at startup; nothing is downloaded.
// Walls are textured in world space by a small shader patch, so a brick is
// the same size on every wall however the wall box is scaled.
import * as THREE from 'three';

let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
function tex(size, draw, { srgb = true, repeat = 1 } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function grain(g, S, amount, n = 9000, alpha = 0.18) {
  for (let i = 0; i < n; i++) {
    const v = Math.floor(128 + (rnd() - 0.5) * 255 * amount);
    g.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 1 + rnd() * 2);
  }
}
function stains(g, S, n, col, r0, r1) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * S, y = rnd() * S, r = r0 + rnd() * (r1 - r0);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, col); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

let WT = null;
export function worldTextures() {
  if (WT) return WT;
  // Wall finishes are greyscale detail (tinted by each wall's colour). One
  // texture tile covers 1 m × 1 m of wall.
  const brick = tex(256, (g, S) => {
    g.fillStyle = '#b8b8b8'; g.fillRect(0, 0, S, S); // mortar
    const rows = 13, h = S / rows, w = h * 3;
    for (let r = 0; r < rows; r++) for (let x = -((r % 2) * w) / 2; x < S; x += w) {
      const v = Math.floor(175 + (rnd() - 0.5) * 70);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x + 1.5, r * h + 1.5, w - 3, h - 3);
    }
    grain(g, S, 0.7);
  }, { srgb: false });
  const siding = tex(256, (g, S) => {
    const boards = 5, h = S / boards;
    for (let b = 0; b < boards; b++) {
      const grd = g.createLinearGradient(0, b * h, 0, (b + 1) * h);
      grd.addColorStop(0, '#e8e8e8'); grd.addColorStop(0.85, '#c8c8c8'); grd.addColorStop(1, '#8a8a8a');
      g.fillStyle = grd; g.fillRect(0, b * h, S, h);
    }
    grain(g, S, 0.4, 6000, 0.12);
  }, { srgb: false });
  const concrete = tex(256, (g, S) => {
    g.fillStyle = '#c4c4c4'; g.fillRect(0, 0, S, S);
    grain(g, S, 0.5, 14000, 0.2);
    stains(g, S, 8, 'rgba(90,90,90,0.18)', 10, 40);
    g.fillStyle = 'rgba(70,70,70,0.6)'; g.fillRect(0, 0, S, 2); g.fillRect(0, 0, 2, S); // panel seams
  }, { srgb: false });
  const plaster = tex(256, (g, S) => {
    g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, S, S);
    grain(g, S, 0.25, 9000, 0.12);
    stains(g, S, 4, 'rgba(120,120,120,0.08)', 20, 60);
  }, { srgb: false });
  // Ground
  const asphalt = tex(512, (g, S) => {
    g.fillStyle = '#3a3a3c'; g.fillRect(0, 0, S, S);
    grain(g, S, 0.5, 30000, 0.14);
    stains(g, S, 10, 'rgba(20,20,22,0.35)', 20, 70); // oil and patches
    g.fillStyle = 'rgba(30,30,32,0.5)'; for (let i = 0; i < 3; i++) g.fillRect(rnd() * S, rnd() * S, 40 + rnd() * 80, 30 + rnd() * 60);
    g.strokeStyle = 'rgba(15,15,15,0.7)'; g.lineWidth = 1.5; // cracks
    for (let i = 0; i < 9; i++) {
      let x = rnd() * S, y = rnd() * S; g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 8; k++) { x += (rnd() - 0.5) * 40; y += (rnd() - 0.5) * 40; g.lineTo(x, y); }
      g.stroke();
    }
  }, { repeat: 1 });
  const grass = tex(512, (g, S) => {
    g.fillStyle = '#3d4a2c'; g.fillRect(0, 0, S, S);
    stains(g, S, 30, 'rgba(70,82,40,0.45)', 20, 80);
    stains(g, S, 20, 'rgba(40,46,26,0.5)', 15, 60);
    stains(g, S, 8, 'rgba(90,80,50,0.35)', 10, 30); // bare patches
    for (let i = 0; i < 26000; i++) { // blades
      const v = rnd();
      g.fillStyle = v < 0.5 ? 'rgba(80,100,50,0.5)' : v < 0.8 ? 'rgba(45,60,30,0.5)' : 'rgba(110,115,70,0.4)';
      g.fillRect(rnd() * S, rnd() * S, 1, 2 + rnd() * 3);
    }
  });
  const dirt = tex(256, (g, S) => {
    g.fillStyle = '#5a4a35'; g.fillRect(0, 0, S, S);
    grain(g, S, 0.8, 16000, 0.25);
    stains(g, S, 10, 'rgba(70,56,38,0.5)', 10, 40);
    g.fillStyle = 'rgba(120,110,95,0.6)'; for (let i = 0; i < 300; i++) g.fillRect(rnd() * S, rnd() * S, 2, 2); // gravel
  });
  // Floors (one tile per metre)
  const planks = tex(256, (g, S) => {
    const n = 6, w = S / n;
    for (let i = 0; i < n; i++) {
      const v = Math.floor(150 + (rnd() - 0.5) * 50);
      g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(i * w, 0, w, S);
      g.fillStyle = 'rgba(60,60,60,0.7)'; g.fillRect(i * w, 0, 1.5, S);
      const cut = rnd() * S; g.fillRect(i * w, cut, w, 1.5);
      for (let k = 0; k < 14; k++) { g.fillStyle = `rgba(80,80,80,${0.1 + rnd() * 0.15})`; g.fillRect(i * w + rnd() * w, 0, 1, S); }
    }
  }, { srgb: false });
  const tiles = tex(256, (g, S) => {
    const n = 4, w = S / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const v = Math.floor(205 + (rnd() - 0.5) * 30);
      g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(i * w + 1.5, j * w + 1.5, w - 3, w - 3);
    }
    g.globalCompositeOperation = 'destination-over'; g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, S, S);
    g.globalCompositeOperation = 'source-over';
    grain(g, S, 0.2, 3000, 0.1);
  }, { srgb: false });
  const slab = tex(256, (g, S) => {
    g.fillStyle = '#b0b0b0'; g.fillRect(0, 0, S, S);
    grain(g, S, 0.5, 12000, 0.2);
    stains(g, S, 6, 'rgba(60,60,60,0.25)', 15, 50);
    g.fillStyle = 'rgba(70,70,70,0.5)'; g.fillRect(0, 0, S, 1.5); g.fillRect(0, 0, 1.5, S);
  }, { srgb: false });
  // Vehicles: dust, mud splash low down, a few rust spots (greyscale-ish,
  // multiplies the paint)
  const grime = tex(256, (g, S) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
    stains(g, S, 10, 'rgba(170,160,140,0.12)', 10, 40);
    stains(g, S, 5, 'rgba(120,70,40,0.3)', 2, 6); // rust
    for (let i = 0; i < 250; i++) { g.fillStyle = `rgba(120,110,90,${0.05 + rnd() * 0.12})`; g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 3, 1 + rnd() * 3); }
    for (let i = 0; i < 30; i++) { g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(rnd() * S, rnd() * S, 6 + rnd() * 20, 1); } // scratches
  });
  WT = { brick, siding, concrete, plaster, asphalt, grass, dirt, planks, tiles, slab, grime };
  return WT;
}

// Wall patterns (per instance): which finish a wall gets.
export const WALL = { brick: 0, siding: 1, concrete: 2, plaster: 3 };

// Patch a material so it samples one of the four wall finishes in world
// space, picked per instance by the `pattern` attribute.
export function wallMaterial() {
  const T = worldTextures();
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.92 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { tBrick: { value: T.brick }, tSiding: { value: T.siding }, tConcrete: { value: T.concrete }, tPlaster: { value: T.plaster } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float pattern;\nvarying float vPattern;\nvarying vec3 vWPos;\nvarying vec3 vWNorm;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vPattern = pattern;
        vec4 wp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
        #endif
        wp = modelMatrix * wp;
        vWPos = wp.xyz;
        vec3 wn = objectNormal;
        #ifdef USE_INSTANCING
          wn = mat3(instanceMatrix) * wn;
        #endif
        vWNorm = normalize(mat3(modelMatrix) * wn);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tBrick, tSiding, tConcrete, tPlaster;\nvarying float vPattern;\nvarying vec3 vWPos;\nvarying vec3 vWNorm;')
      .replace('#include <map_fragment>', `
        vec3 an = abs(vWNorm);
        vec2 wuv = an.y > 0.6 ? vWPos.xz : (an.x > an.z ? vWPos.zy : vWPos.xy);
        vec3 det;
        if (vPattern < 0.5) det = texture2D(tBrick, wuv).rgb;
        else if (vPattern < 1.5) det = texture2D(tSiding, wuv).rgb;
        else if (vPattern < 2.5) det = texture2D(tConcrete, wuv / 2.0).rgb;
        else det = texture2D(tPlaster, wuv).rgb;
        diffuseColor.rgb *= 0.35 + det * 0.85;`);
  };
  mat.customProgramCacheKey = () => 'walls-v1';
  return mat;
}

// A plain textured material for floors / ground: UVs must be in metres.
export function groundMaterial(map, color, repeatPerMetre, roughness = 0.95) {
  const t = map.clone();
  t.needsUpdate = true;
  t.repeat.set(repeatPerMetre, repeatPerMetre);
  return new THREE.MeshStandardMaterial({ map: t, color, roughness });
}

// Texture coordinates from (world) positions, projected along each face's
// normal: `scale` texture tiles per metre.
export function worldUV(geo, scale = 1) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  if (!pos || !nor) return geo;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let u, v;
    if (ay >= ax && ay >= az) { u = x; v = z; } else if (ax >= az) { u = z; v = y; } else { u = x; v = y; }
    uv[i * 2] = u * scale; uv[i * 2 + 1] = v * scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

// Shared textured materials that the static-scenery merge may batch (UVs
// are then set from world position, one tile per `perMetre` metres⁻¹).
const texMats = new Map();
export function mergeableMaterial(name, color = 0xffffff, perMetre = 1, roughness = 0.95) {
  const k = `${name}|${color}|${perMetre}`;
  if (!texMats.has(k)) {
    const m = new THREE.MeshStandardMaterial({ map: worldTextures()[name], color, roughness });
    m.userData.mergeUV = perMetre;
    texMats.set(k, m);
  }
  return texMats.get(k);
}
