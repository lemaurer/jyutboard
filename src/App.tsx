import { useEffect, useRef, useState, type PointerEvent } from "react";
import * as Y from "yjs";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  Copy,
  Download,
  Grip,
  Globe,
  Highlighter,
  LocateFixed,
  Minus,
  MousePointer2,
  PanelLeft,
  PanelRight,
  Pencil,
  Plus,
  Radio,
  Redo2,
  Send,
  Settings as SettingsIcon,
  Star,
  StickyNote,
  Table2,
  Trash2,
  Undo2,
  Upload,
  Users,
  Volume2,
  Expand,
  Eye,
  EyeOff,
  X,
} from "lucide-react";
import {
  addCard,
  addTableRow,
  cardSchema,
  createCard,
  createTableRow,
  deleteTableRow,
  getTableRow,
  inviteFor,
  newRoom,
  parseInvite,
  parseReceipts,
  patchCard,
  patchTableRow,
  queuePayload,
  validateRelay,
  type Card,
  type CardMode,
  type CardShape,
  type Role,
  type Session,
  type SourceLanguage,
  type Stroke,
  type TableRow,
  type Word,
} from "./model";
import { analyzeLocal, translatePublic } from "./language";
import { loadPreference, preference, remember, sessions } from "./storage";
import { useLesson } from "./useLesson";
import { AudioRecorder } from "./AudioRecorder";
import { Settings } from "./Settings";
import { WordBreakdown } from "./WordBreakdown";

type Tool =
  | "select"
  | "draw"
  | "highlight"
  | "arrow"
  | "phrase"
  | "note"
  | "table"
  | "sticker";
const BOARD_WIDTH = 5600;
const BOARD_HEIGHT = 3600;
const CENTER_X = BOARD_WIDTH / 2;
const CENTER_Y = BOARD_HEIGHT / 2;
const STICKERS = [
  "⭐",
  "💡",
  "❓",
  "❤️",
  "👏",
  "🍜",
  "☕",
  "🎯",
  "✨",
  "🦝",
  "🐻",
  "🎉",
];
const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
function initialSession() {
  const previous = sessions()[0];
  if (previous) return previous;
  const first = {
    id: newRoom(),
    title: "Our first Cantonese lesson",
    created: Date.now(),
  };
  remember(first);
  return first;
}
function englishHidden(card: Card, teacher: boolean) {
  return !teacher && (card.mode === "practice" || card.hideEnglishForLearner);
}

