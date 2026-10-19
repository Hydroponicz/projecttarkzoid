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
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (e.code === 'Tab') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse = [false, false]; });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas) { this.mdx += e.movementX; this.mdy += e.movementY; }
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
  }

  lock() { this.canvas.requestPointerLock?.()?.catch?.(() => {}); }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  get locked() { return document.pointerLockElement === this.canvas; }

  state() {
    const k = (c) => this.keys.has(c);
    const p = (c) => this.pressed.has(c);
    const live = this.locked;
    return {
      f: live && k('KeyW') ? 1 : 0, b: live && k('KeyS') ? 1 : 0,
      l: live && k('KeyA') ? 1 : 0, r: live && k('KeyD') ? 1 : 0,
      sprint: k('ShiftLeft') || k('ShiftRight'),
      crouch: k('KeyC'),
      aim: live && this.mouse[1],
      fire: live && this.mouse[0],
      firePressed: live && this.mousePressed,
      reload: p('KeyR'), interact: p('KeyF') || p('KeyE'),
      swap: p('KeyQ'), slot1: p('Digit1'), slot2: p('Digit2'),
      flashlight: p('KeyL') || p('KeyT'),
      inventory: p('Tab') || p('KeyI'), map: p('KeyM'),
      heal: p('KeyH'),
      mdx: live ? this.mdx : 0, mdy: live ? this.mdy : 0,
    };
  }

  endFrame() {
    this.pressed.clear();
    this.mousePressed = false;
    this.mdx = 0; this.mdy = 0;
  }
}
