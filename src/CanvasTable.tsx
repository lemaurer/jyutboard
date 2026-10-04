import { Plus, X } from "lucide-react";
import type { Card, TableRow } from "./model";
import {
  VocabularyPhrase,
  type HighlightMode,
  type VocabularySnapshot,
} from "./VocabularyPhrase";
export function CanvasTable({
  card,
  teacher,
  hidden,
  selectedRow,
  onSelect,
  onChinese,
  onEnrich,
  onPatch,
  onAnswer,
  onAdd,
  onDelete,
  vocabulary,
  highlightMode,
}: {
  card: Card;
  teacher: boolean;
  hidden: boolean;
  selectedRow: string | null;
  onSelect: (row: TableRow) => void;
  onChinese: (row: TableRow, text: string) => void;
  onEnrich: (row: TableRow) => void;
  onPatch: (row: TableRow, patch: Partial<TableRow>) => void;
  onAnswer: (row: TableRow, text: string) => void;
  onAdd: () => void;
  onDelete: (row: TableRow) => void;
  vocabulary?: VocabularySnapshot;
  highlightMode: HighlightMode;
}) {
  const compact = card.mode === "peek";
  const paired = ["qa", "comparison"].includes(card.tableVariant),
    pattern = card.tableVariant === "pattern";
  const headings =
    card.tableVariant === "qa"
      ? ["Question", "Answer", "Notes"]
      : card.tableVariant === "comparison"
        ? ["Phrase A", "Phrase B", "Difference"]
        : pattern
          ? ["Pattern", "Meaning", "Substitutions"]
          : card.tableVariant === "vocabulary"
            ? ["Word", "Meaning", "Note"]
            : [teacher ? "中文" : "Jyutping", "English", "Notes"];
  return (
    <>
      <table className="phrase-table">
        <thead>
          <tr>
            <th>{headings[0]}</th>
            {(paired || (!hidden && !compact)) && <th>{headings[1]}</th>}
            <th>{headings[2]}</th>
            <th className="row-controls" />
          </tr>
        </thead>
        <tbody>
          {card.rows.map((row) => (
            <tr
              key={row.id}
              className={selectedRow === row.id ? "row-selected" : ""}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(row);
              }}
            >
              <td className="table-primary-cell">
                {compact && !hidden && row.definition && (
                  <div className="table-hover-translation" role="tooltip">
                    {row.definition}
                  </div>
                )}
                {teacher ? (
                  <input
                    aria-label="Chinese phrase"
                    placeholder={pattern ? "我想…" : "寫句中文…"}
                    value={row.chinese}
                    onChange={(e) => onChinese(row, e.target.value)}
                    onBlur={() => onEnrich(row)}
                  />
                ) : (
                  <span className="table-jyutping">
                    <VocabularyPhrase
                      text={row.jyutping || "—"}
                      words={row.words}
                      chinese={false}
                      snapshot={vocabulary}
                      mode={highlightMode}
                      selected={selectedRow === row.id}
                      recent={false}
                    />
                  </span>
                )}
                {paired && !hidden && !compact && (
                  <input
                    className="cell-translation"
                    aria-label="English translation"
                    placeholder="Meaning…"
                    value={row.definition}
                    onChange={(e) =>
                      onPatch(row, {
                        definition: e.target.value,
                        translation: "edited",
                      })
                    }
                  />
                )}
              </td>
              {paired ? (
                <td className="table-primary-cell">
                  {compact && !hidden && row.answerDefinition && (
                    <div className="table-hover-translation" role="tooltip">
                      {row.answerDefinition}
                    </div>
                  )}
                  {teacher ? (
                    <input
                      aria-label="Paired Chinese phrase"
                      placeholder={
                        card.tableVariant === "qa" ? "回答…" : "另一句…"
                      }
                      value={row.answerChinese}
                      onChange={(e) => onAnswer(row, e.target.value)}
                    />
                  ) : (
                    <span className="table-jyutping">
                      {row.answerJyutping || "—"}
                    </span>
                  )}
                  {!hidden && !compact && (
                    <input
                      className="cell-translation"
                      aria-label="Paired English translation"
                      placeholder="Meaning…"
                      value={row.answerDefinition}
                      onChange={(e) =>
                        onPatch(row, { answerDefinition: e.target.value })
                      }
                    />
                  )}
                </td>
              ) : (
                !hidden &&
                !compact && (
                  <td>
                    <input
                      aria-label="English translation"
                      placeholder="Translation…"
                      value={row.definition}
                      onChange={(e) =>
                        onPatch(row, {
                          definition: e.target.value,
                          translation: "edited",
                        })
                      }
                    />
                  </td>
                )
              )}
              <td>
                <input
                  aria-label="Row note"
                  placeholder={pattern ? "…食飯 / 飲水" : "Add note…"}
                  value={row.note}
                  onChange={(e) => onPatch(row, { note: e.target.value })}
                />
              </td>
              <td className="row-controls">
                <button
                  aria-label="Delete row"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(row);
                  }}
                >
                  <X size={12} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="table-bottom">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAdd();
          }}
        >
          <Plus size={13} /> Add row
        </button>
      </div>
    </>
  );
}
