import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { control, fontSize, icon, radius, space } from '@/ui/tokens';

/** 分割线档位编辑器（TV fib 设置 levels 列表形态）：档位双列网格展示（行优先填充），
 *  每格数值（%）+ 删除按钮 + 「添加档位」，改动实时生效。
 *  数据口径：档位存百分比小数——输入框显示 ×100，提交时 ÷100；
 *  校验规则：非法值（非数字/NaN）不写入；重复值跳过并保持原档顺序；至少保留 1 档。
 *  外部变更（撤销/重做、切换设置对象）经 levels prop 内容比对同步本地编辑态，自身提交不回流。 */
export function DrawingLevelsEditor({ levels, onChange }: { levels: number[]; onChange: (next: number[]) => void }) {
  const [texts, setTexts] = useState<string[]>(() => levels.map(pctText));
  const committed = useRef<number[]>(levels);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!sameLevels(levels, committed.current)) {
      committed.current = levels;
      setTexts(levels.map(pctText));
    }
  }, [levels]);

  /** 由本地文本推导档位并提交：空文本行视为待编辑新行（跳过）；出现非法值则整批不写 */
  const commit = (next: string[]): void => {
    const out = parseLevelTexts(next);
    if (!out) return;
    if (sameLevels(out, committed.current)) return; // 无实质变化不写（避免污染撤销栈）
    committed.current = out;
    onChange(out);
  };

  return (
    <div style={{ marginBottom: space.sm }}>
      <div style={{ color: 'var(--text-dim)', fontSize: fontSize.md, marginBottom: space.xs }}>分割线</div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          columnGap: space.sm,
          rowGap: space.xs,
          marginBottom: space.xs,
        }}
      >
        {texts.map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: space.xs, minWidth: 0 }}>
            <input
              type="number"
              step={0.1}
              value={t}
              autoFocus={i === focusIndex}
              aria-label={`第 ${i + 1} 条分割线百分比`}
              onChange={(e) => {
                const next = [...texts];
                next[i] = e.target.value;
                setTexts(next);
                commit(next);
              }}
              style={{ ...inputStyle, flex: 1, minWidth: 0 }}
            />
            <span style={{ color: 'var(--text-dim)', fontSize: fontSize.md }}>%</span>
            <button
              type="button"
              aria-label={`删除第 ${i + 1} 条分割线`}
              title={texts.length <= 1 ? '至少保留 1 档' : '删除该档'}
              disabled={texts.length <= 1}
              onClick={() => {
                const next = texts.filter((_, j) => j !== i);
                setTexts(next);
                commit(next);
              }}
              style={{
                ...delBtnStyle,
                opacity: texts.length <= 1 ? 0.4 : 1,
                cursor: texts.length <= 1 ? 'not-allowed' : 'pointer',
              }}
            >
              <Trash2 size={icon.md} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => {
          setTexts([...texts, '']);
          setFocusIndex(texts.length);
        }}
        style={addBtnStyle}
      >
        <Plus size={icon.sm} />
        添加档位
      </button>
    </div>
  );
}

/** 本地文本行 → 档位集合（百分比小数）：输入按 % 填写，此处 ÷100 存小数。
 *  校验规则：非法值（非数字/NaN）整批返回 null 不写入；空文本行视为待编辑新行（跳过）；
 *  重复值跳过并保持原档顺序；结果为空（无有效档）返回 null——至少保留 1 档。 */
export function parseLevelTexts(texts: readonly string[]): number[] | null {
  const out: number[] = [];
  for (const t of texts) {
    if (t.trim() === '') continue;
    const n = Number(t.trim());
    if (!Number.isFinite(n)) return null;
    const v = Math.round((n / 100) * 1e6) / 1e6; // ÷100 存小数，并 round 掉二进制毛刺（23.6% → 0.236）
    if (out.includes(v)) continue; // 重复值跳过，保持原档顺序
    out.push(v);
  }
  return out.length === 0 ? null : out;
}

/** 百分比小数 → 输入框文本（×100，去浮点毛刺：0.236 → "23.6"、0.5 → "50"、2.618 → "261.8"） */
function pctText(v: number): string {
  return String(Math.round(v * 100 * 1e4) / 1e4);
}

/** 档位集合相等（逐项比对；用于区分「外部真变更」与「自身提交回流」） */
function sameLevels(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

const inputStyle: React.CSSProperties = {
  width: 72,
  background: 'var(--input-bg)',
  border: '1px solid var(--border)',
  borderRadius: radius.sm,
  color: 'var(--text)',
  padding: '4px 6px',
  fontSize: fontSize.md,
  textAlign: 'right',
};

const delBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: control.hSm,
  height: control.hSm,
  background: 'none',
  border: 'none',
  borderRadius: radius.xs,
  color: 'var(--text-faint)',
  padding: 0,
};

const addBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: space.xs,
  width: '100%',
  height: control.h,
  background: 'var(--panel-2)',
  border: 'none',
  borderRadius: radius.xs,
  color: 'var(--text-dim)',
  fontSize: fontSize.md,
  cursor: 'pointer',
};
