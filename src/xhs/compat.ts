// The container's floor is Chrome 61. three.js r187's renderer uses WeakRef and
// FinalizationRegistry (Chrome 84+); older WebViews get stand-ins: a plain reference and a
// registry that never fires, so a little bookkeeping for disposed objects isn't cleaned up.
// Imported first, before three.js builds anything.
//
// AbortController (Chrome 66+) is built by three's FileLoader and ImageBitmapLoader in their
// constructors, and GLTFLoader.parseAsync makes a FileLoader every time, so without it no animal
// loads on Chrome 61–65. Nothing here is ever fetched, so a stand-in that only records abort is enough.

if (typeof (window as unknown as Record<string, unknown>).AbortController === 'undefined') {
  (window as unknown as Record<string, unknown>).AbortController = class {
    signal = { aborted: false, addEventListener() {}, removeEventListener() {} };
    abort() {
      this.signal.aborted = true;
    }
  };
}

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
