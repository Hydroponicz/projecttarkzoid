// The dynamic lights, a fixed set. three.js builds every shader for the
// number of lights in the scene: each light costs every pixel drawn, even at
// zero intensity, and adding one (an explosion, a campfire) recompiles every
// material, a long hitch. So the scene has exactly two point lights:
//  - the flash: muzzle flashes, explosions, cannon hits. Whichever is
//    brightest right now gets it, and it fades the way that one should.
//  - the fire: the campfire nearest you, flickering.
// (Plus the sun, the sky and one spotlight, the flashlight, which doubles as
// the headlights when you drive.)
import * as THREE from 'three';

// Furniture and fittings inside buildings sit on this layer as well: the
// cameras see it, the flashlight's shadows include it, the sun's don't (it's
// under a roof)
export const INTERIOR_LAYER = 2;

export class DynLights {
  constructor(scene) {
    this.flash = new THREE.PointLight(0xffaa55, 0, 12, 2);
    this.fire = new THREE.PointLight(0xff8a3a, 0, 14, 1.6);
    scene.add(this.flash, this.fire);
    this.expFade = 40; this.linFade = 0;
    this.fireAt = null;
  }

  // A flash at pos. exp: fades by e^(-exp·t); linear: loses that much a second.
  burst(pos, intensity, { color = 0xffaa55, distance = 12, decay = 2, exp = 0, linear = 0 } = {}) {
    // a brighter flash that's still going keeps the light
    if (this.flash.intensity > intensity * 1.2) return;
    const L = this.flash;
    L.position.copy(pos); L.color.setHex(color); L.distance = distance; L.decay = decay;
    L.intensity = intensity;
    this.expFade = exp; this.linFade = linear || (exp ? 0 : 300);
  }

  // fires: positions of lit campfires; at: where you are
  update(dt, at, fires) {
    const L = this.flash;
    if (L.intensity > 0) {
      if (this.expFade) L.intensity *= Math.exp(-dt * this.expFade);
      if (this.linFade) L.intensity -= this.linFade * dt;
      if (L.intensity < 0.05) L.intensity = 0;
    }
    let best = null, bd = 40;
    for (const f of fires) { const d = Math.hypot(f.x - at.x, f.z - at.z); if (d < bd) { bd = d; best = f; } }
    this.fireAt = best;
    if (best) {
      const t = performance.now() / 1000;
      this.fire.position.set(best.x, (best.base || 0) + 0.8, best.z);
      this.fire.intensity = 10 + Math.sin(t * 13 + best.x) * 2 + Math.random() * 2;
    } else this.fire.intensity = 0;
  }
}

// The viewmodel (your hands and gun) used to carry its own little fill light
// so it never went black at night; that light lit every pixel on screen. The
// same fill is now a term in the viewmodel's own materials.
export const VM_FILL = { value: 0.06 };
export function vmFill(root) {
  root.traverse((o) => {
    const mats = o.isMesh ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) {
      if (!m || m.userData.vmFill || !(m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial)) continue;
      m.userData.vmFill = true;
      const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
      m.onBeforeCompile = (sh, r) => {
        prev?.call(m, sh, r);
        sh.uniforms.vmFill = VM_FILL;
        sh.fragmentShader = 'uniform float vmFill;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * vmFill;');
      };
      m.customProgramCacheKey = () => (prevKey ? prevKey.call(m) : '') + '|vmfill';
      m.needsUpdate = true;
    }
  });
}
