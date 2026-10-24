import { useState } from "react";
import { InlineLanguage } from "./InlineLanguage";
import {
  type HighlightMode,
  type VocabularySnapshot,
} from "./VocabularyPhrase";
import { PushToTalk } from "./PushToTalk";
import type { SourceLanguage, Card, TableRow } from "./model";
import { PersonAvatar, PERSONAS, AVATARS, EMOTIONS } from "./PersonAvatar";
import {
  nextSpeaker,
  conversationSpeakers,
  speakerSide,
  sentenceCount,
  type Speaker,
} from "./conversationTools";
import {
  Plus,
  Star,
  X,
  MoreHorizontal,
  Volume2,
  Eye,
  EyeOff,
} from "lucide-react";
export function Conversation({
  card,
  teacher,
  vocabulary,
  highlightMode,
  selectedRow,
  hidden,
  canEdit,
  onChange,
  onChinese,
  onComplete,
  onSpeech,
  notify,
  onAdd,
  onDelete,
  onSplit,
  onSelect,
}: {
  card: Card;
  teacher: boolean;
  vocabulary?: VocabularySnapshot;
  highlightMode: HighlightMode;
  selectedRow: string | null;
  hidden: boolean;
  canEdit: () => boolean;
  onChange: (row: TableRow, patch: Partial<TableRow>) => void;
  onChinese: (row: TableRow, text: string) => void;
  onComplete: (row: TableRow, text: string, language?: SourceLanguage) => void;
  onSpeech: (row: TableRow, text: string, audio: string) => void;
  notify: (text: string) => void;
  onAdd: (speaker: Speaker) => void;
  onSplit: (row: TableRow) => void;
  onDelete: (row: TableRow) => void;
  onSelect: (row: TableRow) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [speakerOverride, setSpeakerOverride] = useState("");
  const predicted = nextSpeaker(card.rows);
  const speakers = [...conversationSpeakers(card.rows)];
  for (const person of PERSONAS)
    if (!speakers.some((s) => s.name === person.name)) speakers.push(person);
  const chosen = speakers.find((s) => s.name === speakerOverride) || predicted;
  return (
    <div className="conversation-turns">
      {card.rows.map((row, index) => {
        if (!teacher && row.concealed) return null;
        const mode = row.mode ?? card.mode;
        const showEnglish = mode !== "practice";
        const avatar =
          AVATARS.find((avatar) => avatar.id === row.avatar) ?? AVATARS[0];
        const custom = !PERSONAS.some((p) => p.name === row.persona);
        return (
          <div
            key={row.id}
            style={{ opacity: teacher && row.concealed ? 0.5 : undefined }}
            className={`dialogue-turn ${speakerSide(card.rows, row) === "right" ? "turn-right" : "turn-left"} ${index > 0 && card.rows[index - 1].persona.trim().toLowerCase() === row.persona.trim().toLowerCase() ? "same-speaker" : ""} ${selectedRow === row.id ? "turn-selected" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(row);
            }}
          >
            <div className="dialogue-person">
              <details className="avatar-picker">
                <summary aria-label="Choose avatar">
                  <PersonAvatar
                    id={row.avatar}
                    name={row.persona}
                    emotion={row.emotion}
                  />
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
                  <div
                    className="avatar-emotions"
                    role="group"
                    aria-label="Avatar expression"
                  >
                    {EMOTIONS.map((emotion) => (
                      <button
                        key={emotion}
                        type="button"
                        aria-label={`Expression: ${emotion}`}
                        aria-pressed={(row.emotion || "neutral") === emotion}
                        title={emotion}
                        onClick={() => onChange(row, { emotion })}
                      >
                        <PersonAvatar
                          id={row.avatar}
                          name={emotion}
                          emotion={emotion}
                        />
                      </button>
                    ))}
                  </div>
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
            <div
              className={`dialogue-bubble bubble-mode-${mode}`}
              style={{ backgroundColor: avatar.bg, borderColor: avatar.shirt }}
            >
              <div className="dialogue-language-line">
                <InlineLanguage
                  activation="click"
                  labelWhenIdle
                  autoFocus
                  editing={editing === `${row.id}:language`}
                  onActivate={() => {
                    if (!canEdit()) return;
                    onSelect(row);
                    setEditing(`${row.id}:language`);
                  }}
                  label={teacher ? "Dialogue Cantonese" : "Dialogue Jyutping"}
                  placeholder={teacher ? "寫句中文…" : "Write Jyutping…"}
                  value={teacher ? row.chinese : row.jyutping}
                  words={row.words}
                  chinese={teacher}
                  snapshot={vocabulary}
                  mode={highlightMode}
                  selected={selectedRow === row.id}
                  onChange={(text) =>
                    teacher
                      ? onChinese(row, text)
                      : onChange(row, { jyutping: text })
                  }
                  onBlur={(text) => {
                    setEditing((current) =>
                      current === `${row.id}:language` ? null : current,
                    );
                    onComplete(row, text);
                  }}
                />
                {teacher && (
                  <div className="dialogue-audio-control">
                    {row.audio ? (
                      <button
                        type="button"
                        aria-label="Play bubble recording"
                        onClick={() =>
                          void new Audio(row.audio)
                            .play()
                            .catch(() => notify("Could not play recording."))
                        }
                      >
                        <Volume2 size={16} />
                      </button>
                    ) : (
                      <PushToTalk
                        iconOnly
                        onPhrase={(text, audio) => onSpeech(row, text, audio)}
                        notify={notify}
                      />
                    )}
                  </div>
                )}
              </div>
              {showEnglish && (
                <p
                  className={`dialogue-meaning ${mode === "peek" ? "bubble-peek-meaning" : ""}`}
                  title="Click to edit meaning"
                >
                  <InlineLanguage
                    activation="click"
                    labelWhenIdle
                    autoFocus
                    label="Dialogue translation"
                    placeholder="Meaning…"
                    value={row.definition}
                    words={[]}
                    chinese={false}
                    mode="off"
                    selected={false}
                    editing={editing === `${row.id}:english`}
                    onActivate={() => {
                      if (!canEdit()) return;
                      onSelect(row);
                      setEditing(`${row.id}:english`);
                    }}
                    onChange={(text) =>
                      onChange(row, { definition: text, translation: "edited" })
                    }
                    onBlur={(text, changed) => {
                      setEditing((current) =>
                        current === `${row.id}:english` ? null : current,
                      );
                      if (changed && text.trim())
                        onComplete(row, text, "english");
                    }}
                  />
                </p>
              )}
              <button
                className={`bubble-star ${row.starred ? "is-starred" : ""}`}
                aria-label={row.starred ? "Unsave bubble" : "Save bubble"}
                onClick={() => onChange(row, { starred: !row.starred })}
              >
                <Star size={13} fill={row.starred ? "currentColor" : "none"} />
              </button>
              <details className="bubble-menu">
                <summary aria-label="Bubble options">
                  <MoreHorizontal size={14} />
                </summary>
                <div>
                  {teacher && (
                    <button
                      onClick={() =>
                        onChange(row, { concealed: !row.concealed })
                      }
                    >
                      {row.concealed ? <Eye size={12} /> : <EyeOff size={12} />}{" "}
                      {row.concealed ? "Reveal turn" : "Hide turn from Leif"}
                    </button>
                  )}
                  <label>
                    Bubble mode
                    <select
                      aria-label="Bubble mode"
                      value={mode}
                      onChange={(e) =>
                        onChange(row, { mode: e.target.value as Card["mode"] })
                      }
                    >
                      <option value="full">Standard</option>
                      <option value="peek">Compact</option>
                      <option value="practice">Practice</option>
                    </select>
                  </label>
                  {sentenceCount(row) > 1 && (
                    <button onClick={() => onSplit(row)}>
                      Split into sentences
                    </button>
                  )}
                  {row.splitSource && (
                    <details className="split-original">
                      <summary>Original text</summary>
                      <p>
                        {teacher
                          ? row.splitSource.chinese
                          : row.splitSource.jyutping}
                      </p>
                      <p>{row.splitSource.definition}</p>
                    </details>
                  )}
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
      <div className="add-turn-controls">
        <button
          className="add-turn"
          onClick={() => {
            onAdd(chosen);
            setSpeakerOverride("");
          }}
        >
          <Plus size={15} /> Add turn
        </button>
        <select
          aria-label="Next speaker"
          value={speakerOverride}
          onChange={(e) => setSpeakerOverride(e.target.value)}
        >
          <option value="">Auto · {predicted.name}</option>
          {speakers.map((person) => (
            <option key={person.name} value={person.name}>
              {person.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
