// Keyboard/mouse state with pointer lock. Edge-triggered actions are
// cleared each frame by endFrame().
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mdx = 0; this.mdy = 0;
    this.mouse = [false, false];
    this.mousePressed = false;
    this.wheel = 0;
    this.softLive = false; // keyboard works while waiting for a click to recapture the mouse
    document.addEventListener('pointerlockerror', () => this.onLockFail?.());
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      // Typing into a text field (e.g. the dev console) shouldn't drive the game.
      if (e.target.closest?.('input, textarea, select')) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (e.code === 'Tab' || (e.code === 'Space' && this.locked)) e.preventDefault();
    });
    // Browser shortcuts that are easy to hit with Ctrl held (it drops a
    // drone, and sits by the movement keys): close tab, bookmark, save page,
    // find, print, new window. The page can stop most of these; Ctrl+W only
    // in fullscreen (keyboard lock), elsewhere the leave prompt catches it.
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && ['KeyW', 'KeyD', 'KeyS', 'KeyF', 'KeyP', 'KeyN', 'KeyQ', 'KeyE', 'KeyR', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'KeyB', 'KeyU', 'KeyO'].includes(e.code)
        && !e.target.closest?.('input, textarea, select')) e.preventDefault();
    }, { capture: true });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse = [false, false]; });
    // Mouse look. Browsers sometimes report a bogus jump: in the first events
    // after the pointer is (re)locked, and now and then with OS mouse
    // acceleration. Those are dropped so the view doesn't flick.
    this.settleUntil = 0;
    this.recent = 8; // running average of real movement (px per event)
    document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement === canvas) this.settleUntil = performance.now() + 120; });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return;
      if (performance.now() < this.settleUntil) return;
      const m = Math.hypot(e.movementX, e.movementY);
      // A spike is one isolated huge event; a real fast flick is a run of them
      const spike = m > 200 && m > this.recent * 12 && !this.lastBig;
      this.lastBig = m > 200;
      if (spike) return;
      this.recent += (Math.max(m, 4) - this.recent) * 0.1;
      this.mdx += e.movementX; this.mdy += e.movementY;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (document.pointerLockElement !== canvas) return;
      if (e.button === 0) { this.mouse[0] = true; this.mousePressed = true; }
      if (e.button === 2) this.mouse[1] = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse[0] = false;
      if (e.button === 2) this.mouse[1] = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { if (document.pointerLockElement === canvas) { this.wheel += Math.sign(e.deltaY); e.preventDefault(); } }, { passive: false });
  }

  // Browsers refuse pointer lock from an Escape key press (it isn't a user
  // activation), so a failed lock is reported instead of silently ignored.
  // Raw (unaccelerated) movement where supported: no acceleration spikes.
  lock() {
    const c = this.canvas;
    if (!c.requestPointerLock || this.locked) return;
    const plain = () => { const q = c.requestPointerLock(); if (q?.catch) q.catch(() => this.onLockFail?.()); };
    let p;
    try { p = c.requestPointerLock({ unadjustedMovement: true }); } catch { return plain(); }
    // Raw input not supported here: lock normally instead
    if (p?.catch) p.catch((e) => (e?.name === 'NotSupportedError' ? plain() : this.onLockFail?.()));
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  get locked() { return document.pointerLockElement === this.canvas; }

  state() {
    const k = (c) => this.keys.has(c);
    const p = (c) => this.pressed.has(c);
    const live = this.locked;
    const keys = live || this.softLive;
    return {
      f: keys && k('KeyW') ? 1 : 0, b: keys && k('KeyS') ? 1 : 0,
      l: keys && k('KeyA') ? 1 : 0, r: keys && k('KeyD') ? 1 : 0,
      sprint: k('ShiftLeft') || k('ShiftRight'),
      crouchToggle: p('KeyC'), prone: p('KeyX'), jump: p('Space'),
      wheel: live ? this.wheel : 0,
      aim: live && this.mouse[1],
      fire: live && this.mouse[0],
      firePressed: live && this.mousePressed,
      reload: p('KeyR'), interact: p('KeyF'),
      leanL: live && k('KeyQ'), leanR: live && k('KeyE'),
      slot1: p('Digit1'), slot2: p('Digit2'),
      hot: [p('Digit3'), p('Digit4'), p('Digit5'), p('Digit6')],
      check: p('KeyT'), fireMode: p('KeyZ'),
      flashlight: p('KeyL'),
      inventory: p('Tab') || p('KeyI'), map: p('KeyM'),
      heal: p('KeyH'), lower: p('KeyG'), designate: p('KeyN'),
      mdx: live ? this.mdx : 0, mdy: live ? this.mdy : 0,
    };
  }

  endFrame() {
    this.pressed.clear();
    this.mousePressed = false;
    this.wheel = 0;
    this.mdx = 0; this.mdy = 0;
  }
}
