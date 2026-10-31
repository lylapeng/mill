// The mini game runtime is not a browser: no window, document or TextDecoder.
// three.js guards most browser globals itself; these fill the gaps it (and GLTFLoader) step in.

const g = (typeof GameGlobal !== 'undefined' ? GameGlobal : globalThis) as Record<string, unknown>;

/** UTF-8 only, which is all GLTFLoader asks of it. */
class Utf8Decoder {
  decode(input?: ArrayBuffer | ArrayBufferView) {
    if (!input) return '';
    const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    const codes: number[] = [];
    let out = '';
    for (let i = 0; i < bytes.length; ) {
      const b = bytes[i++];
      let c: number;
      if (b < 0x80) c = b;
      else if (b < 0xe0) c = ((b & 0x1f) << 6) | (bytes[i++] & 0x3f);
      else if (b < 0xf0) c = ((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
      else {
        c = ((b & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
        c -= 0x10000;
        codes.push(0xd800 + (c >> 10));
        c = 0xdc00 + (c & 0x3ff);
      }
      codes.push(c);
      if (codes.length > 8192) {
        out += String.fromCharCode(...codes);
        codes.length = 0;
      }
    }
    return out + String.fromCharCode(...codes);
  }
}

/** three's loaders each make one at construction; nothing here is ever fetched, so nothing aborts. */
class NoAbortController {
  readonly signal = { aborted: false, addEventListener() {}, removeEventListener() {} };
  abort() {}
}

if (typeof g.TextDecoder === 'undefined') g.TextDecoder = Utf8Decoder;
if (typeof g.AbortController === 'undefined') g.AbortController = NoAbortController;
// Clock/Timer in three read performance.now(); Date.now() is plenty for a frame clock
if (typeof g.performance === 'undefined') g.performance = { now: () => Date.now() };

/** three.js listens for context loss on its canvas; the mini game canvas has no events. */
export function patchCanvas(canvas: HTMLCanvasElement) {
  const c = canvas as unknown as Record<string, unknown>;
  if (typeof c.addEventListener !== 'function') c.addEventListener = () => {};
  if (typeof c.removeEventListener !== 'function') c.removeEventListener = () => {};
}
