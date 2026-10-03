export const INK_COLORS = [
  "#3159e8",
  "#343b4f",
  "#ec6b85",
  "#e4aa3d",
  "#3aa58b",
  "#a078c9",
];
export function DrawingControls({
  color,
  width,
  onColor,
  onWidth,
  highlighter = false,
}: {
  color: string;
  width: number;
  onColor: (color: string) => void;
  onWidth: (width: number) => void;
  highlighter?: boolean;
}) {
  return (
    <div className="drawing-controls">
      <div className="ink-colors">
        {INK_COLORS.map((value) => (
          <button
            key={value}
            title={value}
            aria-label={`Ink ${value}`}
            aria-pressed={color === value}
            style={{ background: value }}
            onClick={() => onColor(value)}
          />
        ))}
        <input
          aria-label="Custom ink colour"
          type="color"
          value={color}
          onChange={(event) => onColor(event.target.value)}
        />
      </div>
      <label>
        Thickness{" "}
        <input
          aria-label="Stroke thickness"
          type="range"
          min="1"
          max={highlighter ? 40 : 20}
          value={width}
          onChange={(event) => onWidth(Number(event.target.value))}
        />
        <span>{width}</span>
      </label>
    </div>
  );
}
