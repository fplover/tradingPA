/** 数据源共用的传输层：GBK 文本、JSONP、超时。
 *  国内行情站普遍返回 GBK 且部分不带 CORS 头，这两点是接入的主要摩擦。 */

const DEFAULT_TIMEOUT = 10_000;

/** 拉取 GBK 编码文本（腾讯/新浪行情）。TextDecoder 在浏览器原生支持 gbk。 */
export async function fetchGbk(url: string, timeoutMs = DEFAULT_TIMEOUT): Promise<string> {
  const buf = await fetchBuffer(url, timeoutMs);
  return new TextDecoder('gbk').decode(buf);
}

export async function fetchBuffer(url: string, timeoutMs = DEFAULT_TIMEOUT): Promise<ArrayBuffer> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.arrayBuffer();
  } finally {
    window.clearTimeout(timer);
  }
}

export async function fetchJson<T>(url: string, timeoutMs = DEFAULT_TIMEOUT): Promise<T> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * JSONP：用于不带 CORS 头但支持回调参数的接口（东方财富搜索）。
 * 回调名随机，避免并发请求互相覆盖全局函数。
 */
export function fetchJsonp<T>(url: string, cbParam = 'cb', timeoutMs = DEFAULT_TIMEOUT): Promise<T> {
  return new Promise((resolve, reject) => {
    const name = `__tp_jsonp_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    const script = document.createElement('script');
    let settled = false;

    const cleanup = () => {
      window.clearTimeout(timer);
      delete (window as unknown as Record<string, unknown>)[name];
      script.remove();
    };
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };
    const timer = window.setTimeout(() => done(() => reject(new Error('JSONP 超时'))), timeoutMs);

    (window as unknown as Record<string, unknown>)[name] = (data: T) => done(() => resolve(data));
    script.onerror = () => done(() => reject(new Error('JSONP 加载失败')));
    const sep = url.includes('?') ? '&' : '?';
    script.src = `${url}${sep}${cbParam}=${name}`;
    document.head.appendChild(script);
  });
}

/** 解析 `v_xxx="a~b~c";` 形式的腾讯行情响应，返回 code → 字段数组 */
export function parseTencentPayload(text: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const line of text.split(';')) {
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    if (!key.startsWith('v_')) continue;
    const raw = line.slice(eq + 1).trim();
    if (!raw.startsWith('"') || !raw.endsWith('"')) continue;
    out.set(key.slice(2), raw.slice(1, -1).split('~'));
  }
  return out;
}

/** 解析 `var hq_str_xxx="a,b,c";` 形式的新浪行情响应 */
export function parseSinaPayload(text: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /var hq_str_(\w+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.set(m[1], m[2]);
  return out;
}
