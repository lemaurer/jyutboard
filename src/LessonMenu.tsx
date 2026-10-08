import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  MoreHorizontal,
  Eye,
  EyeOff,
  AlignHorizontalSpaceAround,
  LockKeyhole,
  Sparkles,
  Upload,
  Download,
} from "lucide-react";
import type { Card } from "./model";
import type { TeacherNote } from "./lessonTools";

export function LessonTools({
  teacher,
  hasSelection,
  selected,
  active,
  sessionId,
  onArrange,
  onHide,
  onReveal,
  onConvert,
  onVariants,
  onImport,
  onExport,
  notify,
}: {
  teacher: boolean;
  hasSelection: boolean;
  selected: Card[];
  active?: Card;
  sessionId: string;
  onArrange: (all: boolean) => void;
  onHide: (all: boolean, hidden: boolean) => void;
  onReveal: () => void;
  onConvert: (kind: "table" | "conversation") => Card | void;
  onVariants: (slot: string, replacements: string[]) => Promise<void>;
  onImport: (value: unknown) => TeacherNote[];
  onExport: () => unknown;
  notify: (message: string) => void;
}) {
  const key = `jyutboard:teacher-notes:${sessionId}`;
  const [panel, setPanel] = useState<"notes" | "variants" | null>(null);
  const [notes, setNotes] = useState<TeacherNote[]>([]);
  const [slot, setSlot] = useState("");
  const [replacements, setReplacements] = useState("");
  const [busy, setBusy] = useState(false);
  const details = useRef<HTMLDetailsElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [position, setPosition] = useState({ left: 16, top: 100 });
  function placePanel() {
    const rect = details.current?.getBoundingClientRect();
    if (rect)
      setPosition({
        left: Math.max(16, Math.min(rect.right - 310, window.innerWidth - 326)),
        top: rect.bottom + 6,
      });
  }
  useEffect(() => {
    const update = () => placePanel();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);
  useEffect(() => {
    setPanel(null);
    try {
      const value: unknown = JSON.parse(localStorage.getItem(key) || "[]");
      setNotes(
        Array.isArray(value)
          ? value.filter((note) => typeof note?.text === "string")
          : [],
      );
    } catch {
      setNotes([]);
    }
  }, [key]);
  useEffect(() => {
    if (!teacher) setPanel(null);
  }, [teacher]);
  function saveNotes(value: TeacherNote[]) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      setNotes(value);
    } catch {
      notify("Private notes could not be saved. Device storage may be full.");
    }
  }
  function action(callback: () => void) {
    try {
      callback();
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Could not complete action.",
      );
    }
  }
  const objectId = active?.id;
  function convert(kind: "table" | "conversation") {
    const target = onConvert(kind);
    if (!target || !teacher) return;
    const sourceIds = new Set(
      selected.filter((card) => card.kind === "phrase").map((card) => card.id),
    );
    const sourceNotes = notes.filter(
      (note) => note.objectId && sourceIds.has(note.objectId),
    );
    if (sourceNotes.length)
      saveNotes([
        // Keep original anchors so undo also restores access to their notes.
        ...notes,
        {
          objectId: target.id,
          text: sourceNotes
            .map((note) => note.text)
            .join("\n\n")
            .slice(0, 8000),
        },
      ]);
  }
  const note = notes.find((note) => note.objectId === objectId)?.text || "";
  return (
    <div className="lesson-tool-control">
      <details
        ref={details}
        className="lesson-tools-menu"
        onToggle={(event) => {
          placePanel();
          setMenuOpen(event.currentTarget.open);
        }}
      >
        <summary aria-label="Lesson tools" title="Lesson tools">
          <MoreHorizontal size={18} />
        </summary>
        {menuOpen &&
          createPortal(
            <div
              className="lesson-tools-popover"
              style={position}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <button
                onClick={() => action(() => onArrange(false))}
                disabled={!hasSelection}
              >
                <AlignHorizontalSpaceAround size={15} />
                Arrange selected
              </button>
              <button onClick={() => action(() => onArrange(true))}>
                <AlignHorizontalSpaceAround size={15} />
                Arrange canvas
              </button>
              {selected.filter((card) => card.kind === "phrase").length > 1 && (
                <>
                  <button onClick={() => action(() => convert("conversation"))}>
                    Turn into conversation
                  </button>
                  <button onClick={() => action(() => convert("table"))}>
                    Turn into table
                  </button>
                </>
              )}
              {teacher && (
                <>
                  <hr />
                  <button
                    onClick={() => action(() => onHide(false, true))}
                    disabled={!selected.length}
                  >
                    <EyeOff size={15} />
                    Hide selected from Leif
                  </button>
                  <button
                    onClick={() => action(() => onHide(false, false))}
                    disabled={!selected.length}
                  >
                    <Eye size={15} />
                    Reveal selected
                  </button>
                  <button onClick={() => action(() => onHide(true, true))}>
                    Prepare one-by-one reveal
                  </button>
                  <button onClick={() => action(onReveal)}>Reveal next</button>
                  <button onClick={() => action(() => onHide(true, false))}>
                    Reveal everything
                  </button>
                  <hr />
                  <button
                    onClick={() => setPanel(panel === "notes" ? null : "notes")}
                  >
                    <LockKeyhole size={15} />
                    Private teaching notes
                  </button>
                  {active?.kind === "phrase" && (
                    <button
                      onClick={() => {
                        setSlot(active.words[0]?.chinese || "");
                        setPanel("variants");
                      }}
                    >
                      <Sparkles size={15} />
                      Sentence variations
                    </button>
                  )}
                  <label className="lesson-import">
                    <Upload size={15} />
                    Import AI lesson
                    <input
                      type="file"
                      accept=".json,application/json"
                      aria-label="Import AI lesson"
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        try {
                          if (file.size > 20_000_000)
                            throw Error("Lesson file is too large.");
                          const imported = onImport(
                            JSON.parse(await file.text()),
                          );
                          saveNotes([...notes, ...imported]);
                          notify(
                            "Lesson added. Private notes saved on this device.",
                          );
                        } catch (error) {
                          notify(
                            error instanceof Error
                              ? error.message
                              : "Invalid lesson.",
                          );
                        }
                        event.target.value = "";
                      }}
                    />
                  </label>
                  <button
                    onClick={() =>
                      action(() => {
                        const value = onExport();
                        const url = URL.createObjectURL(
                          new Blob([JSON.stringify(value, null, 2)], {
                            type: "application/json",
                          }),
                        );
                        const link = document.createElement("a");
                        link.href = url;
                        link.download = "jyutboard-lesson.json";
                        link.click();
                        setTimeout(() => URL.revokeObjectURL(url), 1000);
                      })
                    }
                  >
                    <Download size={15} />
                    Export shared lesson
                  </button>
                </>
              )}
            </div>,
            document.body,
          )}
      </details>
      {teacher &&
        panel &&
        createPortal(
          <section
            className="lesson-tool-panel"
            style={position}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <header>
              <strong>
                {panel === "notes"
                  ? "Private teaching notes"
                  : "Sentence variations"}
              </strong>
              <button
                aria-label="Close lesson panel"
                onClick={() => setPanel(null)}
              >
                ×
              </button>
            </header>
            {panel === "notes" ? (
              <>
                <small>
                  {active ? "For the selected element" : "For this lesson"} ·
                  saved only on this device
                </small>
                <textarea
                  aria-label="Private teaching note"
                  placeholder="Prompts, corrections, teaching reminders…"
                  value={note}
                  maxLength={8000}
                  onChange={(event) =>
                    saveNotes([
                      ...notes.filter((note) => note.objectId !== objectId),
                      { objectId, text: event.target.value },
                    ])
                  }
                />
              </>
            ) : (
              <>
                <small>
                  Replace one slot; keep the rest of the sentence. Review the
                  resulting meanings.
                </small>
                <label>
                  Original word or phrase
                  <input
                    aria-label="Variation slot"
                    value={slot}
                    onChange={(event) => setSlot(event.target.value)}
                  />
                </label>
                <label>
                  Substitutions, one per line
                  <textarea
                    aria-label="Variation substitutions"
                    placeholder="奶茶\n咖啡\n水"
                    value={replacements}
                    onChange={(event) => setReplacements(event.target.value)}
                  />
                </label>
                <button
                  disabled={busy || active?.kind !== "phrase"}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await onVariants(slot, replacements.split("\n"));
                      setPanel(null);
                    } catch (error) {
                      notify(
                        error instanceof Error
                          ? error.message
                          : "Could not create variations.",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Create variations
                </button>
              </>
            )}
          </section>,
          document.body,
        )}
    </div>
  );
}
