/**
 * 记录式 Canvas 2D mock：把 ctx 的方法调用与属性赋值按序记录下来，
 * 供渲染原语单测断言（path 序列 / fillText 内容 / 颜色参数 / 坐标）。
 * 用法：const ctx = createMockCtx(); drawXxx(ctx as unknown as CanvasRenderingContext2D, ...);
 * 断言：ctx.calls（全序列）/ callsOf(ctx,'fillText') / propSets(ctx,'strokeStyle')。
 */

export interface CtxCall {
  /** 方法名，或 `set:<prop>` 表示属性赋值 */
  m: string;
  a: unknown[];
}

export interface MockCtx {
  calls: CtxCall[];
}

/** 需要记录的属性（绘制代码会写的状态属性） */
const PROPS = [
  'strokeStyle',
  'fillStyle',
  'lineWidth',
  'font',
  'textAlign',
  'textBaseline',
  'lineJoin',
  'lineCap',
  'globalAlpha',
  'miterLimit',
  'lineDashOffset',
  'globalCompositeOperation',
  'filter',
] as const;

/** 需要记录的方法（canvas 2d 绘制原语 + 状态栈） */
const METHODS = [
  'save',
  'restore',
  'beginPath',
  'closePath',
  'moveTo',
  'lineTo',
  'arc',
  'ellipse',
  'rect',
  'roundRect',
  'fill',
  'stroke',
  'clip',
  'fillRect',
  'strokeRect',
  'clearRect',
  'fillText',
  'strokeText',
  'setLineDash',
  'setTransform',
  'resetTransform',
  'scale',
  'translate',
  'rotate',
] as const;

export function createMockCtx(): MockCtx & Record<string, unknown> {
  const calls: CtxCall[] = [];
  const ctx: Record<string, unknown> = {
    calls,
    measureText: (text: unknown) => ({ width: String(text).length * 6 }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createPattern: () => ({}),
    getLineDash: () => [],
    drawImage: () => {},
  };
  for (const m of METHODS) {
    ctx[m] = (...a: unknown[]) => {
      calls.push({ m, a });
    };
  }
  for (const p of PROPS) {
    let v: unknown = p === 'lineWidth' ? 1 : p === 'globalAlpha' ? 1 : '';
    Object.defineProperty(ctx, p, {
      get: () => v,
      set: (nv: unknown) => {
        v = nv;
        calls.push({ m: `set:${p}`, a: [nv] });
      },
      enumerable: true,
    });
  }
  return ctx as MockCtx & Record<string, unknown>;
}

/** 取某方法的全部调用参数 */
export function callsOf(ctx: MockCtx, m: string): unknown[][] {
  return ctx.calls.filter((c) => c.m === m).map((c) => c.a);
}

/** 取某属性赋值的全部值（按序） */
export function propSets(ctx: MockCtx, prop: string): unknown[] {
  return ctx.calls.filter((c) => c.m === `set:${prop}`).map((c) => c.a[0]);
}

/** 是否存在一次方法调用，参数与 expected 逐位相近（数值容差 1e-9） */
export function hasCall(ctx: MockCtx, m: string, expected: unknown[]): boolean {
  return ctx.calls.some((c) => c.m === m && sameArgs(c.a, expected));
}

/** 是否存在相邻的一对调用（如 moveTo 后紧跟 lineTo） */
export function hasPair(ctx: MockCtx, m1: string, a1: unknown[], m2: string, a2: unknown[]): boolean {
  for (let i = 0; i < ctx.calls.length - 1; i++) {
    const c1 = ctx.calls[i];
    const c2 = ctx.calls[i + 1];
    if (c1.m === m1 && sameArgs(c1.a, a1) && c2.m === m2 && sameArgs(c2.a, a2)) return true;
  }
  return false;
}

/** 全部 fillText 文本（按序） */
export function fillTexts(ctx: MockCtx): string[] {
  return callsOf(ctx, 'fillText').map((a) => String(a[0]));
}

export function sameArgs(actual: unknown[], expected: unknown[]): boolean {
  if (actual.length !== expected.length) return false;
  for (let i = 0; i < expected.length; i++) {
    const e = expected[i];
    const a = actual[i];
    if (typeof e === 'number' && typeof a === 'number') {
      if (Math.abs(a - e) > 1e-9) return false;
    } else if (Array.isArray(e) && Array.isArray(a)) {
      if (!sameArgs(a, e)) return false;
    } else if (a !== e) {
      return false;
    }
  }
  return true;
}

/** 转成 CanvasRenderingContext2D 供被测函数使用 */
export function asCtx(mock: MockCtx & Record<string, unknown>): CanvasRenderingContext2D {
  return mock as unknown as CanvasRenderingContext2D;
}
