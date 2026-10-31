// The container's floor is Chrome 61. three.js r187's renderer uses WeakRef and
// FinalizationRegistry (Chrome 84+); older WebViews get stand-ins: a plain reference and a
// registry that never fires, so a little bookkeeping for disposed objects isn't cleaned up.
// Imported first, before three.js builds anything.

const g = window as unknown as Record<string, unknown>;

if (typeof g.WeakRef === 'undefined') {
  g.WeakRef = class<T> {
    constructor(private target: T) {}
    deref() {
      return this.target;
    }
  };
}

if (typeof g.FinalizationRegistry === 'undefined') {
  g.FinalizationRegistry = class {
    register() {}
    unregister() {
      return false;
    }
  };
}
