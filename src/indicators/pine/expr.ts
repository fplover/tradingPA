import type { Expr } from './ast';
import { tokenize } from './tokenizer';

/**
 * Pine 子集表达式解析（优先级爬升）：
 * or < and < 比较 < 加减 < 乘除 < 一元（- ! not） < 初等（字面量/标识符/调用/括号）。
 * true/false 映射为 1/0；字符串字面量编码为 str:xxx 标识符（不参与数值运算）。
 */

class ExprParser {
  private pos = 0;
  constructor(private toks: ReturnType<typeof tokenize>) {}

  private peek(): string | undefined {
    return this.toks[this.pos]?.v;
  }
  private next(): string {
    const t = this.toks[this.pos++];
    if (!t) throw new Error('表达式意外结束');
    return t.v;
  }
  private eat(op: string): boolean {
    if (this.toks[this.pos]?.t === 'op' && this.toks[this.pos]?.v === op) {
      this.pos++;
      return true;
    }
    return false;
  }

  parseExpr(): Expr {
    return this.parseOr();
  }
  private parseOr(): Expr {
    let l = this.parseAnd();
    while (this.peek() === '||' || this.peek() === 'or') {
      this.next();
      l = { t: 'bin', op: 'or', l, r: this.parseAnd() };
    }
    return l;
  }
  private parseAnd(): Expr {
    let l = this.parseCmp();
    while (this.peek() === '&&' || this.peek() === 'and') {
      this.next();
      l = { t: 'bin', op: 'and', l, r: this.parseCmp() };
    }
    return l;
  }
  private parseCmp(): Expr {
    let l = this.parseAdd();
    for (;;) {
      const op = this.peek();
      if (op === '>' || op === '<' || op === '>=' || op === '<=' || op === '==' || op === '!=') {
        this.next();
        l = { t: 'bin', op, l, r: this.parseAdd() };
        continue;
      }
      return l;
    }
  }
  private parseAdd(): Expr {
    let l = this.parseMul();
    for (;;) {
      const op = this.peek();
      if (op === '+' || op === '-') {
        this.next();
        l = { t: 'bin', op, l, r: this.parseMul() };
        continue;
      }
      return l;
    }
  }
  private parseMul(): Expr {
    let l = this.parseUnary();
    for (;;) {
      const op = this.peek();
      if (op === '*' || op === '/') {
        this.next();
        l = { t: 'bin', op, l, r: this.parseUnary() };
        continue;
      }
      return l;
    }
  }
  private parseUnary(): Expr {
    if (this.peek() === '-') {
      this.next();
      return { t: 'un', op: 'neg', e: this.parseUnary() };
    }
    if (this.peek() === '!' || this.peek() === 'not') {
      this.next();
      return { t: 'un', op: 'not', e: this.parseUnary() };
    }
    return this.parsePrimary();
  }
  private parsePrimary(): Expr {
    const t = this.toks[this.pos++];
    if (!t) throw new Error('表达式意外结束');
    if (t.t === 'num') return { t: 'num', v: Number(t.v) };
    if (t.t === 'str') return { t: 'ident', name: `str:${t.v}` };
    if (t.t === 'ident') {
      if (t.v === 'true') return { t: 'num', v: 1 };
      if (t.v === 'false') return { t: 'num', v: 0 };
      if (this.peek() === '(') {
        this.next();
        const args: Expr[] = [];
        if (!this.eat(')')) {
          for (;;) {
            args.push(this.parseExpr());
            if (!this.eat(',')) break;
          }
          if (!this.eat(')')) throw new Error('括号未闭合');
        }
        return { t: 'call', fn: t.v, args };
      }
      return { t: 'ident', name: t.v };
    }
    if (t.t === 'op' && t.v === '(') {
      const e = this.parseExpr();
      if (!this.eat(')')) throw new Error('括号未闭合');
      return e;
    }
    throw new Error(`无法解析的记号「${t.v}」`);
  }
}

export function parseExprSrc(src: string): Expr {
  return new ExprParser(tokenize(src)).parseExpr();
}
