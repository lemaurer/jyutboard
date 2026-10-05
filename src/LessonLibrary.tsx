import { useState } from "react";
import { FolderPlus, Trash2, Undo2 } from "lucide-react";
import type { Session } from "./model";
import { z } from "zod";
import {
  loadPreference,
  preference,
  forgetSession,
  restoreSession,
} from "./storage";
type Folder = { id: string; name: string };
type Organization = {
  folders: Folder[];
  assigned: Record<string, string>;
  removed: Session[];
};
function load(): Organization {
  try {
    return z
      .object({
        folders: z
          .array(
            z.object({
              id: z.string().uuid(),
              name: z.string().min(1).max(80),
            }),
          )
          .max(200)
          .default([]),
        assigned: z.record(z.string()).default({}),
        removed: z
          .array(
            z.object({
              id: z.string().regex(/^[a-f0-9]{48}$/),
              title: z.string().max(100),
              created: z.number(),
              relay: z.string().optional(),
            }),
          )
          .default([]),
      })
      .parse(JSON.parse(loadPreference("lesson-organization", "{}")));
  } catch {
    return { folders: [], assigned: {}, removed: [] };
  }
}
export function LessonLibrary({
  lessons,
  current,
  onOpen,
  onDelete,
  onChange,
}: {
  lessons: Session[];
  current: string;
  onOpen: (lesson: Session) => void;
  onDelete: (id: string) => void;
  onChange: (lessons: Session[]) => void;
}) {
  const [org, setOrg] = useState(load),
    [naming, setNaming] = useState(false),
    [name, setName] = useState("");
  function save(value: Organization) {
    setOrg(value);
    preference("lesson-organization", JSON.stringify(value));
  }
  function remove(lesson: Session) {
    onDelete(lesson.id);
    const next = forgetSession(lesson.id);
    onChange(next);
    save({
      ...org,
      removed: [lesson, ...org.removed.filter((item) => item.id !== lesson.id)],
    });
  }
  function restore() {
    const item = org.removed[0];
    if (!item) return;
    const next = restoreSession(item);
    onChange(next);
    save({ ...org, removed: org.removed.slice(1) });
  }
  return (
    <div className="lesson-library">
      <button className="new-folder" onClick={() => setNaming(!naming)}>
        <FolderPlus size={14} /> New folder
      </button>
      {naming && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) return;
            save({
              ...org,
              folders: [
                ...org.folders,
                { id: crypto.randomUUID(), name: name.trim().slice(0, 80) },
              ],
            });
            setName("");
            setNaming(false);
          }}
        >
          <input
            autoFocus
            aria-label="Folder name"
            placeholder="Folder name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <button>Add</button>
        </form>
      )}
      {[{ id: "", name: "Lessons" }, ...org.folders].map((folder) => (
        <section key={folder.id}>
          {folder.id && (
            <div className="folder-heading">
              <strong>{folder.name}</strong>
              <button
                title="Remove folder; keep lessons"
                aria-label={`Remove folder ${folder.name}`}
                onClick={() => {
                  const assigned = { ...org.assigned };
                  Object.keys(assigned).forEach((id) => {
                    if (assigned[id] === folder.id) delete assigned[id];
                  });
                  save({
                    ...org,
                    assigned,
                    folders: org.folders.filter(
                      (item) => item.id !== folder.id,
                    ),
                  });
                }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          )}
          <div className="history">
            {lessons
              .filter((lesson) => (org.assigned[lesson.id] || "") === folder.id)
              .map((item) => (
                <div
                  className={`lesson-entry ${item.id === current ? "current" : ""}`}
                  key={item.id}
                >
                  <button className="lesson-open" onClick={() => onOpen(item)}>
                    <strong>{item.title}</strong>
                  </button>
                  <details className="lesson-menu">
                    <summary aria-label={`Options for ${item.title}`}>
                      ···
                    </summary>
                    <div>
                      <label>
                        Folder
                        <select
                          aria-label={`Folder for ${item.title}`}
                          value={org.assigned[item.id] || ""}
                          onChange={(event) =>
                            save({
                              ...org,
                              assigned: {
                                ...org.assigned,
                                [item.id]: event.target.value,
                              },
                            })
                          }
                        >
                          <option value="">Unfiled</option>
                          {org.folders.map((value) => (
                            <option value={value.id} key={value.id}>
                              {value.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button onClick={() => remove(item)}>
                        <Trash2 size={13} />
                        Delete from this device
                      </button>
                    </div>
                  </details>
                </div>
              ))}
          </div>
        </section>
      ))}
      {org.removed.length > 0 && (
        <button className="restore-lesson" onClick={restore}>
          <Undo2 size={13} />
          Restore {org.removed[0].title}
        </button>
      )}
    </div>
  );
}
