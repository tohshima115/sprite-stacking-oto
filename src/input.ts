const PREVENT_CODES = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space',
]);

export class Input {
  down = new Set<string>();
  pressed = new Set<string>();
  downKeys = new Set<string>();
  pressedKeys = new Set<string>();
  wheel = 0;
  dragDX = 0;
  private dragging = false;
  private lastTouchX = 0;
  constructor(el: HTMLElement) {
    addEventListener('keydown', (e) => {
      if (PREVENT_CODES.has(e.code)) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
      const lk = e.key ? e.key.toLowerCase() : '';
      if (lk) {
        if (!this.downKeys.has(lk)) this.pressedKeys.add(lk);
        this.downKeys.add(lk);
      }
    });
    addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      const lk = e.key ? e.key.toLowerCase() : '';
      if (lk) this.downKeys.delete(lk);
    });
    addEventListener('blur', () => {
      this.down.clear();
      this.downKeys.clear();
      this.dragging = false;
    });
    el.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    el.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.lastTouchX = e.clientX;
      try { el.focus({ preventScroll: true }); } catch { /* ignore */ }
      try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    });
    el.addEventListener('pointerup', () => { this.dragging = false; });
    el.addEventListener('pointercancel', () => { this.dragging = false; });
    el.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.movementX || (e.clientX - this.lastTouchX);
      this.lastTouchX = e.clientX;
      this.dragDX += dx;
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  isDown(code: string, keyChar?: string) {
    return this.down.has(code) || (keyChar !== undefined && this.downKeys.has(keyChar));
  }
  wasPressed(code: string, keyChar?: string) {
    return this.pressed.has(code) || (keyChar !== undefined && this.pressedKeys.has(keyChar));
  }
  setVirtual(code: string, active: boolean) {
    if (active) { if (!this.down.has(code)) this.pressed.add(code); this.down.add(code); }
    else { this.down.delete(code); }
  }
  tapKey(code: string) { this.pressed.add(code); }
  endFrame() {
    this.pressed.clear();
    this.pressedKeys.clear();
    this.wheel = 0;
    this.dragDX = 0;
  }
}