export default function App() {
  const [session, setSession] = useState<Session>(initialSession);
  const [history, setHistory] = useState(sessions);
  const [role, setRole] = useState<Role>(
    loadPreference("role", "learner") === "teacher" ? "teacher" : "learner",
  );
  const [online, setOnline] = useState(
    loadPreference("online", "true") === "true",
  );
  const [leftOpen, setLeftOpen] = useState(
    loadPreference("leftOpen", "true") === "true",
  );
  const [rightOpen, setRightOpen] = useState(
    loadPreference("rightOpen", "true") === "true",
  );
  const [temporaryRight, setTemporaryRight] = useState(false);
  const lesson = useLesson(session, role);
  const { doc, cards, strokes, peers, status, saved } = lesson;
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const [selectedStroke, setSelectedStroke] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [settings, setSettings] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [invite, setInvite] = useState("");
  const [relay, setRelay] = useState(loadPreference("relay", ""));
  const [join, setJoin] = useState("");
  const [sharingBusy, setSharingBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [tool, setTool] = useState<Tool>("select");
  const [sticker, setSticker] = useState("⭐");
  const [sourceLanguage, setSourceLanguage] =
    useState<SourceLanguage>("chinese");
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [followPeerId, setFollowPeerId] = useState<string | null>(null);
  const [autoFollowing, setAutoFollowing] = useState(false);
  const [dismissedPresenter, setDismissedPresenter] = useState<string | null>(
    null,
  );
  const [presenting, setPresenting] = useState(false);
  const [highlightedPeer, setHighlightedPeer] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const [pending, setPending] = useState<Stroke | null>(null);
  const [sending, setSending] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const board = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const path = useRef<Stroke | null>(null);
  const lastPresence = useRef(0);
  const lastViewPresence = useRef(0);
  const viewPresenceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const lastAttention = useRef<Record<string, number>>({});
  const ownCursor = useRef<[number, number] | null>(null);
  const centeredSession = useRef<string | null>(null);
  const translationRequests = useRef(new Map<string, number>());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const active = cards.find((card) => card.id === selected);
  const activeRow = active?.rows.find((row) => row.id === selectedRow);
  const teacher = role === "teacher";
  const stars = cards.filter((card) => card.starred && card.kind === "phrase");
  const hidden = active ? englishHidden(active, teacher) : false;
  const effectiveRightOpen = rightOpen || temporaryRight;

  function notify(message: string) {
    setNotice(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setNotice(""), 6500);
  }
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  useEffect(() => {
    preference("role", role);
    lesson.presence({ role });
  }, [role]);
  useEffect(() => {
    preference("leftOpen", String(leftOpen));
  }, [leftOpen]);
  useEffect(() => {
    preference("rightOpen", String(rightOpen));
  }, [rightOpen]);
  useEffect(() => {
    zoomRef.current = zoom;
    publishView();
  }, [zoom]);
  useEffect(() => {
    if (!doc || centeredSession.current === session.id) return;
    centeredSession.current = session.id;
    const node = viewport.current;
    if (!node) return;
    const targetX = cards.length
      ? cards.reduce((sum, card) => sum + card.x, 0) / cards.length
      : CENTER_X;
    const targetY = cards.length
      ? cards.reduce((sum, card) => sum + card.y, 0) / cards.length
      : CENTER_Y;
    requestAnimationFrame(() => centerView(targetX, targetY));
  }, [doc, session.id, cards]);
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const onScroll = () => publishView();
    node.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      node.removeEventListener("scroll", onScroll);
      clearTimeout(viewPresenceTimer.current);
    };
  }, [doc, session.id, role]);
  useEffect(() => {
    lesson.presence({ presenting: teacher && presenting });
  }, [presenting, role, doc]);
  useEffect(() => {
    const presenter = peers.find(
      (peer) => peer.role === "teacher" && peer.presenting,
    );
    if (!presenter) {
      setDismissedPresenter(null);
      if (autoFollowing) {
        setFollowPeerId(null);
        setAutoFollowing(false);
      }
    } else if (
      !teacher &&
      presenter.id !== dismissedPresenter &&
      !followPeerId
    ) {
      setFollowPeerId(presenter.id);
      setAutoFollowing(true);
    }
  }, [peers, role, dismissedPresenter, followPeerId, autoFollowing]);
  useEffect(() => {
    const peer = peers.find((item) => item.id === followPeerId);
    if (followPeerId && !peer) {
      setFollowPeerId(null);
      setAutoFollowing(false);
      return;
    }
    if (!peer?.view) return;
    const node = viewport.current;
    if (!node) return;
    if (Math.abs(zoomRef.current - peer.view.zoom) > 0.002) {
      zoomRef.current = peer.view.zoom;
      setZoom(peer.view.zoom);
    }
    const left = peer.view.x * peer.view.zoom - node.clientWidth / 2;
    const top = peer.view.y * peer.view.zoom - node.clientHeight / 2;
    const frame = requestAnimationFrame(() => {
      if (Math.abs(node.scrollLeft - left) > 2) node.scrollLeft = left;
      if (Math.abs(node.scrollTop - top) > 2) node.scrollTop = top;
    });
    return () => cancelAnimationFrame(frame);
  }, [peers, followPeerId]);
  useEffect(() => {
    for (const peer of peers) {
      if (
        !peer.attentionAt ||
        Date.now() - peer.attentionAt > 10000 ||
        peer.attentionAt <= (lastAttention.current[peer.id] ?? 0)
      )
        continue;
      lastAttention.current[peer.id] = peer.attentionAt;
      jumpToPeer(peer);
      notify(
        `${peer.role === "teacher" ? "Natasha" : "Leif"} called you to their cursor.`,
      );
    }
  }, [peers]);
  useEffect(() => {
    if (selected && !cards.some((card) => card.id === selected)) {
      setSelected(null);
      setTemporaryRight(false);
      setSelectedRow(null);
    }
    if (
      selectedStroke &&
      !strokes.some((stroke) => stroke.id === selectedStroke)
    )
      setSelectedStroke(null);
  }, [cards, strokes, selected, selectedStroke]);
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    function wheel(event: WheelEvent) {
      if (!node || !(event.ctrlKey || event.metaKey || event.altKey)) return;
      event.preventDefault();
      const bounds = node.getBoundingClientRect();
      const cursorX = event.clientX - bounds.left;
      const cursorY = event.clientY - bounds.top;
      const oldZoom = zoomRef.current;
      const nextZoom = clamp(
        oldZoom * Math.exp(-event.deltaY * 0.008),
        0.35,
        2.5,
      );
      const pointX = (node.scrollLeft + cursorX) / oldZoom;
      const pointY = (node.scrollTop + cursorY) / oldZoom;
      zoomRef.current = nextZoom;
      setZoom(nextZoom);
      requestAnimationFrame(() => {
        node.scrollLeft = pointX * nextZoom - cursorX;
        node.scrollTop = pointY * nextZoom - cursorY;
      });
    }
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
  }, []);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "z" &&
        !settings &&
        !sharing
      ) {
        event.preventDefault();
        if (event.shiftKey) lesson.redo();
        else lesson.undo();
        return;
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "y" &&
        !settings &&
        !sharing
      ) {
        event.preventDefault();
        lesson.redo();
        return;
      }
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (settings || sharing || !doc) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"]')) return;
      lesson.stopCapturing();
      if (selectedStroke) {
        doc.getMap("strokes").delete(selectedStroke);
        setSelectedStroke(null);
        event.preventDefault();
      } else if (selected && selectedRow) {
        deleteTableRow(doc, selected, selectedRow);
        setSelectedRow(null);
        event.preventDefault();
      } else if (selected) {
        doc.getMap("cards").delete(selected);
        clearSelection();
        event.preventDefault();
      }
      lesson.stopCapturing();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [doc, selected, selectedRow, selectedStroke, settings, sharing]);

  function selectCard(cardId: string, rowId: string | null = null) {
    setSelected(cardId);
    setSelectedRow(rowId);
    setSelectedStroke(null);
    if (!rightOpen) setTemporaryRight(true);
  }
  function clearSelection() {
    setSelected(null);
    setSelectedRow(null);
    setSelectedStroke(null);
    setTemporaryRight(false);
  }
  function switchSession(value: Session) {
    setSession(value);
    setHistory(remember(value));
    clearSelection();
    setInvite("");
    setInput("");
    centeredSession.current = null;
    setFollowPeerId(null);
    setPresenting(false);
  }
  function updateSession(value: Session) {
    setSession(value);
    setHistory(remember(value));
  }
  function point(event: {
    clientX: number;
    clientY: number;
  }): [number, number] {
    const rect = board.current!.getBoundingClientRect();
    return [
      clamp(
        (event.clientX - rect.left) / zoomRef.current,
        0,
        BOARD_WIDTH - 100,
      ),
      clamp(
        (event.clientY - rect.top) / zoomRef.current,
        0,
        BOARD_HEIGHT - 100,
      ),
    ];
  }
  function centerView(x: number, y: number, scale = zoomRef.current) {
    const node = viewport.current;
    if (!node) return;
    node.scrollLeft = clamp(
      x * scale - node.clientWidth / 2,
      0,
      BOARD_WIDTH * scale - node.clientWidth,
    );
    node.scrollTop = clamp(
      y * scale - node.clientHeight / 2,
      0,
      BOARD_HEIGHT * scale - node.clientHeight,
    );
  }
  function viewCenter(): [number, number] {
    const node = viewport.current;
    if (!node) return [CENTER_X, CENTER_Y];
    return [
      (node.scrollLeft + node.clientWidth / 2) / zoomRef.current,
      (node.scrollTop + node.clientHeight / 2) / zoomRef.current,
    ];
  }
  function publishView() {
    const node = viewport.current;
    if (!node || !doc) return;
    const elapsed = Date.now() - lastViewPresence.current;
    clearTimeout(viewPresenceTimer.current);
    if (elapsed < 35) {
      viewPresenceTimer.current = setTimeout(publishView, 35 - elapsed);
      return;
    }
    lastViewPresence.current = Date.now();
    const [x, y] = viewCenter();
    lesson.presence({ view: { x, y, zoom: zoomRef.current } });
  }
  function jumpToPeer(peer: (typeof peers)[number]) {
    const x = peer.x ?? peer.view?.x;
    const y = peer.y ?? peer.view?.y;
    if (x === undefined || y === undefined) return;
    centerView(x, y);
    setHighlightedPeer(peer.id);
    setTimeout(
      () =>
        setHighlightedPeer((current) => (current === peer.id ? null : current)),
      3000,
    );
  }
  function callPartnerHere() {
    const [x, y] = ownCursor.current ?? viewCenter();
    lesson.presence({ x, y, attentionAt: Date.now(), signal: "Look here" });
    notify("Called your partner to this spot.");
  }
  function stopFollowing() {
    if (autoFollowing && followPeerId) setDismissedPresenter(followPeerId);
    setFollowPeerId(null);
    setAutoFollowing(false);
  }
  async function enrichPhrase(document: Y.Doc, card: Card) {
    if (!online || !card.chinese.trim()) return;
    const revision = Date.now();
    translationRequests.current.set(card.id, revision);
    try {
      const definition = await (window.desktop
        ? window.desktop.translate(card.chinese)
        : translatePublic(card.chinese));
      const current = document.getMap<Y.Map<unknown>>("cards").get(card.id);
      if (
        translationRequests.current.get(card.id) === revision &&
        current?.get("chinese") === card.chinese &&
        current?.get("translation") !== "edited"
      )
        document.transact(
          () =>
            patchCard(document, card.id, {
              definition,
              translation: "translated",
            }),
          "translation",
        );
    } catch {
      const current = document.getMap<Y.Map<unknown>>("cards").get(card.id);
      if (
        current?.get("chinese") === card.chinese &&
        current.get("translation") !== "edited"
      )
        document.transact(
          () =>
            patchCard(document, card.id, {
              translation: "offline · word meanings",
            }),
          "translation",
        );
    }
  }
  async function enrichRow(document: Y.Doc, cardId: string, row: TableRow) {
    if (!online || !row.chinese.trim()) return;
    const key = `${cardId}:${row.id}`;
    const revision = Date.now();
    translationRequests.current.set(key, revision);
    try {
      const definition = await (window.desktop
        ? window.desktop.translate(row.chinese)
        : translatePublic(row.chinese));
      const current = getTableRow(document, cardId, row.id);
      if (
        translationRequests.current.get(key) === revision &&
        current?.chinese === row.chinese &&
        current.translation !== "edited"
      )
        document.transact(
          () =>
            patchTableRow(document, cardId, row.id, {
              definition,
              translation: "translated",
            }),
          "translation",
        );
    } catch {
      const current = getTableRow(document, cardId, row.id);
      if (current?.chinese === row.chinese && current.translation !== "edited")
        document.transact(
          () =>
            patchTableRow(document, cardId, row.id, {
              translation: "offline · word meanings",
            }),
          "translation",
        );
    }
  }
  function newCardPosition(): [number, number] {
    const [x, y] = viewCenter();
    return [
      clamp(x - 140 + (cards.length % 3) * 28, 0, BOARD_WIDTH - 350),
      clamp(y - 70 + (cards.length % 3) * 28, 0, BOARD_HEIGHT - 300),
    ];
  }
  function addPhrase(
    text = input,
    location = newCardPosition(),
    language = sourceLanguage,
  ) {
    if (!doc || !text.trim()) return;
    if (text.length > 2000) {
      notify("Keep each phrase under 2,000 characters.");
      return;
    }
    if (language === "chinese" && !/\p{Script=Han}/u.test(text)) {
      notify(
        "Choose Jyutping or English above the input, or type Chinese characters.",
      );
      return;
    }
    const content = text.trim();
    const card = createCard({
      sourceLanguage: language,
      ...(language === "chinese"
        ? { chinese: content, ...analyzeLocal(content) }
        : language === "jyutping"
          ? { jyutping: content }
          : { definition: content, translation: "edited" }),
      x: location[0],
      y: location[1],
    });
    lesson.stopCapturing();
    addCard(doc, card);
    lesson.stopCapturing();
    selectCard(card.id);
    setInput("");
    lesson.presence({ draft: "" });
    if (language === "chinese") void enrichPhrase(doc, card);
  }
  function addBlankPhrase(location = newCardPosition()) {
    if (!doc) return;
    const card = createCard({
      sourceLanguage: teacher ? "chinese" : "jyutping",
      x: location[0],
      y: location[1],
    });
    lesson.stopCapturing();
    addCard(doc, card);
    lesson.stopCapturing();
    selectCard(card.id);
    setTool("select");
  }
  function addNote(location = newCardPosition()) {
    if (!doc) return;
    const card = createCard({
      kind: "note",
      definition: "A little note…",
      shape: "sticky",
      x: location[0],
      y: location[1],
    });
    lesson.stopCapturing();
    addCard(doc, card);
    lesson.stopCapturing();
    selectCard(card.id);
    setTool("select");
  }
  function addTable(location = newCardPosition()) {
    if (!doc) return;
    const card = createCard({
      kind: "table",
      chinese: "Phrase list",
      rows: [createTableRow()],
      x: location[0],
      y: location[1],
      shape: "sheet",
    });
    lesson.stopCapturing();
    addCard(doc, card);
    lesson.stopCapturing();
    selectCard(card.id);
    setTool("select");
  }
  function addSticker(location = newCardPosition(), value = sticker) {
    if (!doc) return;
    const card = createCard({
      kind: "sticker",
      sticker: value,
      x: location[0],
      y: location[1],
    });
    lesson.stopCapturing();
    addCard(doc, card);
    lesson.stopCapturing();
    selectCard(card.id);
    setTool("select");
  }
  function sample() {
    if (!doc) return;
    for (const [index, text] of [
      "你今日想食咩呀？",
      "唔該埋單。",
      "我想飲水。",
    ].entries()) {
      addCard(
        doc,
        createCard({
          chinese: text,
          ...analyzeLocal(text),
          x: CENTER_X - 360 + index * 275,
          y: CENTER_Y - 190 + (index % 2) * 65,
          starred: index === 0,
        }),
      );
    }
    addCard(
      doc,
      createCard({
        kind: "note",
        definition:
          "A little Cantonese, together.\n\nTry a phrase you would actually say today. ☕",
        shape: "sticky",
        x: CENTER_X - 320,
        y: CENTER_Y + 130,
      }),
    );
  }
  function pointerMove(event: PointerEvent) {
    const [x, y] = point(event);
    ownCursor.current = [x, y];
    if (Date.now() - lastPresence.current > 32) {
      lesson.presence({ x, y });
      lastPresence.current = Date.now();
    }
    if (drag.current && doc) {
      patchCard(doc, drag.current.id, {
        x: Math.round(clamp(x - drag.current.dx, 0, BOARD_WIDTH - 300)),
        y: Math.round(clamp(y - drag.current.dy, 0, BOARD_HEIGHT - 300)),
      });
    } else if (path.current) {
      const stroke = path.current;
      if (stroke.arrow) stroke.points = [stroke.points[0], [x, y]];
      else if (stroke.points.length < 5000) stroke.points.push([x, y]);
      setPending({ ...stroke, points: [...stroke.points] });
    }
  }
  function endPointer() {
    if (drag.current) lesson.stopCapturing();
    drag.current = null;
    if (path.current && doc) {
      if (path.current.points.length > 1)
        doc.getMap<Stroke>("strokes").set(path.current.id, path.current);
      path.current = null;
      setPending(null);
      lesson.stopCapturing();
    }
  }
  function startDrag(event: PointerEvent<HTMLElement>, card: Card) {
    if (
      tool !== "select" ||
      (event.target as HTMLElement).closest(
        "button, input, textarea, audio, select",
      )
    )
      return;
    lesson.stopCapturing();
    selectCard(card.id);
    const [x, y] = point(event);
    drag.current = { id: card.id, dx: x - card.x, dy: y - card.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function updateWords(words: Word[]) {
    if (!doc || !active) return;
    const jyutping = words
      .map((word) => word.jyutping)
      .filter(Boolean)
      .join(" ");
    if (activeRow)
      patchTableRow(doc, active.id, activeRow.id, { words, jyutping });
    else patchCard(doc, active.id, { words, jyutping });
  }
  function changeChinese(value: string) {
    if (!doc || !active) return;
    patchCard(doc, active.id, {
      chinese: value,
      ...analyzeLocal(value),
      receipt: "",
    });
  }
  function changeRowChinese(cardId: string, row: TableRow, value: string) {
    if (!doc) return;
    patchTableRow(doc, cardId, row.id, {
      chinese: value,
      ...analyzeLocal(value),
    });
  }
  function resetWords() {
    if (!active) return;
    updateWords(analyzeLocal(activeRow?.chinese ?? active.chinese).words);
  }
  function zoomBy(delta: number) {
    const node = viewport.current;
    const oldZoom = zoomRef.current;
    const nextZoom = clamp(oldZoom + delta, 0.35, 2.5);
    if (!node) {
      setZoom(nextZoom);
      return;
    }
    const cx = node.clientWidth / 2;
    const cy = node.clientHeight / 2;
    const x = (node.scrollLeft + cx) / oldZoom;
    const y = (node.scrollTop + cy) / oldZoom;
    zoomRef.current = nextZoom;
    setZoom(nextZoom);
    requestAnimationFrame(() => {
      node.scrollLeft = x * nextZoom - cx;
      node.scrollTop = y * nextZoom - cy;
    });
  }
  async function host() {
    setSharingBusy(true);
    try {
      if (relay.trim()) {
        validateRelay(relay.trim());
        updateSession({ ...session, relay: relay.trim() });
        setInvite(inviteFor(session.id, relay.trim()));
        preference("relay", relay.trim());
      } else {
        if (!window.desktop)
          throw Error("Use the desktop app to host, or enter a relay URL.");
        const result = await window.desktop.host();
        updateSession({ ...session, relay: result.local });
        setInvite(inviteFor(session.id, result.addresses[0] || result.local));
      }
    } catch (error) {
      notify(errorText(error));
    } finally {
      setSharingBusy(false);
    }
  }
  async function hostRemote() {
    if (!window.desktop) {
      notify("Open the desktop app to start a remote lesson.");
      return;
    }
    setSharingBusy(true);
    try {
      const result = await window.desktop.hostRemote();
      updateSession({ ...session, relay: result.url });
      setInvite(inviteFor(session.id, result.url));
      notify("Remote lesson ready. Copy the invitation for your partner.");
    } catch (error) {
      notify(errorText(error));
    } finally {
      setSharingBusy(false);
    }
  }
  function joinRoom() {
    try {
      const parsed = parseInvite(join);
      const existing = history.find((item) => item.id === parsed.room);
      switchSession(
        existing
          ? { ...existing, relay: parsed.relay }
          : {
              id: parsed.room,
              title: "Shared Cantonese lesson",
              created: Date.now(),
              relay: parsed.relay,
            },
      );
      setSharing(false);
      notify("Joining the shared lesson…");
    } catch (error) {
      notify(errorText(error));
    }
  }
  async function sendToQueue(items: Card[]) {
    if (!items.length) return;
    if (
      items.some(
        (card) =>
          !card.chinese.trim() &&
          !(card.sourceLanguage === "jyutping"
            ? card.jyutping.trim()
            : card.definition.trim()),
      )
    ) {
      notify("Fill in each saved phrase before sending it.");
      return;
    }
    if (!window.desktop) {
      notify("Use the desktop app to send phrases to JyutDeck.");
      return;
    }
    if (!doc) return;
    setSending(true);
    try {
      for (let start = 0; start < items.length; start += 5) {
        const batch = items.slice(start, start + 5);
        const receipts = parseReceipts(
          await window.desktop.send(queuePayload(batch, session)),
          batch.length,
        );
        batch.forEach((card, index) =>
          patchCard(doc, card.id, { receipt: receipts[index] }),
        );
      }
      notify("Queue receipts updated. Check each phrase for its result.");
    } catch (error) {
      notify(
        errorText(error) + " Your saved phrases are still here; retry is safe.",
      );
    } finally {
      setSending(false);
    }
  }
  async function backup() {
    const text = JSON.stringify(
      { format: "jyutboard-v1", title: session.title, cards, strokes },
      null,
      2,
    );
    try {
      if (window.desktop) {
        if (await window.desktop.saveBackup(text))
          notify("Lesson backup exported, including recordings.");
      } else {
        const url = URL.createObjectURL(
          new Blob([text], { type: "application/json" }),
        );
        const link = document.createElement("a");
        link.href = url;
        link.download = "JyutBoard-lesson.json";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
    } catch (error) {
      notify(errorText(error));
    }
  }
  async function importBackup(file: File) {
    try {
      if (file.size > 30_000_000)
        throw Error("Backup is too large (30 MB maximum).");
      const value = JSON.parse(await file.text());
      if (
        value.format !== "jyutboard-v1" ||
        !Array.isArray(value.cards) ||
        value.cards.length > 500 ||
        !Array.isArray(value.strokes) ||
        value.strokes.length > 1000
      )
        throw Error("Invalid lesson backup.");
      const restored = value.cards.map((item: unknown) =>
        cardSchema.parse(item),
      );
      const drawing: Stroke[] = value.strokes;
      if (
        drawing.some(
          (stroke) =>
            !stroke ||
            typeof stroke.id !== "string" ||
            typeof stroke.color !== "string" ||
            typeof stroke.arrow !== "boolean" ||
            !Array.isArray(stroke.points) ||
            stroke.points.length > 5000 ||
            stroke.points.some(
              (point) =>
                !Array.isArray(point) ||
                point.length !== 2 ||
                point.some(
                  (number) =>
                    !Number.isFinite(number) || number < 0 || number > 4000,
                ),
            ),
        )
      )
        throw Error("Invalid drawings in backup.");
      const restoredSession = {
        id: newRoom(),
        title: String(value.title || "Imported lesson").slice(0, 100),
        created: Date.now(),
      };
      const { IndexeddbPersistence } = await import("y-indexeddb");
      const document = new Y.Doc();
      const store = new IndexeddbPersistence(
        `jyutboard:${restoredSession.id}`,
        document,
      );
      await store.whenSynced;
      restored.forEach((card: Card) => addCard(document, card));
      drawing.forEach((stroke) =>
        document.getMap<Stroke>("strokes").set(stroke.id, stroke),
      );
      await store.set("imported", Date.now());
      await store.destroy();
      document.destroy();
      switchSession(restoredSession);
      notify("Lesson restored as a separate session.");
    } catch (error) {
      notify(errorText(error));
    }
  }
  function signal(message: string) {
    lesson.presence({ signal: message });
    setTimeout(() => lesson.presence({ signal: "" }), 6000);
    notify("Sent: " + message);
  }
  function removeSelected() {
    if (!doc) return;
    lesson.stopCapturing();
    if (selectedStroke) {
      doc.getMap("strokes").delete(selectedStroke);
      setSelectedStroke(null);
    } else if (selected && selectedRow) {
      deleteTableRow(doc, selected, selectedRow);
      setSelectedRow(null);
    } else if (selected) {
      doc.getMap("cards").delete(selected);
      clearSelection();
    }
    lesson.stopCapturing();
  }

  const wordOwner = activeRow ?? active;
  const wordList = wordOwner?.words ?? [];
  return (
    <div className="app">
      {leftOpen && (
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-icon">粵</div>
            <strong>JyutBoard</strong>
          </div>
          <div className="sidebar-section-title">PAGES</div>
          <button
            className="new-session"
            onClick={() =>
              switchSession({
                id: newRoom(),
                title: `Lesson ${history.length + 1}`,
                created: Date.now(),
              })
            }
          >
            <Plus size={15} /> New lesson
          </button>
          <div className="history">
            {history.map((item, index) => (
              <button
                key={item.id}
                className={item.id === session.id ? "current" : ""}
                onClick={() => switchSession(item)}
              >
                <span>{index + 1}.</span>
                <strong>{item.title}</strong>
              </button>
            ))}
          </div>
          <div className="sidebar-bottom">
            <div className="sidebar-section-title">VIEW</div>
            <div className="segmented">
              <button
                className={!teacher ? "active" : ""}
                onClick={() => setRole("learner")}
              >
                Leif
              </button>
              <button
                className={teacher ? "active" : ""}
                onClick={() => setRole("teacher")}
              >
                Natasha
              </button>
            </div>
            <p className="role-hint">
              {teacher ? "Chinese first" : "Jyutping first"}
            </p>
            <button
              className="settings-button"
              onClick={() => setSettings(true)}
            >
              <SettingsIcon size={15} /> Settings
            </button>
          </div>
        </aside>
      )}
      <main>
        <div className="topbar">
          <div className="topbar-left">
            <button
              className={leftOpen ? "icon-button active" : "icon-button"}
              aria-label={leftOpen ? "Hide pages" : "Show pages"}
              title={leftOpen ? "Hide pages" : "Show pages"}
              onClick={() => setLeftOpen((value) => !value)}
            >
              <PanelLeft size={18} />
            </button>
            <span className="top-divider" />
            {renaming ? (
              <input
                className="lesson-name-input"
                autoFocus
                maxLength={100}
                value={session.title}
                onChange={(event) =>
                  updateSession({ ...session, title: event.target.value })
                }
                onBlur={() => setRenaming(false)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") setRenaming(false);
                }}
              />
            ) : (
              <button
                className="lesson-name"
                title="Rename lesson"
                onClick={() => setRenaming(true)}
              >
                {session.title}
                <Pencil size={12} />
              </button>
            )}
          </div>
          <div className="topbar-right">
            <span className={`connection ${status === "Live" ? "live" : ""}`}>
              <i />
              {status === "Live" ? `${peers.length + 1} live` : status}
            </span>
            <button
              className="icon-button"
              aria-label="Export lesson backup"
              title="Export lesson backup"
              onClick={() => void backup()}
            >
              <Download size={16} />
            </button>
            <button
              className="icon-button"
              aria-label="Import lesson backup"
              title="Import lesson backup"
              onClick={() => importInput.current?.click()}
            >
              <Upload size={16} />
            </button>
            <input
              type="file"
              accept=".json"
              hidden
              ref={importInput}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importBackup(file);
                event.target.value = "";
              }}
            />
            <button className="share-button" onClick={() => setSharing(true)}>
              <Users size={15} /> Share / Sync
            </button>
            {peers.map((peer) => (
              <button
                key={peer.id}
                className="partner-button"
                title={`Find ${peer.role === "teacher" ? "Natasha" : "Leif"} on the canvas`}
                onClick={() => jumpToPeer(peer)}
              >
                <span>{peer.role === "teacher" ? "🐻" : "🦝"}</span>
                {peer.role === "teacher" ? "Natasha" : "Leif"}
                <LocateFixed size={13} />
              </button>
            ))}
            {peers.length > 0 && (
              <button
                className="partner-button"
                onClick={callPartnerHere}
                title="Bring your partner to this spot"
              >
                <LocateFixed size={14} /> Look here
              </button>
            )}
            {!followPeerId && peers.length > 0 && (
              <button
                className="partner-button"
                onClick={() => {
                  setFollowPeerId(peers[0].id);
                  setAutoFollowing(false);
                }}
              >
                <Eye size={14} /> Follow
              </button>
            )}
            {teacher && peers.length > 0 && (
              <button
                className={
                  presenting ? "partner-button presenting" : "partner-button"
                }
                title="Show Leif exactly where you are looking"
                onClick={() => {
                  setPresenting((value) => !value);
                  setFollowPeerId(null);
                  setAutoFollowing(false);
                }}
              >
                {presenting ? <EyeOff size={14} /> : <Eye size={14} />}{" "}
                {presenting ? "Stop guiding" : "Guide Leif"}
              </button>
            )}
            <button
              className={
                effectiveRightOpen ? "icon-button active" : "icon-button"
              }
              aria-label={effectiveRightOpen ? "Hide details" : "Show details"}
              title={effectiveRightOpen ? "Hide details" : "Show details"}
              onClick={() => {
                if (temporaryRight) {
                  setTemporaryRight(false);
                  setRightOpen(false);
                } else setRightOpen((value) => !value);
              }}
            >
              <PanelRight size={18} />
            </button>
          </div>
        </div>
        <div className="workspace">
          <section className="canvas-column">
            <div className="canvas-actions">
              <div className="tool-group">
                <button
                  title="Select and move"
                  aria-label="Select and move"
                  className={tool === "select" ? "active" : ""}
                  onClick={() => setTool("select")}
                >
                  <MousePointer2 size={17} />
                </button>
                <button
                  title="Draw"
                  aria-label="Draw"
                  className={tool === "draw" ? "active" : ""}
                  onClick={() => setTool("draw")}
                >
                  <Pencil size={17} />
                </button>
                <button
                  title="Highlight"
                  aria-label="Highlight"
                  className={tool === "highlight" ? "active" : ""}
                  onClick={() => setTool("highlight")}
                >
                  <Highlighter size={17} />
                </button>
                <button
                  title="Draw arrow"
                  aria-label="Draw arrow"
                  className={tool === "arrow" ? "active" : ""}
                  onClick={() => setTool("arrow")}
                >
                  <ArrowUpRight size={18} />
                </button>
                <span className="top-divider" />
                <button
                  title="Place phrase card on canvas"
                  aria-label="Place phrase card on canvas"
                  className={tool === "phrase" ? "active" : ""}
                  onClick={() => setTool("phrase")}
                >
                  <Plus size={17} />
                </button>
                <button
                  title="Place note on canvas"
                  aria-label="Place note on canvas"
                  className={tool === "note" ? "active" : ""}
                  onClick={() => setTool("note")}
                >
                  <StickyNote size={17} />
                </button>
                <button
                  title="Add phrase table"
                  aria-label="Add phrase table"
                  onClick={() => addTable()}
                >
                  <Table2 size={17} />
                </button>
                <button
                  title="Place sticker on canvas"
                  aria-label="Place sticker on canvas"
                  className={tool === "sticker" ? "active" : ""}
                  onClick={() => setTool("sticker")}
                >
                  ⭐
                </button>
              </div>
              <div className="tool-group">
                <span className="view-badge">
                  {teacher ? "Natasha · 中文" : "Leif · Jyutping"}
                </span>
                <button
                  title="Undo (⌘Z)"
                  aria-label="Undo"
                  disabled={!lesson.canUndo}
                  onClick={lesson.undo}
                >
                  <Undo2 size={16} />
                </button>
                <button
                  title="Redo (⇧⌘Z)"
                  aria-label="Redo"
                  disabled={!lesson.canRedo}
                  onClick={lesson.redo}
                >
                  <Redo2 size={16} />
                </button>
              </div>
            </div>
            {tool === "sticker" && (
              <div className="sticker-palette">
                <span>Pick a sticker, then click the canvas</span>
                {STICKERS.map((value) => (
                  <button
                    key={value}
                    className={sticker === value ? "active" : ""}
                    aria-label={`Sticker ${value}`}
                    onClick={() => setSticker(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
            )}
            {followPeerId && (
              <div className="follow-banner">
                <Eye size={15} /> Following{" "}
                {peers.find((peer) => peer.id === followPeerId)?.role ===
                "teacher"
                  ? "Natasha"
                  : "Leif"}
                ’s view <button onClick={stopFollowing}>Stop following</button>
              </div>
            )}
            <div className="canvas-viewport" ref={viewport}>
              <div
                style={{
                  width: BOARD_WIDTH * zoom,
                  height: BOARD_HEIGHT * zoom,
                }}
              >
                <div
                  className={`canvas tool-${tool}`}
                  ref={board}
                  style={{ transform: `scale(${zoom})` }}
                  onPointerMove={pointerMove}
                  onPointerUp={endPointer}
                  onPointerCancel={endPointer}
                  onPointerDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    clearSelection();
                    const location = point(event);
                    if (tool === "phrase") {
                      addBlankPhrase(location);
                      return;
                    }
                    if (tool === "note") {
                      addNote(location);
                      return;
                    }
                    if (tool === "table") {
                      addTable(location);
                      return;
                    }
                    if (tool === "sticker") {
                      addSticker(location);
                      return;
                    }
                    if (
                      tool === "draw" ||
                      tool === "arrow" ||
                      tool === "highlight"
                    ) {
                      lesson.stopCapturing();
                      path.current = {
                        id: crypto.randomUUID(),
                        points: [location],
                        color: tool === "highlight" ? "#ffd453" : "#3159e8",
                        arrow: tool === "arrow",
                        width: tool === "highlight" ? 20 : 3,
                        opacity: tool === "highlight" ? 0.46 : 1,
                      };
                      setPending(path.current);
                      event.currentTarget.setPointerCapture(event.pointerId);
                    }
                  }}
                  onDoubleClick={(event) => {
                    if (
                      event.target === event.currentTarget &&
                      tool === "select"
                    )
                      addBlankPhrase(point(event));
                  }}
                >
                  <svg
                    className="drawings"
                    width={BOARD_WIDTH}
                    height={BOARD_HEIGHT}
                  >
                    <defs>
                      <marker
                        id="arrowhead"
                        markerWidth="8"
                        markerHeight="8"
                        refX="7"
                        refY="4"
                        orient="auto"
                      >
                        <path d="M0,0 L8,4 L0,8" fill="#3159e8" />
                      </marker>
                    </defs>
                    {[...strokes, ...(pending ? [pending] : [])].map(
                      (stroke) => (
                        <polyline
                          key={stroke.id}
                          className={
                            selectedStroke === stroke.id
                              ? "selected-stroke"
                              : ""
                          }
                          points={stroke.points
                            .map((point) => point.join(","))
                            .join(" ")}
                          fill="none"
                          stroke={stroke.color}
                          strokeWidth={stroke.width ?? 3}
                          opacity={stroke.opacity ?? 1}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          markerEnd={
                            stroke.arrow ? "url(#arrowhead)" : undefined
                          }
                          onPointerDown={(event) => {
                            if (tool === "select") {
                              event.stopPropagation();
                              setSelectedStroke(stroke.id);
                              setSelected(null);
                              setSelectedRow(null);
                              if (!rightOpen) setTemporaryRight(true);
                            }
                          }}
                        />
                      ),
                    )}
                  </svg>
                  {!cards.length && (
                    <div className="welcome">
                      <span className="welcome-icon">粵</span>
                      <h1>Let’s make a lesson.</h1>
                      <p>
                        Write a phrase, add a table, or sketch something
                        together. Natasha sees Chinese; Leif sees Jyutping.
                      </p>
                      <button onClick={sample} disabled={!doc}>
                        Try a few phrases <ArrowRight size={15} />
                      </button>
                    </div>
                  )}
                  {cards.map((card, index) =>
                    card.kind === "table" ? (
                      <article
                        key={card.id}
                        data-testid="table-card"
                        className={`board-card table-card ${selected === card.id ? "selected" : ""}`}
                        style={{ left: card.x, top: card.y }}
                        onClick={() => selectCard(card.id)}
                      >
                        <div
                          className="card-handle"
                          onPointerDown={(event) => startDrag(event, card)}
                        >
                          <Grip size={14} />
                          <span>PHRASE TABLE {index + 1}</span>
                          <span className="handle-spacer" />
                          <span className="drag-hint">Drag</span>
                        </div>
                        <div className="table-title">
                          <Table2 size={18} />
                          {teacher ? (
                            <input
                              aria-label="Table title"
                              value={card.chinese}
                              maxLength={100}
                              onChange={(event) =>
                                doc &&
                                patchCard(doc, card.id, {
                                  chinese: event.target.value,
                                })
                              }
                              onClick={(event) => event.stopPropagation()}
                            />
                          ) : (
                            <strong>{card.chinese}</strong>
                          )}
                        </div>
                        <table className="phrase-table">
                          <thead>
                            <tr>
                              <th>{teacher ? "中文" : "Jyutping"}</th>
                              {!englishHidden(card, teacher) && (
                                <th>English</th>
                              )}
                              <th>Notes</th>
                              <th className="row-controls" />
                            </tr>
                          </thead>
                          <tbody>
                            {card.rows.map((row) => (
                              <tr
                                key={row.id}
                                className={
                                  selectedRow === row.id && selected === card.id
                                    ? "row-selected"
                                    : ""
                                }
                                onClick={(event) => {
                                  event.stopPropagation();
                                  selectCard(card.id, row.id);
                                }}
                              >
                                <td>
                                  {teacher ? (
                                    <input
                                      aria-label="Chinese phrase"
                                      placeholder="寫句中文…"
                                      value={row.chinese}
                                      maxLength={2000}
                                      onChange={(event) =>
                                        changeRowChinese(
                                          card.id,
                                          row,
                                          event.target.value,
                                        )
                                      }
                                      onBlur={() => {
                                        if (doc)
                                          void enrichRow(doc, card.id, row);
                                      }}
                                    />
                                  ) : (
                                    <span className="table-jyutping">
                                      {row.jyutping || "—"}
                                    </span>
                                  )}
                                </td>
                                {!englishHidden(card, teacher) && (
                                  <td>
                                    <input
                                      aria-label="English translation"
                                      placeholder="Translation…"
                                      value={row.definition}
                                      maxLength={4000}
                                      onChange={(event) =>
                                        doc &&
                                        patchTableRow(doc, card.id, row.id, {
                                          definition: event.target.value,
                                          translation: "edited",
                                        })
                                      }
                                    />
                                  </td>
                                )}
                                <td>
                                  <input
                                    aria-label="Row note"
                                    placeholder="Add note…"
                                    value={row.note}
                                    maxLength={4000}
                                    onChange={(event) =>
                                      doc &&
                                      patchTableRow(doc, card.id, row.id, {
                                        note: event.target.value,
                                      })
                                    }
                                  />
                                </td>
                                <td className="row-controls">
                                  <button
                                    title="Delete row"
                                    aria-label="Delete row"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      if (doc)
                                        deleteTableRow(doc, card.id, row.id);
                                      if (selectedRow === row.id)
                                        setSelectedRow(null);
                                    }}
                                  >
                                    <X size={13} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="table-bottom">
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              if (doc)
                                addTableRow(doc, card.id, createTableRow());
                            }}
                          >
                            <Plus size={14} /> Add row
                          </button>
                          <span>
                            {card.rows.length}{" "}
                            {card.rows.length === 1 ? "entry" : "entries"}
                          </span>
                        </div>
                      </article>
                    ) : card.kind === "sticker" ? (
                      <article
                        key={card.id}
                        data-testid="sticker-card"
                        className={`board-card sticker-card ${selected === card.id ? "selected" : ""}`}
                        style={{ left: card.x, top: card.y }}
                        onClick={() => selectCard(card.id)}
                        onPointerDown={(event) => startDrag(event, card)}
                      >
                        <span>{card.sticker}</span>
                      </article>
                    ) : (
                      <article
                        key={card.id}
                        data-testid="phrase-card"
                        tabIndex={0}
                        className={`board-card phrase-card shape-${card.shape} mode-${card.mode} ${card.kind === "note" ? "note-card" : ""} ${selected === card.id ? "selected" : ""}`}
                        style={{ left: card.x, top: card.y }}
                        onClick={() => selectCard(card.id)}
                        onPointerDown={(event) => {
                          if (
                            !(event.target as HTMLElement).closest(
                              ".card-handle",
                            )
                          )
                            startDrag(event, card);
                        }}
                      >
                        <div
                          className="card-handle"
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            startDrag(event, card);
                          }}
                        >
                          <Grip size={14} />
                          <span>
                            {card.kind === "note"
                              ? "NOTE"
                              : card.words.length === 1
                                ? "WORD"
                                : "PHRASE"}
                          </span>
                          <span className="handle-spacer" />
                          {card.kind === "phrase" && (
                            <button
                              aria-label={
                                card.starred ? "Unsave phrase" : "Save phrase"
                              }
                              title={
                                card.starred
                                  ? "Remove from tray"
                                  : "Save to tray"
                              }
                              className={card.starred ? "is-starred" : ""}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (doc)
                                  patchCard(doc, card.id, {
                                    starred: !card.starred,
                                  });
                              }}
                            >
                              <Star
                                size={16}
                                fill={card.starred ? "currentColor" : "none"}
                              />
                            </button>
                          )}
                        </div>
                        {card.kind === "note" ? (
                          <div className="note-text">{card.definition}</div>
                        ) : (
                          <>
                            <h2
                              className={
                                teacher || card.mode === "characters"
                                  ? "card-chinese"
                                  : "card-jyutping"
                              }
                            >
                              {card.mode === "characters"
                                ? card.chinese ||
                                  card.jyutping ||
                                  card.definition
                                : teacher
                                  ? card.chinese ||
                                    card.jyutping ||
                                    card.definition ||
                                    "Write Chinese…"
                                  : card.jyutping ||
                                    (englishHidden(card, teacher)
                                      ? "Add Jyutping…"
                                      : card.definition ||
                                        card.chinese ||
                                        "Add Jyutping…")}
                            </h2>
                            {!englishHidden(card, teacher) &&
                              !["peek", "characters"].includes(card.mode) &&
                              Boolean(card.chinese || card.jyutping) &&
                              Boolean(card.definition) && (
                                <p className="card-english">
                                  {card.definition}
                                </p>
                              )}
                            {["peek", "characters"].includes(card.mode) &&
                              !englishHidden(card, teacher) && (
                                <div
                                  className="hover-translation"
                                  role="tooltip"
                                >
                                  {card.mode === "characters" && (
                                    <strong>{card.jyutping}</strong>
                                  )}
                                  {card.definition ||
                                    "Add a meaning in the details panel."}
                                </div>
                              )}
                            {card.mode === "practice" && !teacher && (
                              <div className="practice-mask">
                                <EyeOff size={13} /> Meaning hidden by Natasha
                              </div>
                            )}
                            {(card.mode === "breakdown" ||
                              expandedCards.has(card.id)) &&
                              card.words.length > 0 && (
                                <div className="card-word-chips">
                                  {card.words.map((word, wordIndex) => (
                                    <span
                                      key={`${word.chinese}-${wordIndex}`}
                                      className={`state-${word.state ?? "new"}`}
                                      title={`${word.state ?? "new"} vocabulary`}
                                    >
                                      {teacher
                                        ? word.chinese
                                        : word.jyutping || word.chinese}
                                    </span>
                                  ))}
                                </div>
                              )}
                            {(card.mode === "full" ||
                              expandedCards.has(card.id)) &&
                              Boolean(card.note) && (
                                <p className="card-note">{card.note}</p>
                              )}
                            {expandedCards.has(card.id) &&
                              !teacher &&
                              card.chinese && (
                                <p className="card-secondary">{card.chinese}</p>
                              )}
                            <div className="card-footer">
                              <span>
                                {card.mode === "breakdown"
                                  ? "Vocabulary"
                                  : card.mode === "practice"
                                    ? "Practice"
                                    : card.mode === "compact"
                                      ? "Compact"
                                      : ""}
                              </span>
                              {card.audio && (
                                <button
                                  aria-label="Play Natasha recording"
                                  title="Play Natasha recording"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void new Audio(card.audio)
                                      .play()
                                      .catch(() =>
                                        notify("Could not play recording."),
                                      );
                                  }}
                                >
                                  <Volume2 size={16} />
                                </button>
                              )}
                              <button
                                aria-label={
                                  expandedCards.has(card.id)
                                    ? "Collapse card"
                                    : "Expand card"
                                }
                                title={
                                  expandedCards.has(card.id)
                                    ? "Collapse card"
                                    : "Show more"
                                }
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setExpandedCards((current) => {
                                    const next = new Set(current);
                                    if (next.has(card.id)) next.delete(card.id);
                                    else next.add(card.id);
                                    return next;
                                  });
                                }}
                              >
                                <Expand size={14} />
                              </button>
                            </div>
                          </>
                        )}
                      </article>
                    ),
                  )}
                  {peers
                    .filter(
                      (peer) =>
                        typeof peer.x === "number" &&
                        typeof peer.y === "number",
                    )
                    .map((peer) => (
                      <div
                        className={`remote-cursor ${peer.role} ${highlightedPeer === peer.id ? "highlighted" : ""}`}
                        style={{ left: peer.x, top: peer.y }}
                        key={peer.id}
                      >
                        <strong aria-hidden="true">
                          {peer.role === "teacher" ? "🐻" : "🦝"}
                        </strong>
                        <span>
                          {peer.role === "teacher" ? "Natasha" : "Leif"}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
            <div className="canvas-bottom">
              <div className="zoom-tools">
                <button
                  aria-label="Zoom out"
                  title="Zoom out"
                  onClick={() => zoomBy(-0.1)}
                >
                  <Minus size={15} />
                </button>
                <span>{Math.round(zoom * 100)}%</span>
                <button
                  aria-label="Zoom in"
                  title="Zoom in"
                  onClick={() => zoomBy(0.1)}
                >
                  <Plus size={15} />
                </button>
                <small>Pinch or ⌥ scroll to zoom</small>
              </div>
              <div className="save-state">
                <Check size={13} />
                {saved}
              </div>
            </div>
            {peers.some((peer) => peer.signal || peer.draft) && (
              <div className="live-strip">
                {peers.map((peer) => (
                  <span key={peer.id}>
                    {peer.signal
                      ? `${peer.role === "teacher" ? "Natasha" : "Leif"}: ${peer.signal}`
                      : peer.draft
                        ? `${peer.role === "teacher" ? "Natasha" : "Leif"} is writing: ${teacher ? peer.draft : analyzeLocal(peer.draft).jyutping}`
                        : ""}
                  </span>
                ))}
              </div>
            )}
            <form
              className="composer"
              onSubmit={(event) => {
                event.preventDefault();
                addPhrase();
              }}
            >
              <div className="composer-label">
                <label className="input-language">
                  Write in{" "}
                  <select
                    aria-label="Input language"
                    value={sourceLanguage}
                    onChange={(event) =>
                      setSourceLanguage(event.target.value as SourceLanguage)
                    }
                  >
                    <option value="chinese">中文 · Chinese</option>
                    <option value="jyutping">Jyutping</option>
                    <option value="english">English</option>
                  </select>
                </label>
                <button type="button" onClick={() => signal("Say that again?")}>
                  ↻ Say that again
                </button>
              </div>
              <div className="composer-entry">
                <textarea
                  aria-label="Cantonese phrase"
                  placeholder={
                    sourceLanguage === "chinese"
                      ? "我想食呢個。"
                      : sourceLanguage === "jyutping"
                        ? "ngo5 soeng2 sik6…"
                        : "What would you like to say?"
                  }
                  value={input}
                  maxLength={2000}
                  onChange={(event) => {
                    setInput(event.target.value);
                    lesson.presence({ draft: event.target.value });
                  }}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      !event.shiftKey &&
                      !event.nativeEvent.isComposing
                    ) {
                      event.preventDefault();
                      addPhrase();
                    }
                  }}
                />
                <button
                  className="primary"
                  type="submit"
                  disabled={!input.trim() || !doc}
                >
                  <Plus size={17} /> Add phrase
                </button>
              </div>
            </form>
          </section>
          {effectiveRightOpen && (
            <aside className="inspector">
              {selectedStroke ? (
                <div className="inspector-block">
                  <div className="inspector-heading">
                    <h2>Drawing</h2>
                    <button aria-label="Close details" onClick={clearSelection}>
                      <X size={17} />
                    </button>
                  </div>
                  <p className="small-copy">
                    Press Delete to remove this stroke.
                  </p>
                  <button className="delete-action" onClick={removeSelected}>
                    <Trash2 size={14} /> Delete drawing
                  </button>
                </div>
              ) : active ? (
                <div className="inspector-block">
                  <div className="inspector-heading">
                    <h2>
                      {active.kind === "table"
                        ? "Table"
                        : active.kind === "note"
                          ? "Note"
                          : "Phrase"}
                    </h2>
                    <button aria-label="Close details" onClick={clearSelection}>
                      <X size={17} />
                    </button>
                  </div>
                  {active.kind === "table" ? (
                    <>
                      <p className="small-copy">
                        Dense phrases for a live lesson. Select a row to edit
                        its parts.
                      </p>
                      <label>
                        Table title
                        <input
                          aria-label="Table title in details"
                          value={active.chinese}
                          maxLength={100}
                          onChange={(event) =>
                            doc &&
                            patchCard(doc, active.id, {
                              chinese: event.target.value,
                            })
                          }
                        />
                      </label>
                      {teacher && (
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={active.hideEnglishForLearner}
                            onChange={(event) =>
                              doc &&
                              patchCard(doc, active.id, {
                                hideEnglishForLearner: event.target.checked,
                              })
                            }
                          />{" "}
                          Hide English from Leif
                        </label>
                      )}
                      <button
                        className="soft wide"
                        onClick={() =>
                          doc && addTableRow(doc, active.id, createTableRow())
                        }
                      >
                        <Plus size={14} /> Add table row
                      </button>
                      {activeRow && (
                        <div className="row-detail">
                          <h3>Selected row</h3>
                          <p className="detail-primary">
                            {teacher ? activeRow.chinese : activeRow.jyutping}
                          </p>
                          {!hidden && (
                            <label>
                              English translation
                              <textarea
                                value={activeRow.definition}
                                onChange={(event) =>
                                  doc &&
                                  patchTableRow(doc, active.id, activeRow.id, {
                                    definition: event.target.value,
                                    translation: "edited",
                                  })
                                }
                              />
                            </label>
                          )}
                          <label>
                            Note
                            <textarea
                              value={activeRow.note}
                              onChange={(event) =>
                                doc &&
                                patchTableRow(doc, active.id, activeRow.id, {
                                  note: event.target.value,
                                })
                              }
                            />
                          </label>
                          <button
                            className="delete-action"
                            onClick={removeSelected}
                          >
                            <Trash2 size={14} /> Delete row
                          </button>
                        </div>
                      )}
                    </>
                  ) : active.kind === "sticker" ? (
                    <div className="sticker-picker">
                      {STICKERS.map((value) => (
                        <button
                          key={value}
                          aria-label={`Change sticker to ${value}`}
                          onClick={() =>
                            doc && patchCard(doc, active.id, { sticker: value })
                          }
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                  ) : active.kind === "note" ? (
                    <label>
                      Your note
                      <textarea
                        className="note-editor"
                        value={active.definition}
                        maxLength={4000}
                        onChange={(event) =>
                          doc &&
                          patchCard(doc, active.id, {
                            definition: event.target.value,
                          })
                        }
                      />
                    </label>
                  ) : (
                    <>
                      <p className="detail-primary">
                        {teacher
                          ? active.chinese ||
                            active.jyutping ||
                            active.definition
                          : active.jyutping ||
                            (hidden ? "" : active.definition)}
                      </p>
                      {!hidden && (
                        <p className="detail-english">{active.definition}</p>
                      )}
                      <label>
                        {teacher ? "Chinese phrase" : "Chinese source"}
                        <textarea
                          value={active.chinese}
                          maxLength={2000}
                          onChange={(event) =>
                            changeChinese(event.target.value)
                          }
                          onBlur={() => {
                            if (doc && active.chinese)
                              void enrichPhrase(doc, active);
                          }}
                        />
                      </label>
                      {!hidden && (
                        <label>
                          English meaning
                          <textarea
                            value={active.definition}
                            maxLength={4000}
                            onChange={(event) =>
                              doc &&
                              patchCard(doc, active.id, {
                                definition: event.target.value,
                                translation: "edited",
                              })
                            }
                          />
                        </label>
                      )}
                      <label>
                        Jyutping
                        <input
                          value={active.jyutping}
                          maxLength={4000}
                          onChange={(event) =>
                            doc &&
                            patchCard(doc, active.id, {
                              jyutping: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        Card note
                        <textarea
                          aria-label="Card note"
                          value={active.note}
                          maxLength={4000}
                          placeholder="A hint, example, or reminder…"
                          onChange={(event) =>
                            doc &&
                            patchCard(doc, active.id, {
                              note: event.target.value,
                            })
                          }
                        />
                      </label>
                    </>
                  )}
                  {active.kind === "phrase" && teacher && (
                    <div className="appearance">
                      <h3>Card appearance</h3>
                      <p className="small-copy">
                        Natasha can choose what Leif sees.
                      </p>
                      <div className="option-label">Mode</div>
                      <div className="choice-grid">
                        {(
                          [
                            ["full", "Full", "Pronunciation + English"],
                            [
                              "compact",
                              "Compact",
                              "Small pronunciation + meaning",
                            ],
                            ["peek", "Hover", "Only text; hover for meaning"],
                            [
                              "characters",
                              "Characters",
                              "Chinese only; hover for reading",
                            ],
                            ["breakdown", "Vocabulary", "Coloured word pieces"],
                            ["practice", "Practice", "Hide English from Leif"],
                          ] as [CardMode, string, string][]
                        ).map(([mode, label, hint]) => (
                          <button
                            key={mode}
                            className={active.mode === mode ? "chosen" : ""}
                            title={hint}
                            onClick={() =>
                              doc && patchCard(doc, active.id, { mode })
                            }
                          >
                            <strong>{label}</strong>
                            <small>{hint}</small>
                          </button>
                        ))}
                      </div>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={active.hideEnglishForLearner}
                          onChange={(event) =>
                            doc &&
                            patchCard(doc, active.id, {
                              hideEnglishForLearner: event.target.checked,
                            })
                          }
                        />{" "}
                        Hide English from Leif
                      </label>
                      <div className="option-label">Shape</div>
                      <div className="shape-choices">
                        {(
                          [
                            ["rounded", "Rounded"],
                            ["sheet", "Sheet"],
                            ["sticky", "Sticky"],
                          ] as [CardShape, string][]
                        ).map(([shape, label]) => (
                          <button
                            key={shape}
                            className={active.shape === shape ? "chosen" : ""}
                            onClick={() =>
                              doc && patchCard(doc, active.id, { shape })
                            }
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {(active.kind === "phrase" ||
                    (active.kind === "table" && activeRow)) && (
                    <WordBreakdown
                      words={wordList}
                      teacher={teacher}
                      hidden={hidden}
                      onChange={updateWords}
                      onAuto={resetWords}
                    />
                  )}
                  {active.kind === "phrase" && (
                    <>
                      <div className="audio-section">
                        <h3>Natasha’s pronunciation</h3>
                        <AudioRecorder
                          key={active.id}
                          audio={active.audio}
                          onAudio={(audio, audioName) =>
                            doc &&
                            patchCard(doc, active.id, { audio, audioName })
                          }
                          notify={notify}
                        />
                      </div>
                      <button
                        className="send-single"
                        disabled={
                          sending ||
                          !(
                            active.chinese ||
                            active.jyutping ||
                            active.definition
                          )
                        }
                        onClick={() => void sendToQueue([active])}
                      >
                        <Send size={14} /> Send phrase to JyutDeck
                      </button>
                      {active.receipt && (
                        <p className="receipt">{active.receipt}</p>
                      )}
                    </>
                  )}
                  <button
                    className="delete-action"
                    onClick={() => {
                      if (doc) doc.getMap("cards").delete(active.id);
                      clearSelection();
                    }}
                  >
                    <Trash2 size={14} /> Delete {active.kind}
                  </button>
                </div>
              ) : (
                <div className="inspector-intro">
                  <span className="intro-icon">
                    <BookOpen size={22} />
                  </span>
                  <h2>Teach together</h2>
                  <p>
                    Click a card or table row to edit it. Drag from its top
                    edge. Press Delete to remove a selection.
                  </p>
                  <div className="tip">
                    <Star size={16} /> Star useful phrases to keep them in your
                    tray.
                  </div>
                </div>
              )}
              <div className="tray-section">
                <div className="section-head">
                  <h3>
                    <Star size={15} /> Session tray
                  </h3>
                  <span>{stars.length}</span>
                </div>
                <p className="small-copy">Useful phrases for JyutDeck.</p>
                <div className="tray">
                  {stars.length ? (
                    stars.map((card) => (
                      <button
                        key={card.id}
                        className="tray-item"
                        onClick={() => {
                          selectCard(card.id);
                          viewport.current?.scrollTo({
                            left: Math.max(0, card.x * zoom - 40),
                            top: Math.max(0, card.y * zoom - 40),
                            behavior: "smooth",
                          });
                        }}
                      >
                        <Star size={13} fill="currentColor" />
                        <span>
                          <strong>
                            {teacher ? card.chinese : card.jyutping}
                          </strong>
                          {!englishHidden(card, teacher) && (
                            <small>{card.definition}</small>
                          )}
                          {card.receipt && (
                            <small className="receipt">{card.receipt}</small>
                          )}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="tray-empty">
                      Star a phrase to save it here.
                    </div>
                  )}
                </div>
                <button
                  className="primary send-tray"
                  disabled={!stars.length || sending}
                  onClick={() => void sendToQueue(stars)}
                >
                  <Send size={14} />
                  {sending ? "Sending…" : "Send saved to JyutDeck"}
                </button>
              </div>
            </aside>
          )}
        </div>
      </main>
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {settings && (
        <Settings
          close={() => setSettings(false)}
          notify={notify}
          online={online}
          setOnline={(value) => {
            setOnline(value);
            preference("online", String(value));
          }}
        />
      )}
      {sharing && (
        <div className="overlay" onClick={() => setSharing(false)}>
          <section
            className="modal share-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Share lesson"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="section-head">
              <h2>A desk for two</h2>
              <button
                aria-label="Close sharing"
                onClick={() => setSharing(false)}
              >
                <X size={18} />
              </button>
            </div>
            <p>
              Each person chooses their own view. Cards, tables, drawings, saved
              phrases, and recordings stay together.
            </p>
            <div className="share-step">
              <span>01</span>
              <div>
                <h3>Invite Natasha or Leif</h3>
                <p>
                  Choose Internet lesson for different Wi-Fi networks. Send the
                  private invitation and keep the host app open. Your partner
                  pastes it below and joins.
                </p>
              </div>
            </div>
            <button
              className="primary internet-share"
              disabled={sharingBusy || !window.desktop}
              onClick={() => void hostRemote()}
            >
              <Globe size={16} />
              {sharingBusy ? "Connecting…" : "Start internet lesson"}
            </button>
            <p className="small-copy">
              No account or network setup. This beta uses a temporary Cloudflare
              connection; start a new invitation if the host app restarts.
            </p>
            <label>
              Relay address (optional)
              <input
                value={relay}
                onChange={(event) => setRelay(event.target.value)}
                placeholder="wss://your-relay.example.com"
              />
            </label>
            <button
              className="primary"
              disabled={sharingBusy}
              onClick={() => void host()}
            >
              <Radio size={16} />
              {sharingBusy ? "Starting…" : "Create invitation"}
            </button>
            {invite && (
              <div className="invite-box">
                <label>
                  Private invitation
                  <input readOnly value={invite} />
                </label>
                <button
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(invite)
                      .then(() =>
                        notify(
                          "Invitation copied. Send it to your lesson partner.",
                        ),
                      )
                      .catch(() =>
                        notify("Select and copy the invitation above."),
                      )
                  }
                >
                  <Copy size={15} /> Copy invitation
                </button>
              </div>
            )}
            <small>
              Anyone with the invitation can edit the room. Local ws:// traffic
              is unencrypted; use a trusted network or WSS/VPN. The relay
              operator can read room contents.
            </small>
            <hr />
            <div className="share-step">
              <span>02</span>
              <div>
                <h3>Join an existing lesson</h3>
                <p>Paste the invitation from your partner.</p>
              </div>
            </div>
            <label>
              Lesson invitation
              <textarea
                value={join}
                onChange={(event) => setJoin(event.target.value)}
                placeholder="jyutboard://join#…"
              />
            </label>
            <div className="row spread">
              <button
                onClick={() => {
                  updateSession({ ...session, relay: undefined });
                  setSharing(false);
                  notify("Disconnected. Your local lesson is saved.");
                }}
              >
                Disconnect
              </button>
              <button
                className="primary"
                disabled={!join.trim()}
                onClick={joinRoom}
              >
                Join lesson <ArrowRight size={16} />
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
