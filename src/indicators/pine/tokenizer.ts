/**
 * Pine v5 子集 tokenizer。
 * 记号类型：num / ident（含点号）/ str / op。
 */

export interface Tok {
  t: 'num' | 'ident' | 'str' | 'op';
  v: string;
  /** 记号在源码中的行号（1 起） */
  line: number;
}

/** 多字符运算符必须排在单字符前（前缀优先匹配） */
const OPS = ['>=', '<=', '==', '!=', '&&', '||', '=>', '+', '-', '*', '/', '>', '<', '(', ')', '[', ']', ',', ':', '='];

export function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  let line = 1;
  while (i < src.length) {
    const c = src[i];
    if (c === '\n') {
      line++;
      i++;
      continue;
    }
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9._]/.test(src[j])) j++;
      out.push({ t: 'num', v: src.slice(i, j).replace(/_/g, ''), line });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[\w.]/.test(src[j])) j++;
      out.push({ t: 'ident', v: src.slice(i, j), line });
      i = j;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c && src[j] !== '\n') j++;
      if (src[j] !== c) throw new Error('字符串未闭合');
      out.push({ t: 'str', v: src.slice(i + 1, j), line });
      i = j + 1;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new Error(`无法识别的字符「${c}」`);
    out.push({ t: 'op', v: op, line });
    i += op.length;
  }
  return out;
}
