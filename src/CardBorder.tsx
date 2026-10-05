import type { Card } from "./model";
export function CardBorder({
  card,
  onChange,
  compact = false,
}: {
  card: Card;
  onChange: (patch: Partial<Card>) => void;
  compact?: boolean;
}) {
  const controls = (
    <>
      <label>
        Border
        <select
          aria-label="Card border width"
          value={card.borderWidth}
          onChange={(e) => onChange({ borderWidth: Number(e.target.value) })}
        >
          <option value="0">None</option>
          <option value="1">Fine</option>
          <option value="2">Medium</option>
          <option value="3">Bold</option>
        </select>
      </label>
      <label>
        Colour
        <input
          type="color"
          aria-label="Card border colour"
          value={card.borderColor}
          onChange={(e) =>
            onChange({
              borderColor: e.target.value,
              borderWidth: card.borderWidth || 1,
            })
          }
        />
      </label>
      <label>
        Line
        <select
          aria-label="Card border style"
          value={card.borderStyle}
          onChange={(e) =>
            onChange({ borderStyle: e.target.value as Card["borderStyle"] })
          }
        >
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
          <option value="dotted">Dotted</option>
        </select>
      </label>
    </>
  );
  return compact ? (
    <details className="border-popover">
      <summary title="Card border">Border</summary>
      <div className="border-controls">{controls}</div>
    </details>
  ) : (
    <div className="border-controls">{controls}</div>
  );
}
