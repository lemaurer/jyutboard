import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import {
  readCards,
  type Card,
  type Presence,
  type Role,
  type Session,
  type Stroke,
} from "./model";
import { LiveSync } from "./sync";

function validPresence(value: Presence): boolean {
  const validPoint = (number: unknown, max: number) =>
    number === undefined ||
    (typeof number === "number" &&
      Number.isFinite(number) &&
      number >= 0 &&
      number <= max);
  return Boolean(
    value &&
      typeof value.id === "string" &&
      value.id.length <= 100 &&
      ["teacher", "learner"].includes(value.role) &&
      validPoint(value.x, 5600) &&
      validPoint(value.y, 3600) &&
      (value.view === undefined ||
        (typeof value.view.x === "number" &&
          typeof value.view.y === "number" &&
          typeof value.view.zoom === "number" &&
          value.view.zoom >= 0.35 &&
          validPoint(value.view.x, 5600) &&
          validPoint(value.view.y, 3600) &&
          validPoint(value.view.zoom, 2.5))) &&
      (value.attentionAt === undefined ||
        validPoint(value.attentionAt, Date.now() + 60000)) &&
      (value.presenting === undefined || typeof value.presenting === "boolean"),
  );
}
export function useLesson(session: Session, role: Role) {
  const [doc, setDoc] = useState<Y.Doc | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [peers, setPeers] = useState<Record<string, Presence>>({});
  const [status, setStatus] = useState("Solo lesson");
  const [saved, setSaved] = useState("Opening lesson…");
  const [undoState, setUndoState] = useState({ undo: false, redo: false });
  const sync = useRef<LiveSync | null>(null);
  const undoManager = useRef<Y.UndoManager | null>(null);
  const id = useRef(crypto.randomUUID());
  const latest = useRef<Presence>({ id: id.current, role, at: Date.now() });
  latest.current.role = role;

  useEffect(() => {
    let active = true;
    const document = new Y.Doc();
    const persistence = new IndexeddbPersistence(
      `jyutboard:${session.id}`,
      document,
    );
    const manager = new Y.UndoManager(
      [document.getMap("cards"), document.getMap("strokes")],
      { captureTimeout: 450 },
    );
    undoManager.current = manager;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (!active) return;
      setCards(readCards(document));
      setStrokes(
        [...document.getMap<Stroke>("strokes").values()].filter(
          (stroke) =>
            stroke &&
            Array.isArray(stroke.points) &&
            stroke.points.length <= 5000 &&
            stroke.points.every(
              (point) =>
                Array.isArray(point) &&
                point.length === 2 &&
                point.every(Number.isFinite),
            ),
        ),
      );
      setUndoState({
        undo: manager.undoStack.length > 0,
        redo: manager.redoStack.length > 0,
      });
    };
    const update = () => {
      refresh();
      setSaved("Saving on this device…");
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        void persistence
          .set("lastSaved", Date.now())
          .then(() => {
            if (active) setSaved("Saved on this device");
          })
          .catch(() => {
            if (active) setSaved("Storage full — export a backup");
          });
      }, 400);
    };
    document.on("update", update);
    manager.on("stack-item-added", refresh);
    manager.on("stack-item-popped", refresh);
    manager.on("stack-cleared", refresh);
    setCards([]);
    setStrokes([]);
    setPeers({});
    setDoc(null);
    persistence.whenSynced
      .then(() => {
        if (!active) return;
        setDoc(document);
        refresh();
        setSaved("Saved on this device");
      })
      .catch(() => {
        if (active) setSaved("Storage unavailable — export a backup");
      });
    return () => {
      active = false;
      clearTimeout(refreshTimer);
      document.off("update", update);
      manager.destroy();
      undoManager.current = null;
      void persistence.destroy();
      document.destroy();
    };
  }, [session.id]);
  useEffect(() => {
    if (!doc) return;
    setPeers({});
    if (!session.relay) {
      setStatus("Solo lesson");
      return;
    }
    const live = new LiveSync(
      doc,
      session.id,
      session.relay,
      id.current,
      setStatus,
      (presence, removed) =>
        setPeers((previous) => {
          const next = { ...previous };
          if (removed) delete next[removed];
          else if (presence && validPresence(presence))
            next[presence.id] = presence;
          return next;
        }),
    );
    sync.current = live;
    live.presence(latest.current);
    return () => {
      live.destroy();
      sync.current = null;
    };
  }, [doc, session.id, session.relay]);
  useEffect(() => {
    const interval = setInterval(
      () =>
        setPeers((previous) =>
          Object.fromEntries(
            Object.entries(previous).filter(
              ([, peer]) => Date.now() - peer.at < 16000,
            ),
          ),
        ),
      5000,
    );
    return () => clearInterval(interval);
  }, []);
  function presence(patch: Partial<Presence>) {
    latest.current = { ...latest.current, ...patch, role, at: Date.now() };
    sync.current?.presence(latest.current);
  }
  function undo() {
    undoManager.current?.undo();
    setUndoState({
      undo: Boolean(undoManager.current?.undoStack.length),
      redo: Boolean(undoManager.current?.redoStack.length),
    });
  }
  function redo() {
    undoManager.current?.redo();
    setUndoState({
      undo: Boolean(undoManager.current?.undoStack.length),
      redo: Boolean(undoManager.current?.redoStack.length),
    });
  }
  function stopCapturing() {
    undoManager.current?.stopCapturing();
  }
  return {
    doc,
    cards,
    strokes,
    peers: Object.values(peers),
    status,
    saved,
    presence,
    undo,
    redo,
    stopCapturing,
    canUndo: undoState.undo,
    canRedo: undoState.redo,
    ownId: id.current,
  };
}
