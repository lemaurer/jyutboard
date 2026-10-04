import type { Card, TableRow } from "./model";
import { PersonAvatar, PERSONAS, AVATARS } from "./PersonAvatar";
import { Plus, Star, X, Send, MoreHorizontal, Volume2 } from "lucide-react";
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
  onSend,
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
  onSend: (row: TableRow) => void;
}) {
  return (
    <div className="conversation-turns">
      {card.rows.map((row, index) => {
        const mode = row.mode ?? card.mode;
        const showEnglish =
          !hidden && (teacher || mode !== "practice") && mode !== "characters";
        const custom = !PERSONAS.some((p) => p.name === row.persona);
        return (
          <div
            key={row.id}
            className={`dialogue-turn ${index % 2 ? "turn-right" : "turn-left"}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(row);
            }}
          >
            <div className="dialogue-person">
              <details className="avatar-picker">
                <summary aria-label="Choose avatar">
                  <PersonAvatar id={row.avatar} name={row.persona} />
                </summary>
                <div className="avatar-grid">
                  {AVATARS.map((avatar) => (
                    <button
                      key={avatar.id}
                      type="button"
                      aria-label={`Use ${avatar.label} avatar`}
                      onClick={(e) => {
                        onChange(row, { avatar: avatar.id });
                        e.currentTarget
                          .closest("details")
                          ?.removeAttribute("open");
                      }}
                    >
                      <PersonAvatar id={avatar.id} name={avatar.label} />
                    </button>
                  ))}
                </div>
              </details>
              <div className={custom ? "custom-person-name" : ""}>
                {custom && (
                  <input
                    aria-label="Custom person name"
                    value={row.persona}
                    onChange={(e) =>
                      onChange(row, { persona: e.target.value.slice(0, 80) })
                    }
                  />
                )}
                <select
                  aria-label="Dialogue person"
                  value={custom ? "custom" : row.persona}
                  onChange={(e) => {
                    const p = PERSONAS.find((p) => p.name === e.target.value);
                    onChange(
                      row,
                      p
                        ? { persona: p.name, avatar: p.avatar }
                        : { persona: "Guest" },
                    );
                  }}
                >
                  {PERSONAS.map((p) => (
                    <option key={p.name}>{p.name}</option>
                  ))}
                  <option value="custom">
                    {custom ? row.persona : "Own name…"}
                  </option>
                </select>
              </div>
            </div>
            <div className={`dialogue-bubble bubble-mode-${mode}`}>
              <textarea
                aria-label={
                  teacher || mode === "characters"
                    ? "Dialogue Cantonese"
                    : "Dialogue Jyutping"
                }
                placeholder={teacher ? "寫句中文…" : "Write Jyutping…"}
                value={
                  teacher || mode === "characters" ? row.chinese : row.jyutping
                }
                maxLength={2000}
                onChange={(e) =>
                  teacher || mode === "characters"
                    ? onChinese(row, e.target.value)
                    : onChange(row, { jyutping: e.target.value })
                }
                onBlur={() => teacher && onEnrich(row)}
              />
              {showEnglish && (
                <input
                  className={mode === "peek" ? "bubble-peek-meaning" : ""}
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
              <button
                className={`bubble-star ${row.starred ? "is-starred" : ""}`}
                aria-label={row.starred ? "Unsave bubble" : "Save bubble"}
                onClick={() => onChange(row, { starred: !row.starred })}
              >
                <Star size={13} fill={row.starred ? "currentColor" : "none"} />
              </button>
              {row.audio && (
                <button
                  type="button"
                  className="bubble-audio"
                  aria-label="Play bubble recording"
                  onClick={() =>
                    void new Audio(row.audio).play().catch(() => {})
                  }
                >
                  <Volume2 size={13} />
                </button>
              )}
              <details className="bubble-menu">
                <summary aria-label="Bubble options">
                  <MoreHorizontal size={14} />
                </summary>
                <div>
                  <label>
                    Bubble mode
                    <select
                      aria-label="Bubble mode"
                      value={mode}
                      onChange={(e) =>
                        onChange(row, { mode: e.target.value as Card["mode"] })
                      }
                    >
                      <option value="full">Language + English</option>
                      <option value="practice">Practice · hide English</option>
                      <option value="peek">English on hover</option>
                      <option value="characters">Characters only</option>
                    </select>
                  </label>
                  <button
                    disabled={!row.chinese.trim()}
                    onClick={() => onSend(row)}
                  >
                    <Send size={12} />
                    Send to JyutDeck
                  </button>
                  {row.receipt && (
                    <small className="receipt">{row.receipt}</small>
                  )}
                  <button onClick={() => onDelete(row)}>
                    <X size={12} />
                    Delete bubble
                  </button>
                </div>
              </details>
            </div>
          </div>
        );
      })}
      <button className="add-turn" onClick={onAdd}>
        <Plus size={15} />
        Add turn
      </button>
    </div>
  );
}
