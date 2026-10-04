import { ChevronDown, Plus, X } from "lucide-react";
import { analyzeLocal } from "./language";
import type { Word } from "./model";

export function WordBreakdown({
  words,
  teacher,
  hidden,
  onChange,
  onAuto,
  verified = false,
}: {
  verified?: boolean;
  words: Word[];
  teacher: boolean;
  hidden: boolean;
  onChange: (words: Word[]) => void;
  onAuto: () => void;
}) {
  function edit(index: number, patch: Partial<Word>) {
    onChange(
      words.map((word, position) =>
        position === index ? { ...word, ...patch } : word,
      ),
    );
  }
  function split(index: number, offset: number) {
    const word = words[index];
    const characters = Array.from(word.chinese);
    const terms = [
      characters.slice(0, offset).join(""),
      characters.slice(offset).join(""),
    ];
    const pieces = terms.map((chinese) => {
      const analysis = analyzeLocal(chinese);
      return {
        chinese,
        jyutping: analysis.jyutping,
        definition: analysis.definition,
        state: word.state,
      };
    });
    onChange([...words.slice(0, index), ...pieces, ...words.slice(index + 1)]);
  }
  function merge(index: number) {
    const a = words[index];
    const b = words[index + 1];
    if (!b) return;
    const chinese = a.chinese + b.chinese;
    const analysis = analyzeLocal(chinese);
    const combined: Word = {
      chinese,
      jyutping: `${a.jyutping} ${b.jyutping}`.trim(),
      definition: analysis.definition,
      state: a.state === b.state ? a.state : "new",
    };
    onChange([...words.slice(0, index), combined, ...words.slice(index + 2)]);
  }
  return (
    <div className="breakdown">
      <div className="section-head">
        <h3>Piece by piece</h3>
        <span>{words.length} words</span>
      </div>
      <div className="word-table-head">
        <span>{teacher ? "中文" : "Jyutping"}</span>
        <span>{hidden ? "Vocabulary" : "Meaning"}</span>
      </div>
      <div className="word-list">
        {words.map((word, index) => (
          <details
            className={`word-piece state-${word.state ?? "new"}`}
            key={index}
          >
            <summary>
              <span className="word-state-dot" />
              <strong>
                {teacher
                  ? word.chinese || "New piece"
                  : word.jyutping || "New piece"}
              </strong>
              <span className="word-summary-meaning">
                {hidden
                  ? (word.state ?? "new")
                  : word.definition || "Add meaning"}
              </span>
              <ChevronDown size={12} />
            </summary>
            <div className="piece-edit">
              <div className="piece-inputs">
                <label>
                  Chinese
                  <input
                    aria-label={`Piece ${index + 1} Chinese`}
                    value={word.chinese}
                    maxLength={2000}
                    onChange={(event) =>
                      edit(index, { chinese: event.target.value })
                    }
                  />
                </label>
                <label>
                  Jyutping
                  <input
                    aria-label={`Piece ${index + 1} Jyutping`}
                    value={word.jyutping}
                    maxLength={2000}
                    onChange={(event) =>
                      edit(index, { jyutping: event.target.value })
                    }
                  />
                </label>
              </div>
              {!hidden && (
                <label>
                  Meaning
                  <input
                    aria-label={`Piece ${index + 1} meaning`}
                    value={word.definition}
                    maxLength={4000}
                    onChange={(event) =>
                      edit(index, { definition: event.target.value })
                    }
                  />
                </label>
              )}
              <label>
                Vocabulary
                <select
                  aria-label={`Piece ${index + 1} vocabulary`}
                  disabled={verified}
                  value={word.state ?? "unknown"}
                  onChange={(event) =>
                    edit(index, { state: event.target.value as Word["state"] })
                  }
                >
                  <option value="new">New</option>
                  <option value="learning">Learning (local)</option>
                  <option value="queued">In JyutDeck queue</option>
                  <option value="unknown">Not checked</option>
                  <option value="known">Known</option>
                </select>
              </label>
              {Array.from(word.chinese).length > 1 && (
                <div className="split-control">
                  <small>Split between characters</small>
                  <div>
                    {Array.from(word.chinese).map(
                      (character, position, all) => (
                        <span key={position}>
                          {character}
                          {position < all.length - 1 && (
                            <button
                              aria-label={`Split piece ${index + 1} after character ${position + 1}`}
                              title="Split here"
                              onClick={() => split(index, position + 1)}
                            >
                              │
                            </button>
                          )}
                        </span>
                      ),
                    )}
                  </div>
                </div>
              )}
              <div className="piece-actions">
                <button
                  disabled={index === words.length - 1}
                  onClick={() => merge(index)}
                >
                  Merge with next
                </button>
                <button
                  aria-label={`Remove piece ${index + 1}`}
                  onClick={() =>
                    onChange(words.filter((_, position) => position !== index))
                  }
                >
                  <X size={12} /> Remove
                </button>
              </div>
            </div>
          </details>
        ))}
      </div>
      <div className="breakdown-actions">
        <button
          onClick={() =>
            onChange([
              ...words,
              { chinese: "", jyutping: "", definition: "", state: "new" },
            ])
          }
        >
          <Plus size={13} /> Add piece
        </button>
        <button onClick={onAuto}>Auto split</button>
      </div>
      <div className="vocabulary-legend">
        <span className="state-known">Known</span>
        <span className="state-learning">Learning</span>
        <span className="state-new">New</span>
      </div>
    </div>
  );
}
