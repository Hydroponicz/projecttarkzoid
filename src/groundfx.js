// Snow and wet ground, in the world's own materials. Every upward-facing
// surface out in the open (roads, sidewalks, curbs, fields, roofs, car
// parks, the tops of walls and bins) whitens as snow builds up, or darkens
// when it's soaked; nothing indoors does. Indoors is told apart by a small
// map of the buildings: each texel holds the height of the building there,
// and only surfaces at roof height or above, or outside every building, get
// weather on them. (It used to be a big sheet laid over the ground, under
// the roads and sidewalks: from a distance it covered them, but looking
// down at your feet the street showed through.)
import * as THREE from 'three';

export const GROUND = {
  snow: { value: 0 },  // 0..1 snow cover
  wet: { value: 0 },   // 0..1 how soaked the ground is
  cover: { value: null },                       // building heights (red, / maxH)
  area: { value: new THREE.Vector4(0, 0, 1, 1) }, // x0, z0, size, maxH
};
const MAX_H = 120;

// The building map, for a new town: res² texels over the whole map
export function buildCover(buildings, levels, half, wallH, LH, res = 1024) {
  const size = half * 2 + 80, x0 = -size / 2, z0 = -size / 2, per = res / size;
  const data = new Uint8Array(res * res);
  for (const b of buildings) {
    if (b.area) continue;
    const B = levels?.buildingAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
    const top = B ? (B.top + 1) * LH : wallH;
    const v = Math.max(1, Math.min(255, Math.round((top / MAX_H) * 255)));
    const i0 = Math.max(0, Math.floor((b.x0 - x0) * per)), i1 = Math.min(res - 1, Math.floor((b.x1 - x0) * per));
    const j0 = Math.max(0, Math.floor((b.z0 - z0) * per)), j1 = Math.min(res - 1, Math.floor((b.z1 - z0) * per));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) data[j * res + i] = Math.max(data[j * res + i], v);
  }
  GROUND.cover.value?.dispose();
  const tex = new THREE.DataTexture(data, res, res, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  GROUND.cover.value = tex;
  GROUND.area.value.set(x0, z0, size, MAX_H);
}

// Give these materials snow and wetness (once each)
export function weatherize(mat) {
  if (!mat || mat.userData.weather || !(mat.isMeshStandardMaterial || mat.isMeshLambertMaterial || mat.isMeshBasicMaterial)) return;
  mat.userData.weather = true;
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.uniforms.gSnow = GROUND.snow; sh.uniforms.gWet = GROUND.wet;
    sh.uniforms.gCover = GROUND.cover; sh.uniforms.gArea = GROUND.area;
    sh.vertexShader = 'varying vec3 vGroundW;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
  vec4 gW = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    gW = instanceMatrix * gW;
  #endif
  vGroundW = (modelMatrix * gW).xyz;`);
    sh.fragmentShader = 'varying vec3 vGroundW;\nuniform float gSnow;\nuniform float gWet;\nuniform sampler2D gCover;\nuniform vec4 gArea;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  if (gSnow + gWet > 0.001) {
    // facing up (the face's own normal, from screen-space derivatives)
    float gUp = smoothstep(0.5, 0.85, normalize(cross(dFdx(vGroundW), dFdy(vGroundW))).y);
    // out in the open: not under a roof (on the roof itself is fine)
    vec2 gUV = (vGroundW.xz - gArea.xy) / gArea.z;
    float gTop = texture2D(gCover, gUV).r * gArea.w;
    float gOpen = (gTop < 0.01 || vGroundW.y > gTop - 0.35) ? 1.0 : 0.0;
    float gK = gUp * gOpen;
    diffuseColor.rgb *= 1.0 - gWet * 0.45 * gK;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.91, 0.95), gSnow * gK);
  }`);
  };
  mat.customProgramCacheKey = () => (prevKey ? prevKey.call(mat) : '') + '|weather';
  mat.needsUpdate = true;
}

export function weatherizeAll(root) {
  root.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) weatherize(m); });
}
