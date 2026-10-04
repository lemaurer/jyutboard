import type { Card, TableRow } from "./model";
import { PersonAvatar, PERSONAS } from "./PersonAvatar";
import { Plus, X } from "lucide-react";
export function Conversation({
  card,
  teacher,
  hidden,
  onChange,
  onChinese,
  onEnrich,
  onAdd,
  onDelete,
  onSelect,
}: {
  card: Card;
  teacher: boolean;
  hidden: boolean;
  onChange: (row: TableRow, patch: Partial<TableRow>) => void;
  onChinese: (row: TableRow, text: string) => void;
  onEnrich: (row: TableRow) => void;
  onAdd: () => void;
  onDelete: (row: TableRow) => void;
  onSelect: (row: TableRow) => void;
}) {
  return (
    <div className="conversation-turns">
      {card.rows.map((row, index) => (
        <div
          key={row.id}
          className={`dialogue-turn ${index % 2 ? "turn-right" : "turn-left"}`}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(row);
          }}
        >
          <div className="dialogue-person">
            <PersonAvatar id={row.avatar} name={row.persona} />
            <select
              aria-label="Dialogue person"
              value={
                PERSONAS.some((p) => p.name === row.persona)
                  ? row.persona
                  : "custom"
              }
              onChange={(event) => {
                const p = PERSONAS.find((p) => p.name === event.target.value);
                onChange(
                  row,
                  p
                    ? { persona: p.name, avatar: p.avatar }
                    : { persona: "Guest", avatar: "friend" },
                );
              }}
            >
              {PERSONAS.map((p) => (
                <option key={p.name}>{p.name}</option>
              ))}
              <option value="custom">Custom…</option>
            </select>
            {!PERSONAS.some((p) => p.name === row.persona) && (
              <input
                aria-label="Custom person name"
                value={row.persona}
                onChange={(e) => onChange(row, { persona: e.target.value })}
              />
            )}
          </div>
          <div className="dialogue-bubble">
            {teacher ? (
              <textarea
                aria-label="Dialogue Cantonese"
                placeholder="寫句中文…"
                value={row.chinese}
                onChange={(e) => onChinese(row, e.target.value)}
                onBlur={() => onEnrich(row)}
              />
            ) : (
              <strong>{row.jyutping || "…"}</strong>
            )}
            {!hidden && (
              <input
                aria-label="Dialogue translation"
                placeholder="Meaning…"
                value={row.definition}
                onChange={(e) =>
                  onChange(row, {
                    definition: e.target.value,
                    translation: "edited",
                  })
                }
              />
            )}
            <input
              aria-label="Dialogue note"
              placeholder="Note…"
              value={row.note}
              onChange={(e) => onChange(row, { note: e.target.value })}
            />
            <button
              className="turn-delete"
              aria-label="Delete turn"
              onClick={() => onDelete(row)}
            >
              <X size={12} />
            </button>
          </div>
        </div>
      ))}
      <button className="add-turn" onClick={onAdd}>
        <Plus size={15} /> Add turn
      </button>
    </div>
  );
}
