// Drawing helpers for the canvas UI: the same look as style.css, by hand.
// Only plain Canvas 2D calls the mini game supports (no Path2D, roundRect, ellipse or filters).

export type Ctx = CanvasRenderingContext2D;

/** The palette from style.css. */
export const INK = '#fbf6ec';
export const INK_2 = 'rgba(251, 246, 236, 0.8)';
export const INK_3 = 'rgba(251, 246, 236, 0.58)';
export const GOLD = '#f3d79a';
export const GOLD_SOFT = 'rgba(243, 215, 154, 0.5)';
/** no backdrop blur on a canvas, so the glass is a little darker to compensate */
export const GLASS = 'rgba(30, 25, 20, 0.42)';
export const LINE = 'rgba(251, 246, 236, 0.2)';
export const TRACK_S = 0.18;
export const TRACK_L = 0.35;

export const ease = (t: number) => {
  // cubic-bezier(0.22, 0.61, 0.36, 1), close enough
  t = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - t, 2.6);
};
export const easeInOut = (t: number) => {
  t = Math.min(1, Math.max(0, t));
  return t * t * (3 - 2 * t);
};
/** 0..1 progress of something that started at `start` and takes `dur` */
export const progress = (now: number, start: number, dur: number) => Math.min(1, Math.max(0, (now - start) / dur));

export interface TextStyle {
  size: number;
  color?: string;
  /** letter spacing in em */
  track?: number;
  align?: 'left' | 'center' | 'right';
  family?: string;
  /** soft dark shadow so text reads over bright sky */
  lift?: boolean;
}

export class Painter {
  /** families: body text and the two-character title */
  constructor(
    readonly ctx: Ctx,
    readonly serif: string,
    readonly title: string,
  ) {}

  private widths = new Map<string, number>();

  font(size: number, family = this.serif) {
    this.ctx.font = `${size}px ${family}`;
  }

  private charWidth(ch: string, key: string) {
    const k = key + ch;
    let w = this.widths.get(k);
    if (w === undefined) {
      w = this.ctx.measureText(ch).width;
      this.widths.set(k, w);
    }
    return w;
  }

  /** Width without the spacing after the last character (CSS adds it; centring shouldn't). */
  measure(text: string, s: TextStyle) {
    this.font(s.size, s.family);
    const key = `${s.size}|${s.family ?? this.serif}|`;
    const track = (s.track ?? 0) * s.size;
    let w = 0;
    for (const ch of text) w += this.charWidth(ch, key) + track;
    return Math.max(0, w - track);
  }

  /** One line at baseline-centre `y` (middle of the glyphs). Returns its width. */
  text(text: string, x: number, y: number, s: TextStyle) {
    const ctx = this.ctx;
    const w = this.measure(text, s);
    const align = s.align ?? 'left';
    let cx = align === 'left' ? x : align === 'center' ? x - w / 2 : x - w;
    ctx.fillStyle = s.color ?? INK;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    if (s.lift) this.lift(s.size > 30 ? 18 : 8);
    const track = (s.track ?? 0) * s.size;
    if (!track) ctx.fillText(text, cx, y);
    else {
      const key = `${s.size}|${s.family ?? this.serif}|`;
      for (const ch of text) {
        ctx.fillText(ch, cx, y);
        cx += this.charWidth(ch, key) + track;
      }
    }
    if (s.lift) this.noShadow();
    return w;
  }

  /** Break `text` into lines no wider than `max` (CJK breaks anywhere). */
  wrap(text: string, max: number, s: TextStyle) {
    if (this.measure(text, s) <= max) return [text];
    const lines: string[] = [];
    let line = '';
    for (const ch of text) {
      // keep closing punctuation with the line before it
      if (line && !'，。、？！……—）'.includes(ch) && this.measure(line + ch, s) > max) {
        lines.push(line);
        line = '';
      }
      line += ch;
    }
    if (line) lines.push(line);
    return lines;
  }

  lift(blur: number) {
    const ctx = this.ctx;
    ctx.shadowColor = 'rgba(20, 14, 8, 0.5)';
    ctx.shadowBlur = blur;
    ctx.shadowOffsetY = 1;
  }

  noShadow() {
    const ctx = this.ctx;
    ctx.shadowColor = 'rgba(0, 0, 0, 0)';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }

  roundRect(x: number, y: number, w: number, h: number, r: number) {
    const ctx = this.ctx;
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /** A glass panel with a hairline border. */
  panel(x: number, y: number, w: number, h: number, r: number, border = LINE, fill = GLASS) {
    const ctx = this.ctx;
    this.roundRect(x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    this.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, r);
    ctx.stroke();
  }

  circle(x: number, y: number, r: number) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }

  /** A radial fade from `color` at the centre to transparent, stretched to an ellipse. */
  glow(cx: number, cy: number, rx: number, ry: number, color: string, alpha: number, stop = 0.72) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(rx, ry);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, `rgba(${color}, ${alpha})`);
    g.addColorStop(stop, `rgba(${color}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }

  /** An SVG path (M L H V C S Z, absolute or relative) drawn into a box of `size` from a 24-unit viewBox. */
  svg(d: string, x: number, y: number, size: number, view = 24) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size / view, size / view);
    ctx.beginPath();
    runPath(ctx, d);
    ctx.restore();
  }
}

function runPath(ctx: Ctx, d: string) {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)/g) ?? [];
  let i = 0;
  let cmd = '';
  let x = 0, y = 0, sx = 0, sy = 0;
  let c2x = 0, c2y = 0; // last cubic control point, for S
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    switch (cmd.toUpperCase()) {
      case 'M':
        x = ox + num();
        y = oy + num();
        sx = x;
        sy = y;
        ctx.moveTo(x, y);
        cmd = rel ? 'l' : 'L'; // further pairs are lines
        break;
      case 'L':
        x = ox + num();
        y = oy + num();
        ctx.lineTo(x, y);
        break;
      case 'H':
        x = ox + num();
        ctx.lineTo(x, y);
        break;
      case 'V':
        y = oy + num();
        ctx.lineTo(x, y);
        break;
      case 'C': {
        const x1 = ox + num(), y1 = oy + num();
        c2x = ox + num();
        c2y = oy + num();
        x = ox + num();
        y = oy + num();
        ctx.bezierCurveTo(x1, y1, c2x, c2y, x, y);
        break;
      }
      case 'S': {
        const x1 = 2 * x - c2x, y1 = 2 * y - c2y;
        c2x = ox + num();
        c2y = oy + num();
        x = ox + num();
        y = oy + num();
        ctx.bezierCurveTo(x1, y1, c2x, c2y, x, y);
        break;
      }
      case 'Z':
        x = sx;
        y = sy;
        ctx.closePath();
        break;
      default:
        return;
    }
    if (!'CS'.includes(cmd.toUpperCase())) {
      c2x = x;
      c2y = y;
    }
  }
}

export const HOOF =
  'M12 3.6c-4.5 0-7.3 3.8-7.3 8.4 0 3.6 1.5 6.7 3.4 8.1.8.6 1.8 0 1.8-.9v-2.9c0-1 .9-1.7 2.1-1.7s2.1.7 2.1 1.7v2.9c0 .9 1 1.5 1.8.9 1.9-1.4 3.4-4.5 3.4-8.1 0-4.6-2.8-8.4-7.3-8.4z';
export const SPEAKER = 'M4 9.5h3.2L12 5.6v12.8l-4.8-3.9H4z';
