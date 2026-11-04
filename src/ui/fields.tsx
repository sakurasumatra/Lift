import { useEffect, useState } from 'react';

/** Numeric input that edits freely and commits on blur/Enter. */
export function NumField({ value, onCommit, label, step, min = 0, integer = false }: { value: number; onCommit: (v: number) => void; label: string; step?: number; min?: number; integer?: boolean }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = parseFloat(text.replace(',', '.'));
    if (Number.isFinite(n) && n >= min) onCommit(integer ? Math.round(n) : n);
    else setText(String(value));
  };
  return (
    <input className="num" aria-label={label} inputMode={integer ? 'numeric' : 'decimal'} step={step} value={text}
      onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
  );
}

export function SubHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return <div className="row"><button className="icon-btn" onClick={onBack} aria-label="Back">←</button><h1>{title}</h1></div>;
}
