import { InlineLanguage } from "./InlineLanguage";
import { CardBorder } from "./CardBorder";
import { phraseInput, inputLanguage } from "./phraseInput";
import { ZoomMotion } from "./ZoomMotion";
import { canvasBoundary } from "./canvasBoundary";
import { lassoHitsBox, lassoHitsStroke } from "./lasso";
import { inkOutline } from "./ink";
import { TabletGestures } from "./TabletGestures";
import { copyInvitation } from "./clipboard";
import { webInvitation, storedPair } from "./webRuntime";
import {
  dueJyutDeckOutboxItems,
  ensureJyutDeckOutboxItem,
  jyutDeckOutboxKey,
  removeJyutDeckOutboxItem,
  retryJyutDeckOutboxItem,
} from "./jyutdeckOutbox";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import * as Y from "yjs";
import {
  ArrowRight,
  MessageCircle,
  Zap,
  ArrowUpRight,
  BookOpen,
  Check,
  Copy,
  Download,
  Grip,
  Eraser,
  Link2,
  CopyPlus,
  Scaling,
  Globe,
  Highlighter,
  LocateFixed,
  Minus,
  MousePointer2,
  Lasso,
  PanelLeft,
  PanelRight,
  Pencil,
  Plus,
  Radio,
  Redo2,
  Settings as SettingsIcon,
  Star,
  StickyNote,
  Table2,
  Trash2,
  Undo2,
  Upload,
  Users,
  Volume2,
  Hand,
  Eye,
  EyeOff,
  X,
} from "lucide-react";
import {
  addCard,
  addTableRow,
  cardSchema,
  strokeSchema,
  connectorSchema,
  type Connector,
  createCard,
  conversationPhrase,
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
import { CanvasTable } from "./CanvasTable";
import { Conversation } from "./Conversation";
import { PersonAvatar } from "./PersonAvatar";
import { PushToTalk } from "./PushToTalk";
import {
  VocabularyPhrase,
  vocabularyState,
  type VocabularySnapshot,
  type HighlightMode,
} from "./VocabularyPhrase";
import { Settings } from "./Settings";
import { UpdateControls } from "./UpdateControls";
import { StickerArt, StickerLibrary } from "./Stickers";
import { DrawingLayer } from "./DrawingLayer";
import { DrawingControls } from "./DrawingControls";
import {
  intersects,
  pointsBox,
  connectorPoints,
  nearStroke,
  type Box,
} from "./canvasGeometry";
import { WordBreakdown } from "./WordBreakdown";

type Tool =
  | "laser"
  | "erase"
  | "pan"
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
const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
const successfulQueueReceipt = (value = "") =>
  /^(created|existing|duplicate|saved)(?::|$)/i.test(value);
const isBrowserOnline = () =>
  typeof navigator === "undefined" || isBrowserOnline();
function syncLabel(item: Pick<Card, "syncState" | "syncMessage" | "receipt">) {
  if (item.syncMessage) return item.syncMessage;
  if (item.syncState === "syncing") return "Syncing…";
  if (item.syncState === "waiting") return "Waiting for internet";
  if (item.syncState === "saved") return "Saved to JyutDeck";
  if (item.syncState === "error") return "Needs attention";
  if (item.syncState === "pending") return "Saved · syncing soon";
  if (successfulQueueReceipt(item.receipt)) return "Saved to JyutDeck";
  return item.receipt || "Saved locally";
}
function initialSession() {
  if (window.desktop?.web && location.hash.includes("room=")) {
    try {
      const parsed = parseInvite(`jyutboard://join${location.hash}`);
      if (location.protocol === "https:" && parsed.relay.startsWith("ws:"))
        throw Error("Use an Internet lesson for iPad.");
      const joined = {
        id: parsed.room,
        relay: parsed.relay,
        title: "Our shared teaching room",
        created: Date.now(),
      };
      remember(joined);
      void window.desktop.pair({
        action: "remember",
        room: parsed.room,
        relay: parsed.relay,
        host: false,
      });
      window.history.replaceState(null, "", location.pathname);
      return joined;
    } catch {
      /* Show invitation entry below. */
    }
  }
  const previous = sessions()[0];
  if (previous) return previous;
  const installedPair = window.desktop?.web ? storedPair() : null;
  if (installedPair?.room) {
    const joined = {
      id: installedPair.room,
      relay: installedPair.relay,
      title: "Our shared teaching room",
      created: Date.now(),
    };
    remember(joined);
    return joined;
  }
  const first = {
    id: newRoom(),
    title: "Our first Cantonese lesson",
    created: Date.now(),
  };
  remember(first);
  return first;
}
function englishHidden(card: Card, teacher: boolean) {
  return card.mode === "practice";
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
    loadPreference(
      "leftOpen",
      matchMedia("(pointer: coarse)").matches ? "false" : "true",
    ) === "true",
  );
  const [rightOpen, setRightOpen] = useState(false);
  const [creatingPhrase, setCreatingPhrase] = useState(false);
  const creatingRef = useRef(false);
  const tablet = matchMedia("(pointer: coarse)").matches;
  const lesson = useLesson(session, role);
  const { doc, cards, strokes, connectors, peers, status, saved } = lesson;
  const currentDocument = useRef(doc);
  currentDocument.current = doc;
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [inkColor, setInkColor] = useState("#3159e8");
  const [inkWidth, setInkWidth] = useState(3);
  const [highlightColor, setHighlightColor] = useState("#e4aa3d");
  const [highlightWidth, setHighlightWidth] = useState(20);
  const [selectionRect, setSelectionRect] = useState<Box | null>(null);
  const lasso = useRef<{
    points: [number, number][];
    candidate?: string;
  } | null>(null);
  const [lassoPath, setLassoPath] = useState<[number, number][]>([]);
  const lassoLine = useRef<SVGPolylineElement>(null);
  const [cardSizes, setCardSizes] = useState<
    Record<string, { width: number; height: number }>
  >({});
  const cardElements = useRef(new Map<string, HTMLElement>());
  const marquee = useRef<{ start: [number, number]; base: Set<string> } | null>(
    null,
  );
  const resizing = useRef<{
    card: Card;
    start: [number, number];
    width: number;
    height: number;
  } | null>(null);
  const erasing = useRef(false);
  const lastInkPresence = useRef(0);
  const gestureMoved = useRef(false);
  const [highlightMode, setHighlightMode] = useState<HighlightMode>(
    ["off", "hover"].includes(loadPreference("vocabularyHighlight", "off"))
      ? "off"
      : "always",
  );
  const [vocabulary, setVocabulary] = useState<VocabularySnapshot>();
  const [vocabularyMessage, setVocabularyMessage] = useState(
    "Not connected to JyutDeck yet",
  );
  const [now, setNow] = useState(Date.now());
  const [welcomeClosed, setWelcomeClosed] = useState(false);
  const [editingCard, setEditingCard] = useState<string | null>(null);
  const [paired, setPaired] = useState<{
    room?: string;
    host?: boolean;
  } | null>(null);
  const [tableVariant, setTableVariant] =
    useState<Card["tableVariant"]>("phrases");
  const connectorDrag = useRef<{
    from: string;
    point: [number, number];
  } | null>(null);
  const [connectorPreview, setConnectorPreview] = useState<{
    from: string;
    point: [number, number];
  } | null>(null);
  const laser = useRef<[number, number][] | null>(null);
  const [localLaser, setLocalLaser] = useState<{
    points: [number, number][];
    at: number;
  } | null>(null);
  const [selectedStroke, setSelectedStroke] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [settings, setSettings] = useState(false);
  const [sharing, setSharing] = useState(
    Boolean(window.desktop?.web && !sessions()[0]?.relay),
  );
  const [invite, setInvite] = useState("");
  const [relay, setRelay] = useState(loadPreference("relay", ""));
  const [join, setJoin] = useState("");
  const [sharingBusy, setSharingBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [tool, setTool] = useState<Tool>("select");
  const [stickerLibraryOpen, setStickerLibraryOpen] = useState(false);
  const [sticker, setSticker] = useState("noodles");
  const [sourceLanguage, setSourceLanguage] =
    useState<SourceLanguage>("chinese");
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
  const [renaming, setRenaming] = useState(false);
  const board = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const tabletGestures = useRef<TabletGestures | null>(null);
  const tabletTap = useRef<{
    pointer: number;
    id?: string;
    target: HTMLElement;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const lastTabletTap = useRef<{
    id: string;
    x: number;
    y: number;
    time: number;
  } | null>(null);
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const navigationRef = useRef({ stopFollowing, publishView, selectedItems });
  navigationRef.current = { stopFollowing, publishView, selectedItems };
  const canvasMargin = useRef({ x: 0, y: 0 });
  const canvasLayout = useRef({ zoom: 0, width: 0, height: 0 });
  const zoomLabel = useRef<HTMLSpanElement>(null);
  const zoomMotion = useRef<ZoomMotion | null>(null);
  const cameraTransient = useRef(false);
  const cameraScroll = useRef({ x: 0, y: 0 });
  const cameraRest = useRef({ x: 0, y: 0 });
  function layoutCanvas(scale: number) {
    const node = viewport.current,
      canvas = board.current;
    if (!node || !canvas) return;
    const width = node.clientWidth,
      height = node.clientHeight;
    const previous = canvasLayout.current;
    if (
      previous.zoom === scale &&
      previous.width === width &&
      previous.height === height
    )
      return;
    canvasLayout.current = { zoom: scale, width, height };
    const x = node.scrollLeft - canvasMargin.current.x,
      y = node.scrollTop - canvasMargin.current.y;
    const bounds = canvasBoundary(
      BOARD_WIDTH,
      BOARD_HEIGHT,
      node.clientWidth,
      node.clientHeight,
      scale,
      !tablet,
    );
    canvasMargin.current = {
      x: bounds.limitX - bounds.minX,
      y: bounds.limitY - bounds.minY,
    };
    const space = canvas.parentElement!;
    space.style.width = `${width + bounds.maxX - bounds.minX + bounds.limitX * 2}px`;
    space.style.height = `${height + bounds.maxY - bounds.minY + bounds.limitY * 2}px`;
    canvas.style.left = `${canvasMargin.current.x}px`;
    canvas.style.top = `${canvasMargin.current.y}px`;
    node.scrollLeft = x + canvasMargin.current.x;
    node.scrollTop = y + canvasMargin.current.y;
  }
  const camera = useRef<{ x: number; y: number; zoom: number } | null>(null);
  const cameraFrame = useRef(0);
  const cameraCommit = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  function flushCamera(commit = false) {
    cancelAnimationFrame(cameraFrame.current);
    cameraFrame.current = 0;
    const view = camera.current,
      node = viewport.current,
      canvas = board.current;
    if (!view || !node || !canvas) return;
    if (commit) {
      // Reconcile scroll geometry only after navigation pauses. During movement
      // the clipped viewport uses a compositor transform, avoiding per-frame layout.
      cameraTransient.current = false;
      layoutCanvas(view.zoom);
      canvas.style.transform = `scale(${view.zoom})`;
      canvas.style.willChange = "";
      node.scrollLeft = view.x + canvasMargin.current.x;
      node.scrollTop = view.y + canvasMargin.current.y;
      // WebKit rounds native scroll positions. Keep the fractional remainder
      // in the transform so settling never nudges the artwork by a pixel.
      cameraRest.current = {
        x: node.scrollLeft - canvasMargin.current.x - view.x,
        y: node.scrollTop - canvasMargin.current.y - view.y,
      };
      canvas.style.transform = `translate3d(${cameraRest.current.x}px, ${cameraRest.current.y}px, 0) scale(${view.zoom})`;
      camera.current = null;
      setZoom(view.zoom);
    } else {
      cameraScroll.current = { x: node.scrollLeft, y: node.scrollTop };
      const dx = cameraScroll.current.x - canvasMargin.current.x - view.x;
      const dy = cameraScroll.current.y - canvasMargin.current.y - view.y;
      canvas.style.willChange = "transform";
      canvas.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(${view.zoom})`;
      cameraTransient.current = true;
    }
    zoomRef.current = view.zoom;
    if (zoomLabel.current) {
      const label = `${Math.round(view.zoom * 100)}%`;
      if (zoomLabel.current.textContent !== label)
        zoomLabel.current.textContent = label;
    }
    // Publish the logical view, never force a layout read after writing the transform.
    navigationRef.current.publishView();
  }
  function readCamera() {
    const node = viewport.current!;
    return (
      camera.current ?? {
        x: node.scrollLeft - canvasMargin.current.x - cameraRest.current.x,
        y: node.scrollTop - canvasMargin.current.y - cameraRest.current.y,
        zoom: zoomRef.current,
      }
    );
  }
  function commitCameraWhenIdle() {
    // A slow frame or a held pinch is still an active gesture. Never resize
    // the scroll surface just because no new sample arrived for 180ms.
    if (
      tabletGestures.current?.motionActive ||
      zoomMotion.current?.motionActive
    ) {
      cameraCommit.current = setTimeout(commitCameraWhenIdle, 60);
      return;
    }
    flushCamera(true);
  }
  function queueCamera(
    view: { x: number; y: number; zoom: number },
    inFrame = false,
  ) {
    const node = viewport.current!;
    const b = canvasBoundary(
      BOARD_WIDTH,
      BOARD_HEIGHT,
      node.clientWidth,
      node.clientHeight,
      view.zoom,
      !tablet,
    );
    camera.current = {
      ...view,
      x: clamp(view.x, b.minX - b.limitX, b.maxX + b.limitX),
      y: clamp(view.y, b.minY - b.limitY, b.maxY + b.limitY),
    };
    // Coalesce input into one paint; never split scale and position between frames.
    if (inFrame) flushCamera();
    else if (!cameraFrame.current)
      cameraFrame.current = requestAnimationFrame(() => {
        cameraFrame.current = 0;
        flushCamera();
      });
    clearTimeout(cameraCommit.current);
    cameraCommit.current = setTimeout(commitCameraWhenIdle, 180);
  }
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    tabletGestures.current = new TabletGestures(
      node,
      readCamera,
      (view, inFrame) => {
        navigationRef.current.stopFollowing();
        queueCamera(view, inFrame);
      },
      () => toolRef.current,
      (event) => {
        const target = event.target as Element;
        const id =
          target.closest<HTMLElement>("[data-card-id]")?.dataset.cardId ||
          target.closest<SVGElement>("[data-stroke-id]")?.dataset.strokeId;
        return Boolean(
          id &&
          (event.pointerType === "touch" ||
            navigationRef.current.selectedItems.has(id)) &&
          !["laser", "erase"].includes(toolRef.current),
        );
      },
      undefined,
      (scale) =>
        canvasBoundary(
          BOARD_WIDTH,
          BOARD_HEIGHT,
          node.clientWidth,
          node.clientHeight,
          scale,
          !tablet,
        ),
    );
    const releasePen = (event: globalThis.PointerEvent) =>
      tabletGestures.current?.releasePen(event);
    const stopCoast = (event: globalThis.PointerEvent) => {
      if (
        (event.pointerType === "touch" || event.pointerType === "pen") &&
        !node.contains(event.target as Node)
      )
        tabletGestures.current?.settle();
    };
    window.addEventListener("pointerdown", stopCoast, true);
    window.addEventListener("pointerup", releasePen);
    window.addEventListener("pointercancel", releasePen);
    return () => {
      window.removeEventListener("pointerdown", stopCoast, true);
      window.removeEventListener("pointerup", releasePen);
      window.removeEventListener("pointercancel", releasePen);
      cancelAnimationFrame(cameraFrame.current);
      clearTimeout(cameraCommit.current);
      tabletGestures.current?.dispose();
      tabletGestures.current = null;
    };
  }, []);
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const layout = () => {
      if (camera.current) flushCamera(true);
      else layoutCanvas(zoomRef.current);
      const bounds = node.getBoundingClientRect();
      const column = node.closest(".canvas-column")?.getBoundingClientRect();
      document.documentElement.style.setProperty(
        "--canvas-content-top",
        `${bounds.top - (column?.top ?? 0)}px`,
      );
      document.documentElement.style.setProperty(
        "--details-top",
        `${bounds.top}px`,
      );
      document.documentElement.style.setProperty(
        "--details-bottom",
        `${Math.max(0, innerHeight - bounds.bottom)}px`,
      );
    };
    const observer = new ResizeObserver(layout);
    observer.observe(node);
    layout();
    window.addEventListener("resize", layout);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", layout);
    };
  }, []);
  const importInput = useRef<HTMLInputElement>(null);
  const drag = useRef<{
    start: [number, number];
    cards: Card[];
    strokes: Stroke[];
    move?: [number, number];
    editTarget?: HTMLElement;
  } | null>(null);
  const dragFrame = useRef(0);
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
  const translationSequence = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const flushingOutbox = useRef(false);
  const active = cards.find((card) => card.id === selected);
  const activeRow = active?.rows.find((row) => row.id === selectedRow);
  const teacher = role === "teacher";
  useEffect(() => {
    if (tablet) setSourceLanguage(role === "teacher" ? "chinese" : "jyutping");
  }, [role, tablet]);
  const starTargets = cards.flatMap((card) =>
    card.kind === "conversation"
      ? card.rows
          .filter((row) => row.starred)
          .map((row) => ({ card: conversationPhrase(card, row), parentId: card.id }))
      : card.starred && card.kind === "phrase"
        ? [{ card, parentId: undefined as string | undefined }]
        : [],
  );
  const stars = starTargets.map(({ card }) => card);
  const hidden = !teacher && (activeRow?.mode ?? active?.mode) === "practice";
  const effectiveRightOpen = rightOpen;

  useLayoutEffect(() => {
    const next: Record<string, { width: number; height: number }> = {};
    for (const [id, node] of cardElements.current)
      next[id] = { width: node.offsetWidth, height: node.offsetHeight };
    setCardSizes((previous) =>
      Object.keys(next).length !== Object.keys(previous).length ||
      Object.entries(next).some(
        ([id, size]) =>
          size.width !== previous[id]?.width ||
          size.height !== previous[id]?.height,
      )
        ? next
        : previous,
    );
  }, [cards, role, selectedItems]);
  useEffect(() => {
    const valid = new Set(
      [...cards, ...strokes, ...connectors].map((item) => item.id),
    );
    setSelectedItems((previous) => {
      const next = new Set([...previous].filter((id) => valid.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [cards, strokes, connectors]);
  useEffect(() => {
    if (selectedItems.size === 1) {
      const id = [...selectedItems][0];
      setSelected(cards.some((card) => card.id === id) ? id : null);
      setSelectedStroke(strokes.some((stroke) => stroke.id === id) ? id : null);
    } else {
      setSelected(null);
      setSelectedStroke(null);
      setSelectedRow(null);
    }
  }, [selectedItems]);
  function notify(message: string) {
    setNotice(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setNotice(""), 6500);
  }
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  useEffect(() => {
    if (!doc) return;
    for (const { card, parentId } of starTargets) {
      const key = jyutDeckOutboxKey(session.id, card.id);
      if (card.syncState === "saved" || successfulQueueReceipt(card.receipt)) {
        removeJyutDeckOutboxItem(key);
        if (card.syncState !== "saved")
          patchJyutDeckSync(card.id, parentId, {
            syncState: "saved",
            syncMessage: "Saved to JyutDeck",
          });
        continue;
      }
      // Older lessons can contain stars from before automatic syncing existed.
      // Do not silently submit those until somebody explicitly saves them again.
      if (!card.savedBy && !card.syncState) continue;
      if (
        !card.chinese.trim() &&
        !(card.sourceLanguage === "jyutping"
          ? card.jyutping.trim()
          : card.definition.trim())
      ) {
        patchJyutDeckSync(card.id, parentId, {
          syncState: "error",
          syncMessage: "Complete the phrase before saving",
        });
        continue;
      }
      const request = queuePayload([card], session).requests[0] as Record<
        string,
        unknown
      >;
      ensureJyutDeckOutboxItem({
        key,
        sessionId: session.id,
        cardId: card.id,
        parentId,
        request,
      });
      if (!isBrowserOnline() && card.syncState !== "waiting")
        patchJyutDeckSync(card.id, parentId, {
          syncState: "waiting",
          syncMessage: "Waiting for internet",
        });
      else if (!card.syncState)
        patchJyutDeckSync(card.id, parentId, {
          syncState: "pending",
          syncMessage: "Saved · syncing soon",
        });
    }
    if (isBrowserOnline()) void flushJyutDeckOutbox();
  }, [doc, session.id, session.title, cards]);

  useEffect(() => {
    if (!doc) return;
    const retry = () => {
      if (document.visibilityState === "visible" && isBrowserOnline())
        void flushJyutDeckOutbox();
    };
    const timer = setInterval(retry, 5000);
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", retry);
    retry();
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", retry);
    };
  }, [doc, session.id, paired?.room]);

  useEffect(() => {
    preference("role", role);
    lesson.presence({ role });
  }, [role]);
  useEffect(() => {
    preference("leftOpen", String(leftOpen));
  }, [leftOpen]);
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
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    void window.desktop?.pair({ action: "get" }).then(setPaired);
  }, []);
  useEffect(() => {
    if (!doc) return;
    const refresh = () => {
      const snapshot = doc
        .getMap<VocabularySnapshot>("vocabulary")
        .get("snapshot");
      if (snapshot?.known && snapshot?.queued) setVocabulary(snapshot);
    };
    doc.getMap("vocabulary").observe(refresh);
    refresh();
    return () => doc.getMap("vocabulary").unobserve(refresh);
  }, [doc]);
  useEffect(() => {
    if (!doc || !window.desktop) return;
    let active = true;
    async function refresh() {
      try {
        const snapshot = await window.desktop!.vocabulary();
        if (active) {
          doc!.transact(
            () =>
              doc!
                .getMap<VocabularySnapshot>("vocabulary")
                .set("snapshot", snapshot),
            "vocabulary",
          );
          setVocabularyMessage(
            `Connected · ${snapshot.known.length} known forms · ${snapshot.queued.length} queued`,
          );
        }
      } catch {
        if (active)
          setVocabularyMessage(
            "JyutDeck unavailable · cached states shown when available",
          );
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 60000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [doc, settings, paired?.room]);
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const onScroll = () => {
      if (cameraTransient.current && camera.current) {
        camera.current.x += node.scrollLeft - cameraScroll.current.x;
        camera.current.y += node.scrollTop - cameraScroll.current.y;
        cameraScroll.current = { x: node.scrollLeft, y: node.scrollTop };
      }
      publishView();
    };
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
    const target = {
      zoom: peer.view.zoom,
      x: peer.view.x * peer.view.zoom - node.clientWidth / 2,
      y: peer.view.y * peer.view.zoom - node.clientHeight / 2,
    };
    const current = readCamera();
    if (
      Math.abs(current.zoom - target.zoom) < 0.0001 &&
      Math.abs(current.x - target.x) < 1 &&
      Math.abs(current.y - target.y) < 1
    )
      return;
    queueCamera(target);
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
    }
  }, [peers]);
  useEffect(() => {
    if (selected && !cards.some((card) => card.id === selected)) {
      setSelected(null);
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
    const motion = new ZoomMotion(readCamera, queueCamera, () =>
      tabletGestures.current?.deferSettle(),
    );
    zoomMotion.current = motion;
    const stopZoom = () => motion.stop();
    window.addEventListener("pointerdown", stopZoom, true);
    function wheel(event: WheelEvent) {
      if (!node) return;
      if (!(event.ctrlKey || event.metaKey || event.altKey)) {
        motion.stop();
        if ((event.target as Element).closest("textarea,input,select")) return;
        event.preventDefault();
        const unit =
          event.deltaMode === 1
            ? 16
            : event.deltaMode === 2
              ? node.clientHeight
              : 1;
        tabletGestures.current?.panWheel(
          event.deltaX * unit,
          event.deltaY * unit,
        );
        return;
      }
      event.preventDefault();
      const bounds = node.getBoundingClientRect();
      const cursorX = event.clientX - bounds.left;
      const cursorY = event.clientY - bounds.top;
      tabletGestures.current?.stop();
      navigationRef.current.stopFollowing();
      const view = readCamera();
      const unit =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? node.clientHeight
            : 1;
      motion.wheel(event.deltaY * unit, cursorX, cursorY);
    }
    node.addEventListener("wheel", wheel, { passive: false });
    return () => {
      motion.stop();
      zoomMotion.current = null;
      window.removeEventListener("pointerdown", stopZoom, true);
      node.removeEventListener("wheel", wheel);
    };
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
      const editing = (event.target as HTMLElement | null)?.closest(
        'input, textarea, [contenteditable="true"]',
      );
      if (!editing && !settings && !sharing && event.key === "Escape") {
        clearSelection();
        setTool("select");
        return;
      }
      if (
        !editing &&
        !settings &&
        !sharing &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "a"
      ) {
        event.preventDefault();
        setSelectedItems(
          new Set([...cards, ...strokes, ...connectors].map((item) => item.id)),
        );

        return;
      }
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (settings || sharing || !doc) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"]')) return;
      if (selectedItems.size || selectedStroke || selected) {
        removeSelected();
        event.preventDefault();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    doc,
    selected,
    selectedRow,
    selectedStroke,
    selectedItems,
    settings,
    sharing,
    cards,
    strokes,
    connectors,
  ]);

  function selectCard(
    cardId: string,
    rowId: string | null = null,
    additive = false,
    preserveGroup = false,
  ) {
    if (connectFrom) {
      if (connectFrom !== cardId) addConnector(connectFrom, cardId);
      setConnectFrom(null);
      return;
    }
    let next = new Set<string>([cardId]);
    if (additive) {
      next = new Set(selectedItems);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
    } else if (preserveGroup && selectedItems.has(cardId))
      next = new Set(selectedItems);
    setSelectedItems(next);
    setSelected(next.size === 1 && next.has(cardId) ? cardId : null);
    setSelectedRow(rowId);
    setSelectedStroke(null);
  }
  function clearSelection() {
    setSelected(null);
    setSelectedRow(null);
    setSelectedStroke(null);
    setSelectedItems(new Set());
    setConnectFrom(null);
  }
  function switchSession(value: Session) {
    zoomMotion.current?.stop();
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
    zoomMotion.current?.stop();
    const node = viewport.current;
    if (!node) return;
    tabletGestures.current?.stop();
    if (camera.current) flushCamera(true);
    cancelAnimationFrame(cameraFrame.current);
    cameraFrame.current = 0;
    clearTimeout(cameraCommit.current);
    camera.current = null;
    node.scrollLeft =
      clamp(
        x * scale - node.clientWidth / 2,
        0,
        Math.max(0, BOARD_WIDTH * scale - node.clientWidth),
      ) + canvasMargin.current.x;
    node.scrollTop =
      clamp(
        y * scale - node.clientHeight / 2,
        0,
        Math.max(0, BOARD_HEIGHT * scale - node.clientHeight),
      ) + canvasMargin.current.y;
  }
  function viewCenter(): [number, number] {
    const node = viewport.current;
    if (!node) return [CENTER_X, CENTER_Y];
    const view = readCamera();
    return [
      (view.x + node.clientWidth / 2) / view.zoom,
      (view.y + node.clientHeight / 2) / view.zoom,
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
    lesson.presence({ x, y, attentionAt: Date.now() });
  }
  function stopFollowing() {
    if (autoFollowing && followPeerId) setDismissedPresenter(followPeerId);
    setFollowPeerId(null);
    setAutoFollowing(false);
  }
  async function enrichPhrase(document: Y.Doc, card: Card) {
    if (!online || !card.chinese.trim()) return;
    const revision = ++translationSequence.current;
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
    const revision = ++translationSequence.current;
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
  async function addPhrase(
    text = input,
    location = newCardPosition(),
    language = sourceLanguage,
  ) {
    if (!doc || !text.trim() || creatingRef.current) return;
    if (text.length > 2000) {
      notify("Keep each phrase under 2,000 characters.");
      return;
    }
    language = inputLanguage(text, language);
    const content = text.trim();
    const document = doc;
    creatingRef.current = true;
    setCreatingPhrase(true);
    try {
      const analyzed = await phraseInput(content, language);
      if (
        !analyzed?.chinese?.trim() ||
        !analyzed.jyutping?.trim() ||
        !analyzed.definition?.trim()
      )
        throw Error(
          "Join an Internet lesson or update the desktop app to convert this phrase. Your text is kept.",
        );
      // Every source language produces the same Chinese/Jyutping/English card.
      const card = createCard({
        sourceLanguage: "chinese",
        ...analyzed,
        words: analyzed.words.length
          ? analyzed.words
          : analyzeLocal(analyzed.chinese).words,
        translation:
          language === "chinese"
            ? analyzeLocal(content).translation
            : "translated",
        x: clamp(location[0], 0, BOARD_WIDTH - 300),
        y: clamp(location[1], 0, BOARD_HEIGHT - 300),
      });
      if (document !== currentDocument.current) return;
      lesson.stopCapturing();
      addCard(document, card);
      lesson.stopCapturing();
      selectCard(card.id);
      setInput((current) => (current === text ? "" : current));
      lesson.presence({ draft: "" });
      if (language === "chinese") void enrichPhrase(document, card);
    } catch (error) {
      notify(errorText(error));
    } finally {
      creatingRef.current = false;
      setCreatingPhrase(false);
    }
  }
  function addBlankPhrase(location = newCardPosition()) {
    if (!doc) return;
    const card = createCard({
      sourceLanguage: teacher ? "chinese" : "jyutping",
      x: clamp(location[0], 0, BOARD_WIDTH - 300),
      y: clamp(location[1], 0, BOARD_HEIGHT - 300),
    });
    lesson.stopCapturing();
    addCard(doc, card);
    lesson.stopCapturing();
    selectCard(card.id);
    setEditingCard(card.id);
    setTool("select");
  }
  function learnerText(text: string) {
    return /\p{Script=Han}/u.test(text) ? analyzeLocal(text).jyutping : text;
  }
  function addNote(location = newCardPosition()) {
    if (!doc) return;
    const card = createCard({
      kind: "note",
      definition: "",
      shape: "sticky",
      x: clamp(location[0], 0, BOARD_WIDTH - 300),
      y: clamp(location[1], 0, BOARD_HEIGHT - 300),
    });
    lesson.stopCapturing();
    addCard(doc, card);
    lesson.stopCapturing();
    selectCard(card.id);
    setEditingCard(card.id);
    setTool("select");
  }
  function addTable(location = newCardPosition()) {
    if (!doc) return;
    const card = createCard({
      kind: "table",
      tableVariant,
      chinese: {
        phrases: "Phrase list",
        vocabulary: "Vocabulary",
        pattern: "Sentence patterns",
        qa: "Questions & answers",
        comparison: "Compare phrases",
      }[tableVariant],
      rows: [createTableRow()],
      x: clamp(location[0], 0, BOARD_WIDTH - 650),
      y: clamp(location[1], 0, BOARD_HEIGHT - 300),
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
      x: clamp(location[0], 0, BOARD_WIDTH - 300),
      y: clamp(location[1], 0, BOARD_HEIGHT - 300),
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
          starred: false,
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
  function beginInk(event: PointerEvent) {
    lesson.stopCapturing();
    path.current = {
      id: crypto.randomUUID(),
      points: [point(event)],
      pressures:
        event.pointerType === "pen" ? [event.pressure || 0.5] : undefined,
      color: tool === "highlight" ? highlightColor : inkColor,
      arrow: tool === "arrow",
      width: tool === "highlight" ? highlightWidth : inkWidth,
      opacity: tool === "highlight" ? 0.46 : 1,
    };
    setPending(path.current);
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerMove(event: PointerEvent) {
    const [x, y] = point(event);
    ownCursor.current = [x, y];
    if (Date.now() - lastPresence.current > 32) {
      lesson.presence({ x, y });
      lastPresence.current = Date.now();
    }
    if (tool === "erase" && erasing.current && doc) {
      doc.transact(() => {
        for (const stroke of strokes)
          if (nearStroke([x, y], stroke.points, (stroke.width ?? 3) / 2 + 8))
            doc.getMap("strokes").delete(stroke.id);
      });
      return;
    }
    if (connectorDrag.current) {
      connectorDrag.current.point = [x, y];
      setConnectorPreview({ ...connectorDrag.current });
      gestureMoved.current = true;
      return;
    }
    if (laser.current) {
      laser.current = [...laser.current.slice(-63), [x, y]];
      const value = { points: laser.current, at: Date.now() };
      setLocalLaser(value);
      lesson.presence({ laser: value });
      return;
    }
    if (resizing.current && doc) {
      const snapshot = resizing.current,
        [sx, sy] = snapshot.start;
      let width = clamp(snapshot.width + x - sx, 60, 1400),
        height = clamp(snapshot.height + y - sy, 45, 1400);
      if (snapshot.card.kind === "sticker" || event.shiftKey) {
        const ratio = snapshot.width / snapshot.height;
        height = width / ratio;
      }
      patchCard(doc, snapshot.card.id, {
        width: Math.round(width),
        height: Math.round(clamp(height, 45, 1400)),
        x: Math.min(snapshot.card.x, BOARD_WIDTH - width),
        y: Math.min(snapshot.card.y, BOARD_HEIGHT - height),
      });
      return;
    }
    if (lasso.current) {
      const points = lasso.current.points;
      if (
        Math.hypot(
          x - points[points.length - 1][0],
          y - points[points.length - 1][1],
        ) > 2
      )
        points.push([x, y]);
      lassoLine.current?.setAttribute(
        "points",
        points.map((p) => p.join(",")).join(" "),
      );
      gestureMoved.current ||= points.length > 2;
      return;
    }
    if (marquee.current) {
      const [sx, sy] = marquee.current.start;
      const rect = {
        x: Math.min(sx, x),
        y: Math.min(sy, y),
        width: Math.abs(x - sx),
        height: Math.abs(y - sy),
      };
      setSelectionRect(rect);
      if (rect.width + rect.height > 4) {
        const next = new Set(marquee.current.base);
        for (const card of cards)
          if (intersects(rect, cardBox(card))) next.add(card.id);
        for (const stroke of strokes)
          if (intersects(rect, pointsBox(stroke.points))) next.add(stroke.id);
        setSelectedItems(next);
        gestureMoved.current = true;
      }
      return;
    }
    if (drag.current && doc) {
      const snapshot = drag.current;
      const dx = x - snapshot.start[0],
        dy = y - snapshot.start[1];
      if (
        !gestureMoved.current &&
        Math.hypot(dx, dy) < (tablet ? 8 / zoomRef.current : 2)
      )
        return;
      if (Math.abs(dx) + Math.abs(dy) > 2) {
        gestureMoved.current = true;
        board.current?.setPointerCapture(event.pointerId);
      }
      const boxes = [
        ...snapshot.cards.map((card) => cardBox(card)),
        ...snapshot.strokes.map((stroke) => pointsBox(stroke.points)),
      ];
      const minX = Math.min(...boxes.map((box) => box.x)),
        minY = Math.min(...boxes.map((box) => box.y)),
        maxX = Math.max(...boxes.map((box) => box.x + box.width)),
        maxY = Math.max(...boxes.map((box) => box.y + box.height));
      const moveX = clamp(dx, -minX, BOARD_WIDTH - maxX),
        moveY = clamp(dy, -minY, BOARD_HEIGHT - maxY);
      snapshot.move = [moveX, moveY];
      cancelAnimationFrame(dragFrame.current);
      dragFrame.current = requestAnimationFrame(() => {
        paintConnectors(snapshot.cards, moveX, moveY);
        for (const card of snapshot.cards) {
          const node = cardElements.current.get(card.id);
          if (node) node.style.translate = `${moveX}px ${moveY}px`;
        }
        for (const stroke of snapshot.strokes)
          board.current
            ?.querySelector(`[data-stroke-id="${stroke.id}"]`)
            ?.setAttribute("transform", `translate(${moveX} ${moveY})`);
      });
    } else if (path.current) {
      const stroke = path.current;
      if (stroke.arrow) stroke.points = [stroke.points[0], [x, y]];
      else {
        const samples = event.nativeEvent.getCoalescedEvents?.() || [];
        for (const sample of samples.length ? samples : [event.nativeEvent]) {
          if (stroke.points.length >= 5000) break;
          stroke.points.push(point(sample));
          if (stroke.pressures) stroke.pressures.push(sample.pressure || 0.5);
        }
      }
      setPending({ ...stroke, points: [...stroke.points] });
      if (Date.now() - lastInkPresence.current > 32) {
        const indices = stroke.points
          .map((_, i) => i)
          .filter(
            (i) =>
              i % Math.ceil(stroke.points.length / 96) === 0 ||
              i === stroke.points.length - 1,
          );
        lesson.presence({
          ink: {
            stroke: {
              ...stroke,
              points: indices.map((i) => stroke.points[i]),
              pressures: stroke.pressures
                ? indices.map((i) => stroke.pressures![i])
                : undefined,
            },
            at: Date.now(),
          },
        });
        lastInkPresence.current = Date.now();
      }
    }
  }
  function paintConnectors(moving: Card[], dx: number, dy: number) {
    const ids = new Set(moving.map((card) => card.id));
    for (const connector of connectors) {
      if (!ids.has(connector.from) && !ids.has(connector.to)) continue;
      const a = cards.find((card) => card.id === connector.from),
        b = cards.find((card) => card.id === connector.to);
      if (!a || !b) continue;
      const box = (card: Card) => {
        const value = cardBox(card);
        return ids.has(card.id)
          ? { ...value, x: value.x + dx, y: value.y + dy }
          : value;
      };
      const points = connectorPoints(box(a), box(b))
        .map((point) => point.join(","))
        .join(" ");
      board.current
        ?.querySelectorAll(`[data-connector-id="${connector.id}"] polyline`)
        .forEach((node) => node.setAttribute("points", points));
    }
  }
  function cancelDrag(committed = false) {
    cancelAnimationFrame(dragFrame.current);
    const snapshot = drag.current;
    if (snapshot && !committed) paintConnectors(snapshot.cards, 0, 0);
    for (const card of snapshot?.cards || []) {
      const node = cardElements.current.get(card.id);
      if (node) node.style.translate = "";
    }
    for (const stroke of snapshot?.strokes || [])
      board.current
        ?.querySelector(`[data-stroke-id="${stroke.id}"]`)
        ?.removeAttribute("transform");
    drag.current = null;
    if (board.current) delete board.current.dataset.gesture;
  }
  function endPointer(event?: { clientX: number; clientY: number }) {
    if (lasso.current) {
      const { points, candidate } = lasso.current;
      lasso.current = null;
      setLassoPath([]);
      if (points.length < 3) {
        if (candidate && cards.some((card) => card.id === candidate))
          selectCard(candidate);
        else if (candidate) setSelectedItems(new Set([candidate]));
        else clearSelection();
      } else {
        const ids = new Set<string>();
        for (const card of cards)
          if (lassoHitsBox(points, cardBox(card))) ids.add(card.id);
        for (const stroke of strokes)
          if (lassoHitsStroke(points, stroke.points)) ids.add(stroke.id);
        setSelectedItems(ids);
      }
    }
    if (board.current) delete board.current.dataset.gesture;
    if (connectorDrag.current) {
      const from = connectorDrag.current.from;
      const location = event ? point(event) : connectorDrag.current.point;
      const target = cards
        .slice()
        .reverse()
        .find(
          (card) =>
            card.id !== from &&
            intersects(
              { x: location[0], y: location[1], width: 1, height: 1 },
              cardBox(card),
            ),
        );
      if (target) addConnector(from, target.id);
      connectorDrag.current = null;
      setConnectorPreview(null);
    }
    if (laser.current) {
      const value = { points: laser.current, at: Date.now() };
      setLocalLaser(value);
      lesson.presence({ laser: value });
      laser.current = null;
    }

    if (marquee.current) {
      marquee.current = null;
      setSelectionRect(null);
    }
    if (drag.current || resizing.current || erasing.current)
      lesson.stopCapturing();
    if (drag.current?.editTarget && !gestureMoved.current)
      drag.current.editTarget.focus({ preventScroll: true });
    if (drag.current?.move && doc) {
      const snapshot = drag.current,
        [dx, dy] = snapshot.move!;
      doc.transact(() => {
        for (const card of snapshot.cards)
          patchCard(doc, card.id, { x: card.x + dx, y: card.y + dy });
        for (const stroke of snapshot.strokes)
          doc.getMap<Stroke>("strokes").set(stroke.id, {
            ...stroke,
            points: stroke.points.map(([x, y]) => [x + dx, y + dy]),
          });
      });
      lesson.stopCapturing();
    }
    cancelDrag(true);
    resizing.current = null;
    erasing.current = false;
    if (path.current && doc) {
      if (path.current.points.length === 1 && !path.current.arrow) {
        path.current.points.push(path.current.points[0]);
        if (path.current.pressures)
          path.current.pressures.push(path.current.pressures[0]);
      }
      if (path.current.points.length > 1)
        doc.getMap<Stroke>("strokes").set(path.current.id, path.current);
      path.current = null;
      lesson.presence({ ink: null });
      setPending(null);
      lesson.stopCapturing();
    }
  }
  function finishTabletTap(event: PointerEvent<Element>) {
    const tap = tabletTap.current;
    if (!tap || tap.pointer !== event.pointerId) return;
    tabletTap.current = null;
    if (
      ["phrase", "note", "table", "sticker", "laser", "erase"].includes(tool)
    ) {
      lastTabletTap.current = null;
      return;
    }
    if (
      tap.moved ||
      Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 8
    ) {
      lastTabletTap.current = null;
      return;
    }
    if (!tap.id) {
      clearSelection();
      setEditingCard(null);
      (document.activeElement as HTMLElement | null)?.blur();
      lastTabletTap.current = null;
      return;
    }
    const previous = lastTabletTap.current;
    if (
      previous?.id === tap.id &&
      performance.now() - previous.time < 350 &&
      Math.hypot(tap.x - previous.x, tap.y - previous.y) < 24
    ) {
      const card = cards.find((card) => card.id === tap.id);
      if (card?.kind === "phrase" || card?.kind === "note")
        setEditingCard(card.id);
      else
        tap.target
          .closest<HTMLElement>("input,textarea,[contenteditable=true]")
          ?.focus({ preventScroll: true });
      lastTabletTap.current = null;
    } else
      lastTabletTap.current = {
        id: tap.id,
        x: tap.x,
        y: tap.y,
        time: performance.now(),
      };
  }
  function startDrag(event: PointerEvent<Element>, card: Card) {
    if (
      tool !== "select" ||
      connectFrom ||
      event.shiftKey ||
      (event.target as Element).closest("button,input,textarea,audio,select")
    )
      return;
    const ids = selectedItems.has(card.id) ? selectedItems : new Set([card.id]);
    selectCard(card.id, null, false, true);
    beginDrag(event, ids);
  }
  function beginDrag(event: PointerEvent<Element>, ids: Set<string>) {
    if (board.current) board.current.dataset.gesture = "drag";
    lesson.stopCapturing();
    gestureMoved.current = false;
    drag.current = {
      start: point(event),
      editTarget:
        tablet && event.pointerType === "touch"
          ? undefined
          : ((event.target as HTMLElement).closest<HTMLElement>(
              "input,textarea",
            ) ?? undefined),
      cards: cards.filter((card) => ids.has(card.id)),
      strokes: strokes.filter((stroke) => ids.has(stroke.id)),
    };
  }
  function startStroke(
    event: PointerEvent<SVGPolylineElement>,
    stroke: Stroke,
  ) {
    event.stopPropagation();
    if (tool === "erase") {
      lesson.stopCapturing();
      erasing.current = true;
      doc?.getMap("strokes").delete(stroke.id);
      board.current?.setPointerCapture(event.pointerId);
      return;
    }
    if (tool !== "select") return;
    const ids = event.shiftKey
      ? new Set(selectedItems)
      : selectedItems.has(stroke.id)
        ? new Set(selectedItems)
        : new Set<string>();
    if (event.shiftKey && ids.has(stroke.id)) ids.delete(stroke.id);
    else ids.add(stroke.id);
    setSelectedItems(ids);
    setSelected(null);
    setSelectedRow(null);
    setSelectedStroke(ids.size === 1 ? stroke.id : null);
    if (ids.has(stroke.id)) beginDrag(event, ids);
  }
  async function completeAnswer(
    cardId: string,
    row: TableRow,
    text: string,
    language?: SourceLanguage,
  ) {
    if (!doc || !text.trim()) return;
    const document = doc,
      key = `answer:${cardId}:${row.id}`,
      revision = ++translationSequence.current;
    translationRequests.current.set(key, revision);
    const snapshot = getTableRow(document, cardId, row.id);
    try {
      const value = await phraseInput(text, language);
      const current = getTableRow(document, cardId, row.id);
      if (
        !current ||
        (["answerChinese", "answerJyutping", "answerDefinition"] as const).some(
          (field) => current[field] !== snapshot?.[field],
        )
      )
        return;
      if (
        translationRequests.current.get(key) !== revision ||
        document !== currentDocument.current ||
        !getTableRow(document, cardId, row.id)
      )
        return;
      patchTableRow(document, cardId, row.id, {
        answerChinese: value.chinese,
        answerJyutping: value.jyutping,
        answerDefinition: value.definition,
      });
      if (inputLanguage(text, language) === "chinese" && online) {
        const meaning = await window.desktop?.translate(value.chinese);
        if (
          meaning &&
          translationRequests.current.get(key) === revision &&
          getTableRow(document, cardId, row.id)?.answerChinese === value.chinese
        )
          patchTableRow(document, cardId, row.id, {
            answerDefinition: meaning,
          });
      }
    } catch (error) {
      notify(errorText(error));
    }
  }
  function changeAnswer(cardId: string, row: TableRow, text: string) {
    if (!doc) return;
    const local = analyzeLocal(text);
    patchTableRow(doc, cardId, row.id, {
      answerChinese: text,
      answerJyutping: local.jyutping,
      answerDefinition: local.definition,
    });
    if (online && text.trim()) {
      const document = doc;
      const key = `answer:${cardId}:${row.id}`;
      const revision = ++translationSequence.current;
      translationRequests.current.set(key, revision);
      void (
        window.desktop ? window.desktop.translate(text) : translatePublic(text)
      )
        .then((definition) => {
          const current = getTableRow(document, cardId, row.id);
          if (
            translationRequests.current.get(key) === revision &&
            current?.answerChinese === text &&
            current.answerDefinition === local.definition
          )
            document.transact(
              () =>
                patchTableRow(document, cardId, row.id, {
                  answerDefinition: definition,
                }),
              "translation",
            );
        })
        .catch(() => {});
    }
  }
  function connectHandle(card: Card) {
    return (
      <button
        className="connect-handle"
        aria-label="Drag connector"
        title="Drag to another element"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => {
          e.stopPropagation();
          connectorDrag.current = { from: card.id, point: point(e) };
          setConnectorPreview({ ...connectorDrag.current });
          board.current?.setPointerCapture(e.pointerId);
        }}
      />
    );
  }
  function editPhraseInPlace(card: Card, text: string) {
    if (!doc) return;
    translationRequests.current.set(card.id, ++translationSequence.current);
    if (teacher)
      patchCard(doc, card.id, {
        chinese: text,
        jyutping: analyzeLocal(text).jyutping,
        words: analyzeLocal(text).words,
        translation: "local",
      });
    else if (card.sourceLanguage === "english")
      patchCard(doc, card.id, { definition: text, translation: "edited" });
    else patchCard(doc, card.id, { jyutping: text });
  }
  async function completePhrase(
    card: Card,
    text: string,
    language?: SourceLanguage,
  ) {
    if (!doc || !text.trim()) return;
    const document = doc,
      revision = ++translationSequence.current;
    translationRequests.current.set(card.id, revision);
    const fields = ["chinese", "jyutping", "definition"] as const;
    const original = document.getMap<Y.Map<unknown>>("cards").get(card.id);
    const snapshot = fields.map((field) => original?.get(field));
    try {
      const analyzed = await phraseInput(text, language);
      const current = document.getMap<Y.Map<unknown>>("cards").get(card.id);
      if (
        !current ||
        fields.some((field, index) => current.get(field) !== snapshot[index])
      )
        return;
      if (
        translationRequests.current.get(card.id) !== revision ||
        document !== currentDocument.current
      )
        return;
      patchCard(document, card.id, {
        ...analyzed,
        sourceLanguage: "chinese",
        receipt: "",
      });
      if (inputLanguage(text, language) === "chinese")
        void enrichPhrase(document, { ...card, ...analyzed });
    } catch (error) {
      notify(errorText(error));
    }
  }
  async function completeRow(
    cardId: string,
    row: TableRow,
    text: string,
    language?: SourceLanguage,
    audio?: string,
  ) {
    if (!doc) return;
    if (audio) patchTableRow(doc, cardId, row.id, { audio });
    if (!text.trim()) return;
    const document = doc,
      key = `${cardId}:${row.id}`,
      revision = ++translationSequence.current;
    translationRequests.current.set(key, revision);
    const snapshot = getTableRow(document, cardId, row.id);
    try {
      const analyzed = await phraseInput(text, language);
      const current = getTableRow(document, cardId, row.id);
      if (
        !current ||
        (["chinese", "jyutping", "definition"] as const).some(
          (field) => current[field] !== snapshot?.[field],
        )
      )
        return;
      if (
        translationRequests.current.get(key) !== revision ||
        document !== currentDocument.current ||
        !getTableRow(document, cardId, row.id)
      )
        return;
      const patch = {
        ...analyzed,
        ...(audio ? { audio } : {}),
        translation:
          inputLanguage(text, language) === "chinese"
            ? analyzed.translation
            : "translated",
      };
      patchTableRow(document, cardId, row.id, patch);
      if (inputLanguage(text, language) === "chinese")
        void enrichRow(document, cardId, { ...row, ...patch });
    } catch (error) {
      notify(errorText(error));
    }
  }
  function speechPhrase(text: string, audio: string) {
    if (!doc) return;
    const card = createCard({
      chinese: text,
      ...analyzeLocal(text),
      audio,
      audioName: "Exact push-to-talk recording",
      shape: "bubble",
      x: newCardPosition()[0],
      y: newCardPosition()[1],
    });
    lesson.stopCapturing();
    addCard(doc, card);
    lesson.stopCapturing();
    selectCard(card.id);
    if (text) void enrichPhrase(doc, card);
    else setEditingCard(card.id);
  }
  function addConversation() {
    if (!doc) return;
    const location = newCardPosition();
    const card = createCard({
      kind: "conversation",
      chinese: "Conversation",
      x: location[0],
      y: location[1],
      width: 500,
      rows: [
        createTableRow({ persona: "Leif", avatar: "leif" }),
        createTableRow({ persona: "Natasha", avatar: "natasha" }),
      ],
    });
    addCard(doc, card);
    selectCard(card.id);
  }
  async function joinPartner() {
    if (!paired?.room || !window.desktop) return;
    setSharingBusy(true);
    try {
      if (paired.host) {
        const result = await window.desktop.hostRemote();
        await window.desktop.pair({
          action: "publish",
          room: paired.room,
          relay: result.url,
        });
        switchSession({
          ...history.find((item) => item.id === paired.room),
          id: paired.room,
          title: "Our shared teaching room",
          created: Date.now(),
          relay: result.url,
        });
      } else {
        const result = await window.desktop.pair({
          action: "resolve",
          room: paired.room,
        });
        if (!result?.relay)
          throw Error("Your partner needs to open the room first.");
        switchSession({
          ...history.find((item) => item.id === paired.room),
          id: paired.room,
          title: "Our shared teaching room",
          created: Date.now(),
          relay: result.relay,
        });
      }
      setSharing(false);
    } catch (e) {
      notify(errorText(e));
    } finally {
      setSharingBusy(false);
    }
  }
  useEffect(() => {
    if (!window.desktop?.web || !paired?.room || paired.room !== session.id)
      return;
    let active = true;
    const refresh = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      void window
        .desktop!.pair({ action: "resolve", room: session.id })
        .then((result) => {
          if (active && result?.relay && result.relay !== session.relay) {
            updateSession({ ...session, relay: result.relay });
            if (!session.relay) setSharing(false);
          }
        })
        .catch(() => {});
    };
    refresh();
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    const timer = setInterval(refresh, 30000);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [session.id, session.relay, paired?.room]);
  function resizeHandle(card: Card) {
    if (!selectedItems.has(card.id) || selectedItems.size !== 1) return null;
    return (
      <button
        className="resize-handle"
        aria-label="Resize element"
        title="Drag to resize; hold Shift for proportions"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => {
          event.stopPropagation();
          lesson.stopCapturing();
          gestureMoved.current = false;
          const box = cardBox(card);
          if (board.current) board.current.dataset.gesture = "resize";
          resizing.current = {
            card,
            start: point(event),
            width: box.width,
            height: box.height,
          };
          board.current?.setPointerCapture(event.pointerId);
        }}
      />
    );
  }
  function cardBox(card: Card): Box {
    const measured = cardSizes[card.id];
    return {
      x: card.x,
      y: card.y,
      width:
        (measured?.width ?? card.width) ||
        (card.kind === "table" ? 650 : card.kind === "sticker" ? 118 : 250),
      height: (measured?.height ?? card.height) || 120,
    };
  }
  function setElementSize(card: Card, axis: "width" | "height", value: number) {
    if (!doc) return;
    const size = clamp(value, axis === "width" ? 60 : 45, 1400);
    const box = cardBox(card);
    const width =
      axis === "width" || card.kind === "sticker" ? size : box.width;
    const height =
      axis === "height" || card.kind === "sticker" ? size : box.height;
    patchCard(doc, card.id, {
      width,
      height,
      x: clamp(card.x, 0, BOARD_WIDTH - width),
      y: clamp(card.y, 0, BOARD_HEIGHT - height),
    });
  }
  function cardStyle(card: Card): CSSProperties {
    return {
      left: card.x,
      top: card.y,
      width: card.width || undefined,
      maxWidth: card.width || undefined,
      borderColor: card.borderColor,
      borderWidth: card.borderWidth,
      borderStyle: card.borderStyle,
      minHeight: card.height || undefined,
      height:
        card.kind === "sticker" ? card.height || card.width || 118 : undefined,
      backgroundColor:
        card.kind === "sticker" || card.kind === "note"
          ? card.tint || undefined
          : card.tint || "transparent",
      "--text-scale": card.textScale,
      "--card-fill":
        card.tint || (card.kind === "conversation" ? "" : "transparent"),
    } as CSSProperties;
  }
  function addConnector(from: string, to: string) {
    if (!doc || from === to) return;
    lesson.stopCapturing();
    const connector: Connector = {
      id: crypto.randomUUID(),
      from,
      to,
      color: inkColor,
      width: 2,
    };
    doc.getMap<Connector>("connectors").set(connector.id, connector);
    lesson.stopCapturing();
  }
  function changeDrawing(patch: Partial<Stroke>) {
    if (!doc) return;
    doc.transact(() => {
      for (const stroke of strokes)
        if (selectedItems.has(stroke.id))
          doc.getMap<Stroke>("strokes").set(stroke.id, { ...stroke, ...patch });
      for (const connector of connectors)
        if (selectedItems.has(connector.id))
          doc.getMap<Connector>("connectors").set(connector.id, {
            ...connector,
            ...(patch.color ? { color: patch.color } : {}),
            ...(patch.width ? { width: Math.min(12, patch.width) } : {}),
          });
    });
  }
  function patchSelection(patch: Partial<Card>) {
    if (!doc) return;
    doc.transact(() => {
      for (const card of cards)
        if (selectedItems.has(card.id)) patchCard(doc, card.id, patch);
    });
  }
  function scaleSelection(factor: number) {
    if (!doc) return;
    lesson.stopCapturing();
    doc.transact(() => {
      for (const card of cards)
        if (selectedItems.has(card.id)) {
          const box = cardBox(card),
            width = clamp(box.width * factor, 60, 1400),
            height = clamp(box.height * factor, 45, 1400);
          patchCard(doc, card.id, {
            width,
            height,
            textScale: clamp(card.textScale * factor, 0.5, 3),
            x: Math.min(card.x, BOARD_WIDTH - width),
            y: Math.min(card.y, BOARD_HEIGHT - height),
          });
        }
      for (const stroke of strokes)
        if (selectedItems.has(stroke.id)) {
          const box = pointsBox(stroke.points);
          doc.getMap<Stroke>("strokes").set(stroke.id, {
            ...stroke,
            width: clamp((stroke.width ?? 3) * factor, 1, 60),
            points: stroke.points.map(([x, y]) => [
              clamp(box.x + (x - box.x) * factor, 0, 5600),
              clamp(box.y + (y - box.y) * factor, 0, 3600),
            ]),
          });
        }
    });
    lesson.stopCapturing();
  }
  function duplicateSelection() {
    if (!doc) return;
    lesson.stopCapturing();
    const remap = new Map<string, string>();
    doc.transact(() => {
      for (const card of cards)
        if (selectedItems.has(card.id)) {
          const copy = createCard({
            ...card,
            id: crypto.randomUUID(),
            created: Date.now(),
            x: clamp(card.x + 30, 0, 5300),
            y: clamp(card.y + 30, 0, 3300),
            receipt: "",
          });
          remap.set(card.id, copy.id);
          addCard(doc, copy);
        }
      for (const stroke of strokes)
        if (selectedItems.has(stroke.id)) {
          const copy = {
            ...stroke,
            id: crypto.randomUUID(),
            points: stroke.points.map(
              ([x, y]) =>
                [Math.min(x + 30, 5600), Math.min(y + 30, 3600)] as [
                  number,
                  number,
                ],
            ),
          };
          remap.set(stroke.id, copy.id);
          doc.getMap<Stroke>("strokes").set(copy.id, copy);
        }
      for (const connector of connectors)
        if (remap.has(connector.from) && remap.has(connector.to)) {
          const id = crypto.randomUUID();
          doc.getMap<Connector>("connectors").set(id, {
            ...connector,
            id,
            from: remap.get(connector.from)!,
            to: remap.get(connector.to)!,
          });
        }
    });
    setSelectedItems(new Set(remap.values()));
    setSelected(null);
    setSelectedStroke(null);
    lesson.stopCapturing();
  }
  function alignSelection(axis: "x" | "y") {
    if (!doc) return;
    const items = cards.filter((card) => selectedItems.has(card.id));
    const target = Math.min(...items.map((card) => card[axis]));
    lesson.stopCapturing();
    doc.transact(() =>
      items.forEach((card) => patchCard(doc, card.id, { [axis]: target })),
    );
    lesson.stopCapturing();
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
    translationRequests.current.set(
      `${cardId}:${row.id}`,
      ++translationSequence.current,
    );
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
    zoomMotion.current?.stop();
    const node = viewport.current;
    if (!node) return;
    tabletGestures.current?.stop();
    stopFollowing();
    const view = readCamera(),
      nextZoom = clamp(view.zoom + delta, 0.35, 2.5);
    const cx = node.clientWidth / 2,
      cy = node.clientHeight / 2;
    queueCamera({
      zoom: nextZoom,
      x: ((view.x + cx) / view.zoom) * nextZoom - cx,
      y: ((view.y + cy) / view.zoom) * nextZoom - cy,
    });
    tabletGestures.current?.deferSettle();
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
      try {
        await window.desktop.pair({
          action: "publish",
          room: session.id,
          relay: result.url,
        });
        await window.desktop.pair({
          action: "remember",
          room: session.id,
          host: true,
        });
        setPaired({ room: session.id, host: true });
      } catch {
        notify(
          "Invitation ready. Add your JyutDeck token in Settings to remember a pairing.",
        );
      }
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
      if (
        window.desktop?.web &&
        location.protocol === "https:" &&
        parsed.relay.startsWith("ws:")
      )
        throw Error(
          "Choose Start internet lesson on your partner’s desktop, then use Copy iPad link.",
        );
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
      void window.desktop
        ?.pair({
          action: "remember",
          room: parsed.room,
          relay: parsed.relay,
          host: false,
        })
        .then(() => setPaired({ room: parsed.room, host: false }));
      setSharing(false);
      notify("Joining the shared lesson…");
    } catch (error) {
      notify(errorText(error));
    }
  }
  function patchJyutDeckSync(
    cardId: string,
    parentId: string | undefined,
    patch: Partial<Card>,
  ) {
    if (!doc) return;
    if (parentId) patchTableRow(doc, parentId, cardId, patch);
    else patchCard(doc, cardId, patch);
  }

  async function refreshVocabularyAfterQueueSync() {
    if (!doc || !window.desktop) return;
    try {
      const snapshot = await window.desktop.vocabulary();
      doc.transact(
        () =>
          doc
            .getMap<VocabularySnapshot>("vocabulary")
            .set("snapshot", snapshot),
        "vocabulary",
      );
      setVocabularyMessage(
        `Connected · ${snapshot.known.length} known forms · ${snapshot.queued.length} queued`,
      );
    } catch {
      // Queue success is durable even if the follow-up vocabulary refresh fails.
    }
  }

  async function flushJyutDeckOutbox() {
    if (flushingOutbox.current || !doc || !window.desktop) return;
    const batch = dueJyutDeckOutboxItems(session.id).slice(0, 5);
    if (!batch.length) return;
    if (!isBrowserOnline()) return;
    flushingOutbox.current = true;
    batch.forEach((item) =>
      patchJyutDeckSync(item.cardId, item.parentId, {
        syncState: "syncing",
        syncMessage: "Syncing…",
      }),
    );
    try {
      const receipts = parseReceipts(
        await window.desktop.send({ requests: batch.map((item) => item.request) }),
        batch.length,
      );
      let refreshVocabulary = false;
      batch.forEach((item, index) => {
        const receipt = receipts[index] || "failed: Missing queue receipt";
        if (successfulQueueReceipt(receipt)) {
          removeJyutDeckOutboxItem(item.key);
          patchJyutDeckSync(item.cardId, item.parentId, {
            receipt,
            syncState: "saved",
            syncMessage: receipt.startsWith("duplicate")
              ? "Already in JyutDeck"
              : "Saved to JyutDeck",
          });
          refreshVocabulary = true;
        } else if (receipt.startsWith("conflict")) {
          removeJyutDeckOutboxItem(item.key);
          patchJyutDeckSync(item.cardId, item.parentId, {
            receipt,
            syncState: "error",
            syncMessage: "Needs attention",
          });
        } else {
          retryJyutDeckOutboxItem(item.key);
          patchJyutDeckSync(item.cardId, item.parentId, {
            receipt,
            syncState: "error",
            syncMessage: "Couldn’t sync yet · retrying automatically",
          });
        }
      });
      if (refreshVocabulary) await refreshVocabularyAfterQueueSync();
    } catch (error) {
      const waiting = !isBrowserOnline();
      batch.forEach((item) => {
        retryJyutDeckOutboxItem(item.key);
        patchJyutDeckSync(item.cardId, item.parentId, {
          syncState: waiting ? "waiting" : "error",
          syncMessage: waiting
            ? "Waiting for internet"
            : "Couldn’t sync yet · retrying automatically",
        });
      });
    } finally {
      flushingOutbox.current = false;
      if (dueJyutDeckOutboxItems(session.id).length)
        setTimeout(() => void flushJyutDeckOutbox(), 750);
    }
  }

  async function backup() {
    const text = JSON.stringify(
      {
        format: "jyutboard-v1",
        title: session.title,
        cards,
        strokes,
        connectors,
      },
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
      const drawing: Stroke[] = value.strokes.map((item: unknown) =>
        strokeSchema.parse(item),
      );
      const attached: Connector[] = (value.connectors ?? []).map(
        (item: unknown) => connectorSchema.parse(item),
      );
      if (attached.length > 2000) throw Error("Too many connectors in backup.");
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
      attached.forEach((connector: Connector) =>
        document.getMap<Connector>("connectors").set(connector.id, connector),
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
    if (selected && selectedRow && selectedItems.size < 2) {
      deleteTableRow(doc, selected, selectedRow);
      setSelectedRow(null);
    } else {
      const ids = selectedItems.size
        ? selectedItems
        : new Set([selected ?? selectedStroke ?? ""]);
      doc.transact(() => {
        for (const id of ids) {
          doc.getMap("cards").delete(id);
          doc.getMap("strokes").delete(id);
          doc.getMap("connectors").delete(id);
        }
        for (const connector of connectors)
          if (ids.has(connector.from) || ids.has(connector.to))
            doc.getMap("connectors").delete(connector.id);
      });
      clearSelection();
    }
    lesson.stopCapturing();
  }
  const selectedCards = cards.filter((card) => selectedItems.has(card.id));
  const activeDrawing =
    strokes.find((stroke) => selectedItems.has(stroke.id)) ??
    connectors.find((connector) => selectedItems.has(connector.id));
  const wordOwner = activeRow ?? active;
  const wordList = wordOwner?.words ?? [];
  return (
    <div className="app">
      {leftOpen && (
        <aside className="sidebar">
          <div className="brand">
            <img className="brand-icon" src="./app-icon.png" alt="" />
            <strong>JyutBoard</strong>
            <button
              className="tablet-panel-close"
              aria-label="Close pages"
              onClick={() => setLeftOpen(false)}
            >
              <X size={18} />
            </button>
          </div>
          {paired && !tablet && (
            <button
              className="join-partner"
              disabled={sharingBusy}
              onClick={() => void joinPartner()}
            >
              {paired.host
                ? "Open our room"
                : teacher
                  ? "Join Leif"
                  : "Join Natasha"}
            </button>
          )}
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
                className={`lesson-open ${item.id === session.id ? "current" : ""}`}
                key={item.id}
                onClick={() => switchSession(item)}
              >
                <span>{index + 1}.</span>
                <strong>{item.title}</strong>
              </button>
            ))}
          </div>
          {tablet && (
            <button className="new-session" onClick={() => setSharing(true)}>
              <Users size={15} />
              Lesson connection
            </button>
          )}
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
            {window.desktop?.web && (
              <select
                className="tablet-role"
                aria-label="Your lesson view"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
              >
                <option value="learner">Leif · Jyutping</option>
                <option value="teacher">Natasha · 中文</option>
              </select>
            )}
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
            <UpdateControls compact live={peers.length > 0} notify={notify} />
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
            {!(tablet && session.relay) && (
              <button className="share-button" onClick={() => setSharing(true)}>
                <Users size={15} /> Share / Sync
              </button>
            )}
            {peers.map((peer) => (
              <button
                key={peer.id}
                className="partner-button"
                title={`Find ${peer.role === "teacher" ? "Natasha" : "Leif"} on the canvas`}
                onClick={() => jumpToPeer(peer)}
              >
                <span>{peer.role === "teacher" ? "🦝" : "🐻"}</span>
                {peer.role === "teacher" ? "Natasha" : "Leif"}
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
              onClick={() => setRightOpen((value) => !value)}
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
                  className={`touch-pan ${tool === "pan" ? "active" : ""}`}
                  title="Pan canvas"
                  aria-label="Pan canvas"
                  onClick={() => setTool("pan")}
                >
                  <Hand size={18} />
                </button>
                <button
                  title={tablet ? "Lasso selection" : "Select and move"}
                  aria-label={tablet ? "Lasso selection" : "Select and move"}
                  className={tool === "select" ? "active" : ""}
                  onClick={() => setTool("select")}
                >
                  {tablet ? <Lasso size={18} /> : <MousePointer2 size={17} />}
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
                <button
                  title="Erase drawings"
                  aria-label="Erase drawings"
                  className={tool === "erase" ? "active" : ""}
                  onClick={() => setTool("erase")}
                >
                  <Eraser size={17} />
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
                <select
                  className="table-template-select"
                  aria-label="Table template"
                  value={tableVariant}
                  onChange={(e) =>
                    setTableVariant(e.target.value as Card["tableVariant"])
                  }
                >
                  <option value="phrases">Phrase list</option>
                  <option value="vocabulary">Vocabulary</option>
                  <option value="pattern">Patterns</option>
                  <option value="qa">Question / answer</option>
                  <option value="comparison">Comparison</option>
                </select>
                <button
                  title="Place sticker on canvas"
                  aria-label="Place sticker on canvas"
                  className={tool === "sticker" ? "active" : ""}
                  onClick={() => {
                    setTool("sticker");
                    setStickerLibraryOpen(true);
                  }}
                >
                  <StickerArt id="star" />
                </button>
                <button
                  title="Add conversation"
                  aria-label="Add conversation"
                  onClick={addConversation}
                >
                  <MessageCircle size={18} />
                </button>
                <button
                  title="Laser pointer"
                  aria-label="Laser pointer"
                  className={tool === "laser" ? "active" : ""}
                  onClick={() => setTool("laser")}
                >
                  <Zap size={18} />
                </button>
              </div>
              {(active || selectedItems.size > 1) && (
                <div
                  className="tool-group selection-tools"
                  aria-label="Selected element controls"
                >
                  {active &&
                    ["phrase", "conversation", "table"].includes(
                      active.kind,
                    ) && (
                      <select
                        aria-label="Selected card mode"
                        value={active.mode}
                        onChange={(e) => {
                          if (!doc) return;
                          const mode = e.target.value as CardMode;
                          doc.transact(() => {
                            patchCard(doc, active.id, {
                              mode,
                              height: 0,
                              hideEnglishForLearner: false,
                            });
                            if (active.kind === "conversation")
                              active.rows.forEach((row) =>
                                patchTableRow(doc, active.id, row.id, { mode }),
                              );
                          });
                        }}
                      >
                        <option value="full">Standard</option>
                        <option value="peek">Compact</option>
                        <option value="practice">Practice</option>
                      </select>
                    )}
                  {active && (
                    <div className="wide-selection-controls">
                      <CardBorder
                        compact
                        card={active}
                        onChange={patchSelection}
                      />
                      <button
                        title="Fit card to text"
                        aria-label="Fit card to text"
                        onClick={() => patchSelection({ width: 0, height: 0 })}
                      >
                        <Scaling size={16} />
                      </button>
                    </div>
                  )}
                  {active && ["phrase", "note"].includes(active.kind) && (
                    <button
                      title="Edit text in place"
                      aria-label="Edit text in place"
                      onClick={() => setEditingCard(active.id)}
                    >
                      <Pencil size={16} />
                    </button>
                  )}
                  <button
                    title="Duplicate selected"
                    aria-label="Duplicate selected"
                    onClick={duplicateSelection}
                  >
                    <CopyPlus size={16} />
                  </button>
                  <button
                    title="Delete selected"
                    aria-label="Delete selected"
                    onClick={removeSelected}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
              <div className="tool-group">
                <button
                  title="Vocabulary colours · known, queued, new"
                  aria-label="Vocabulary colours"
                  aria-pressed={highlightMode !== "off"}
                  className={highlightMode !== "off" ? "active" : ""}
                  onClick={() => {
                    const next = highlightMode === "off" ? "always" : "off";
                    setHighlightMode(next);
                    preference("vocabularyHighlight", next);
                  }}
                >
                  <span className="vocabulary-toggle">粵</span>
                </button>
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
            {["draw", "highlight", "arrow"].includes(tool) && (
              <div className="drawing-options">
                <DrawingControls
                  color={tool === "highlight" ? highlightColor : inkColor}
                  width={tool === "highlight" ? highlightWidth : inkWidth}
                  highlighter={tool === "highlight"}
                  onColor={
                    tool === "highlight" ? setHighlightColor : setInkColor
                  }
                  onWidth={
                    tool === "highlight" ? setHighlightWidth : setInkWidth
                  }
                />
              </div>
            )}
            {tool === "erase" && (
              <div className="tool-hint">
                Click or brush across a drawing to erase the mark. Undo restores
                it.
              </div>
            )}
            {tool === "sticker" && stickerLibraryOpen && (
              <div className="sticker-popover">
                <div className="section-head">
                  <span>Pick a sticker, then click the canvas</span>
                  <button
                    aria-label="Close stickers"
                    onClick={() => setTool("select")}
                  >
                    <X size={15} />
                  </button>
                </div>
                <div className="persona-stickers">
                  {["natasha", "leif", "friend", "teacher"].map((id) => (
                    <button
                      key={id}
                      aria-label={`Person ${id}`}
                      onClick={() => {
                        setSticker(`person-${id}`);
                        setStickerLibraryOpen(false);
                      }}
                    >
                      <PersonAvatar id={id} name={id} />
                    </button>
                  ))}
                </div>
                <StickerLibrary
                  selected={sticker}
                  onPick={(id) => {
                    setSticker(id);
                    setStickerLibraryOpen(false);
                  }}
                />
              </div>
            )}
            {tool === "sticker" && !stickerLibraryOpen && (
              <div className="tool-hint">
                Click the canvas to place your sticker.{" "}
                <button onClick={() => setStickerLibraryOpen(true)}>
                  Change sticker
                </button>
              </div>
            )}
            {connectFrom && (
              <div className="tool-hint">
                Click another element to attach an arrow.{" "}
                <button onClick={() => setConnectFrom(null)}>Cancel</button>
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
            <div
              className="canvas-viewport"
              ref={viewport}
              onPointerDownCapture={(e) => {
                if (tablet && e.pointerType === "touch") {
                  const target = e.target as HTMLElement;
                  if (
                    !target.closest("button,select,audio,summary") &&
                    target !== document.activeElement
                  )
                    tabletTap.current = {
                      pointer: e.pointerId,
                      id:
                        target.closest<HTMLElement>("[data-card-id]")?.dataset
                          .cardId ||
                        target.closest<SVGElement>("[data-stroke-id]")?.dataset
                          .strokeId,
                      target,
                      x: e.clientX,
                      y: e.clientY,
                      moved: false,
                    };
                }
                const gestures = tabletGestures.current;
                if (gestures?.down(e.nativeEvent)) {
                  if (gestures.navigationActive) {
                    if (gestures.multipleContacts) tabletTap.current = null;
                    lastTabletTap.current = null;
                    cancelDrag();
                    lasso.current = null;
                    setLassoPath([]);
                    marquee.current = null;
                    resizing.current = null;
                    setSelectionRect(null);
                    if (path.current || laser.current || erasing.current)
                      endPointer();
                  } else tabletTap.current = null;
                  e.preventDefault();
                  e.stopPropagation();
                  return;
                }
                if (!tablet || !["touch", "pen"].includes(e.pointerType))
                  return;
                const target = e.target as HTMLElement;
                if (
                  target.closest("button,select,audio,summary") ||
                  target === document.activeElement
                )
                  return;
                const cardId =
                  target.closest<HTMLElement>("[data-card-id]")?.dataset.cardId;
                const strokeId =
                  target.closest<SVGElement>("[data-stroke-id]")?.dataset
                    .strokeId;
                const id = cardId || strokeId;
                if (
                  id &&
                  (selectedItems.has(id) || e.pointerType === "touch") &&
                  !["laser", "erase"].includes(tool) &&
                  (e.pointerType === "touch" || tool === "select")
                ) {
                  const ids = selectedItems.has(id)
                    ? selectedItems
                    : new Set([id]);
                  if (!selectedItems.has(id)) {
                    if (cardId) selectCard(cardId);
                    else {
                      setSelectedItems(ids);
                      setSelected(null);
                      setSelectedRow(null);
                      setSelectedStroke(id);
                    }
                  }
                  beginDrag(e, ids);
                  e.currentTarget.setPointerCapture(e.pointerId);
                  e.preventDefault();
                  e.stopPropagation();
                  return;
                }
                if (
                  e.pointerType === "pen" &&
                  (cardId || strokeId) &&
                  ["draw", "highlight", "arrow"].includes(tool)
                ) {
                  beginInk(e);
                  e.preventDefault();
                  e.stopPropagation();
                  return;
                }
                if (tool === "select") {
                  clearSelection();
                  lasso.current = { points: [point(e)], candidate: id };
                  setLassoPath(lasso.current.points);
                  e.currentTarget.setPointerCapture(e.pointerId);
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
              onPointerMoveCapture={(e) => {
                const tap = tabletTap.current;
                if (
                  tap &&
                  tap.pointer === e.pointerId &&
                  Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 8
                )
                  tap.moved = true;
                if (tabletGestures.current?.move(e.nativeEvent)) {
                  e.preventDefault();
                  e.stopPropagation();
                } else if (tablet && (drag.current || lasso.current)) {
                  pointerMove(e);
                  e.stopPropagation();
                }
              }}
              onPointerUpCapture={(e) => {
                const navigation = tabletGestures.current?.up(e.nativeEvent);
                if (tablet && (drag.current || lasso.current)) {
                  endPointer(e);
                  e.stopPropagation();
                }
                if (navigation) e.stopPropagation();
                if (tablet && e.pointerType === "touch") finishTabletTap(e);
              }}
              onPointerCancelCapture={(e) => {
                const navigation = tabletGestures.current?.up(e.nativeEvent);
                tabletTap.current = null;
                lastTabletTap.current = null;
                if (tablet && (drag.current || lasso.current)) {
                  cancelDrag();
                  lasso.current = null;
                  setLassoPath([]);
                  e.stopPropagation();
                }
                if (navigation) e.stopPropagation();
              }}
            >
              <div className="canvas-space">
                <div
                  className={`canvas ${tablet ? "tablet-canvas" : ""} tool-${tool} ${connectFrom ? "connecting" : ""}`}
                  ref={board}
                  onPointerMove={pointerMove}
                  onPointerUp={endPointer}
                  onPointerCancel={endPointer}
                  onPointerDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    const location = point(event);
                    gestureMoved.current = false;
                    if (tool === "select" && !connectFrom) {
                      const base = event.shiftKey
                        ? new Set(selectedItems)
                        : new Set<string>();
                      if (!event.shiftKey) clearSelection();
                      marquee.current = { start: location, base };
                      setSelectionRect({
                        x: location[0],
                        y: location[1],
                        width: 0,
                        height: 0,
                      });
                      event.currentTarget.setPointerCapture(event.pointerId);
                      return;
                    }
                    if (tool === "laser") {
                      laser.current = [location];
                      const value = { points: [location], at: Date.now() };
                      setLocalLaser(value);
                      lesson.presence({ laser: value });
                      event.currentTarget.setPointerCapture(event.pointerId);
                      return;
                    }
                    if (tool === "erase") {
                      lesson.stopCapturing();
                      erasing.current = true;
                      event.currentTarget.setPointerCapture(event.pointerId);
                      return;
                    }
                    clearSelection();
                    if (tool === "phrase") {
                      event.preventDefault();
                      addBlankPhrase(location);
                      return;
                    }
                    if (tool === "note") {
                      event.preventDefault();
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
                      beginInk(event);
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
                  <DrawingLayer
                    strokes={[...strokes, ...(pending ? [pending] : [])]}
                    connectors={connectors.flatMap((connector) => {
                      const a = cards.find(
                          (card) => card.id === connector.from,
                        ),
                        b = cards.find((card) => card.id === connector.to);
                      return a && b
                        ? [
                            {
                              ...connector,
                              points: connectorPoints(cardBox(a), cardBox(b)),
                            },
                          ]
                        : [];
                    })}
                    selected={selectedItems}
                    tool={tool}
                    onStroke={startStroke}
                    onConnector={(event, connector) => {
                      event.stopPropagation();
                      const next = event.shiftKey
                        ? new Set(selectedItems)
                        : new Set<string>();
                      if (event.shiftKey && next.has(connector.id))
                        next.delete(connector.id);
                      else next.add(connector.id);
                      setSelectedItems(next);
                      setSelected(null);
                      setSelectedStroke(null);
                    }}
                  />
                  <svg
                    className="remote-ink-layer"
                    width={BOARD_WIDTH}
                    height={BOARD_HEIGHT}
                  >
                    {peers
                      .filter(
                        (peer) =>
                          peer.ink &&
                          now - peer.ink.at < 6000 &&
                          !strokes.some(
                            (stroke) => stroke.id === peer.ink!.stroke.id,
                          ),
                      )
                      .map((peer) => (
                        <path
                          key={peer.id}
                          data-testid="live-ink"
                          d={inkOutline(peer.ink!.stroke)}
                          fill={peer.ink!.stroke.color}
                          opacity={peer.ink!.stroke.opacity ?? 1}
                        />
                      ))}
                  </svg>
                  <svg
                    className="laser-layer"
                    width={BOARD_WIDTH}
                    height={BOARD_HEIGHT}
                  >
                    {[
                      ...(localLaser ? [localLaser] : []),
                      ...peers.flatMap((peer) =>
                        peer.laser ? [peer.laser] : [],
                      ),
                    ]
                      .filter((value) => now - value.at < 1800)
                      .map((value, index) => (
                        <polyline
                          key={index}
                          points={value.points
                            .map((point) => point.join(","))
                            .join(" ")}
                          stroke="#f2647e"
                          strokeWidth={4}
                          fill="none"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          opacity={Math.max(0, 1 - (now - value.at) / 1800)}
                        />
                      ))}
                    {connectorPreview &&
                      cards.find(
                        (card) => card.id === connectorPreview.from,
                      ) && (
                        <line
                          x1={
                            cardBox(
                              cards.find(
                                (card) => card.id === connectorPreview.from,
                              )!,
                            ).x +
                            cardBox(
                              cards.find(
                                (card) => card.id === connectorPreview.from,
                              )!,
                            ).width
                          }
                          y1={
                            cardBox(
                              cards.find(
                                (card) => card.id === connectorPreview.from,
                              )!,
                            ).y +
                            cardBox(
                              cards.find(
                                (card) => card.id === connectorPreview.from,
                              )!,
                            ).height /
                              2
                          }
                          x2={connectorPreview.point[0]}
                          y2={connectorPreview.point[1]}
                          stroke={inkColor}
                          strokeWidth={2}
                          strokeDasharray="5 4"
                        />
                      )}
                  </svg>
                  {lassoPath.length > 0 && (
                    <svg
                      className="lasso-layer"
                      width={BOARD_WIDTH}
                      height={BOARD_HEIGHT}
                    >
                      <polyline
                        ref={lassoLine}
                        points={lassoPath.map((p) => p.join(",")).join(" ")}
                        fill="#718ab610"
                        stroke="#718ab6"
                        strokeWidth={1.5 / zoom}
                        strokeDasharray={`${5 / zoom} ${4 / zoom}`}
                      />
                    </svg>
                  )}
                  {selectionRect && (
                    <div
                      className="selection-marquee"
                      style={{
                        left: selectionRect.x,
                        top: selectionRect.y,
                        width: selectionRect.width,
                        height: selectionRect.height,
                      }}
                    />
                  )}
                  {!cards.length &&
                    !strokes.length &&
                    !welcomeClosed &&
                    ["select", "pan"].includes(tool) && (
                      <div
                        className="welcome"
                        onPointerDown={(event) => event.stopPropagation()}
                      >
                        <button
                          className="welcome-close"
                          aria-label="Close welcome"
                          onClick={() => setWelcomeClosed(true)}
                        >
                          <X size={16} />
                        </button>
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
                    card.kind === "conversation" ? (
                      <article
                        key={card.id}
                        data-testid="conversation-card"
                        data-card-id={card.id}
                        className={`board-card conversation-card ${selectedItems.has(card.id) ? "selected" : ""}`}
                        ref={(node) => {
                          if (node) cardElements.current.set(card.id, node);
                          else cardElements.current.delete(card.id);
                        }}
                        style={cardStyle(card)}
                        onPointerDown={(event) => startDrag(event, card)}
                        onClick={(event) => {
                          if (!gestureMoved.current)
                            selectCard(card.id, null, event.shiftKey, true);
                          gestureMoved.current = false;
                        }}
                      >
                        <input
                          className="conversation-title"
                          aria-label="Conversation title"
                          value={
                            teacher ? card.chinese : learnerText(card.chinese)
                          }
                          onChange={(e) =>
                            doc &&
                            patchCard(doc, card.id, { chinese: e.target.value })
                          }
                        />
                        <Conversation
                          card={card}
                          teacher={teacher}
                          vocabulary={vocabulary}
                          highlightMode={highlightMode}
                          selectedRow={
                            selected === card.id ? selectedRow : null
                          }
                          hidden={englishHidden(card, teacher)}
                          onChange={(row, patch) => {
                            if (!doc) return;
                            const nextPatch =
                              patch.starred === true
                                ? {
                                    ...patch,
                                    savedBy: patch.savedBy ?? role,
                                    syncState: "pending" as const,
                                    syncMessage: "",
                                    receipt: "",
                                  }
                                : patch;
                            patchTableRow(doc, card.id, row.id, nextPatch);
                            if (patch.starred === false)
                              removeJyutDeckOutboxItem(
                                jyutDeckOutboxKey(session.id, row.id),
                              );
                          }}
                          onChinese={(row, text) =>
                            changeRowChinese(card.id, row, text)
                          }
                          onComplete={(row, text, language) =>
                            void completeRow(card.id, row, text, language)
                          }
                          onSpeech={(row, text, audio) =>
                            void completeRow(
                              card.id,
                              row,
                              text,
                              "chinese",
                              audio,
                            )
                          }
                          notify={notify}
                          onSelect={(row) => selectCard(card.id, row.id)}
                          onAdd={() =>
                            doc &&
                            addTableRow(
                              doc,
                              card.id,
                              createTableRow({
                                persona:
                                  card.rows.length % 2 ? "Natasha" : "Leif",
                                avatar:
                                  card.rows.length % 2 ? "natasha" : "leif",
                              }),
                            )
                          }
                          onDelete={(row) =>
                            doc && deleteTableRow(doc, card.id, row.id)
                          }
                        />
                        {connectHandle(card)}
                        {resizeHandle(card)}
                      </article>
                    ) : card.kind === "table" ? (
                      <article
                        key={card.id}
                        data-testid="table-card"
                        className={`board-card table-card table-mode-${card.mode} table-style-${card.tableStyle} table-variant-${card.tableVariant} ${selectedItems.has(card.id) ? "selected" : ""}`}
                        data-card-id={card.id}
                        ref={(node) => {
                          if (node) cardElements.current.set(card.id, node);
                          else cardElements.current.delete(card.id);
                        }}
                        style={cardStyle(card)}
                        onPointerDown={(event) => startDrag(event, card)}
                        onClick={(event) => {
                          if (!gestureMoved.current)
                            selectCard(card.id, null, event.shiftKey, true);
                          gestureMoved.current = false;
                        }}
                      >
                        <div className="table-title">
                          <button
                            className="table-drag-handle"
                            aria-label="Move table"
                            title="Drag to move table"
                            onPointerDown={(event) => {
                              event.stopPropagation();
                              selectCard(card.id);
                              beginDrag(event, new Set([card.id]));
                              board.current?.setPointerCapture(event.pointerId);
                            }}
                          >
                            <Grip size={16} />
                          </button>
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
                            <strong>{learnerText(card.chinese)}</strong>
                          )}
                        </div>
                        <CanvasTable
                          card={card}
                          teacher={teacher}
                          hidden={englishHidden(card, teacher)}
                          selectedRow={
                            selected === card.id ? selectedRow : null
                          }
                          vocabulary={vocabulary}
                          highlightMode={highlightMode}
                          onSelect={(row) => selectCard(card.id, row.id)}
                          onChinese={(row, text) =>
                            changeRowChinese(card.id, row, text)
                          }
                          onComplete={(row, text, language) =>
                            void completeRow(card.id, row, text, language)
                          }
                          onPatch={(row, patch) =>
                            doc && patchTableRow(doc, card.id, row.id, patch)
                          }
                          onAnswerComplete={(row, text, language) =>
                            void completeAnswer(card.id, row, text, language)
                          }
                          onAnswer={(row, text) =>
                            changeAnswer(card.id, row, text)
                          }
                          onAdd={() =>
                            doc && addTableRow(doc, card.id, createTableRow())
                          }
                          onDelete={(row) => {
                            if (doc) deleteTableRow(doc, card.id, row.id);
                            if (selectedRow === row.id) setSelectedRow(null);
                          }}
                        />
                        {connectHandle(card)}
                        {resizeHandle(card)}
                      </article>
                    ) : card.kind === "sticker" ? (
                      <article
                        key={card.id}
                        data-testid="sticker-card"
                        className={`board-card sticker-card ${selectedItems.has(card.id) ? "selected" : ""}`}
                        data-card-id={card.id}
                        ref={(node) => {
                          if (node) cardElements.current.set(card.id, node);
                          else cardElements.current.delete(card.id);
                        }}
                        style={cardStyle(card)}
                        onClick={(event) => {
                          if (!gestureMoved.current)
                            selectCard(card.id, null, event.shiftKey, true);
                          gestureMoved.current = false;
                        }}
                        onPointerDown={(event) => startDrag(event, card)}
                      >
                        {card.sticker.startsWith("person-") ? (
                          <PersonAvatar
                            id={card.sticker.slice(7)}
                            name={card.sticker.slice(7)}
                          />
                        ) : (
                          <StickerArt
                            id={card.sticker}
                            selected={selectedItems.has(card.id)}
                          />
                        )}
                        {connectHandle(card)}
                        {resizeHandle(card)}
                      </article>
                    ) : (
                      <article
                        key={card.id}
                        data-testid="phrase-card"
                        tabIndex={0}
                        className={`board-card phrase-card shape-${card.shape} mode-${card.mode} ${card.kind === "note" ? "note-card" : ""} ${selectedItems.has(card.id) ? "selected" : ""}`}
                        data-card-id={card.id}
                        ref={(node) => {
                          if (node) cardElements.current.set(card.id, node);
                          else cardElements.current.delete(card.id);
                        }}
                        style={cardStyle(card)}
                        onClick={(event) => {
                          if (!gestureMoved.current)
                            selectCard(card.id, null, event.shiftKey, true);
                          gestureMoved.current = false;
                        }}
                        onPointerDown={(event) => {
                          if (
                            !(event.target as HTMLElement).closest(
                              ".card-handle",
                            )
                          )
                            startDrag(event, card);
                        }}
                      >
                        {card.kind === "phrase" && (
                          <button
                            className={`card-star ${card.starred ? "is-starred" : ""}`}
                            aria-label={
                              teacher && card.starred && card.savedBy !== "teacher"
                                ? "Approve saved phrase"
                                : card.starred
                                  ? "Unsave phrase"
                                  : "Save phrase"
                            }
                            onClick={(event) => {
                              event.stopPropagation();
                              if (!doc) return;
                              if (
                                teacher &&
                                card.starred &&
                                card.savedBy !== "teacher"
                              ) {
                                patchCard(doc, card.id, {
                                  savedBy: "teacher",
                                  syncState: "pending",
                                  syncMessage: "",
                                  receipt: "",
                                });
                                return;
                              }
                              if (card.starred) {
                                patchCard(doc, card.id, { starred: false });
                                removeJyutDeckOutboxItem(
                                  jyutDeckOutboxKey(session.id, card.id),
                                );
                              } else {
                                patchCard(doc, card.id, {
                                  starred: true,
                                  savedBy: role,
                                  syncState: "pending",
                                  syncMessage: "",
                                  receipt: "",
                                });
                              }
                            }}
                          >
                            <Star
                              size={14}
                              fill={card.starred ? "currentColor" : "none"}
                            />
                          </button>
                        )}
                        {card.kind === "note" ? (
                          editingCard === card.id ? (
                            <textarea
                              autoFocus
                              className="note-text in-place-note"
                              aria-label="Edit note in place"
                              placeholder="A little note…"
                              value={
                                teacher
                                  ? card.definition
                                  : learnerText(card.definition)
                              }
                              maxLength={4000}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) =>
                                doc &&
                                patchCard(doc, card.id, {
                                  definition: e.target.value,
                                })
                              }
                              onBlur={() =>
                                setEditingCard((current) =>
                                  current === card.id ? null : current,
                                )
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Escape") e.currentTarget.blur();
                              }}
                            />
                          ) : (
                            <div
                              className="note-text"
                              title="Double-click to edit"
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                setEditingCard(card.id);
                              }}
                            >
                              {(teacher
                                ? card.definition
                                : learnerText(card.definition)) || (
                                <span className="note-placeholder">
                                  A little note…
                                </span>
                              )}
                            </div>
                          )
                        ) : (
                          <>
                            <h2
                              className={
                                teacher ? "card-chinese" : "card-jyutping"
                              }
                              title="Double-click to edit"
                              onDoubleClick={(event) => {
                                event.stopPropagation();
                                setEditingCard(card.id);
                              }}
                            >
                              <InlineLanguage
                                value={teacher ? card.chinese : card.jyutping}
                                placeholder={
                                  teacher ? "Write Chinese…" : "Add Jyutping…"
                                }
                                label="Edit phrase in place"
                                words={card.words}
                                chinese={teacher}
                                snapshot={vocabulary}
                                mode={highlightMode}
                                selected={selectedItems.has(card.id)}
                                recent={now - card.created < 5000}
                                editing={editingCard === card.id}
                                autoFocus
                                onChange={(text) =>
                                  editPhraseInPlace(card, text)
                                }
                                onBlur={(text) => {
                                  setEditingCard((current) =>
                                    current === card.id ? null : current,
                                  );
                                  void completePhrase(card, text);
                                }}
                              />
                            </h2>
                            {card.mode === "full" && (
                              <p
                                className="card-english"
                                title="Double-click to edit meaning"
                              >
                                <InlineLanguage
                                  keepInput
                                  value={card.definition}
                                  placeholder="Meaning…"
                                  label="Phrase translation"
                                  words={[]}
                                  chinese={false}
                                  mode="off"
                                  selected={false}
                                  editing={editingCard === `${card.id}:english`}
                                  autoFocus
                                  onActivate={() =>
                                    setEditingCard(`${card.id}:english`)
                                  }
                                  onChange={(text) =>
                                    doc &&
                                    patchCard(doc, card.id, {
                                      definition: text,
                                      translation: "edited",
                                    })
                                  }
                                  onBlur={(text, changed) => {
                                    setEditingCard((current) =>
                                      current === `${card.id}:english`
                                        ? null
                                        : current,
                                    );
                                    if (changed && text.trim())
                                      void completePhrase(
                                        card,
                                        text,
                                        "english",
                                      );
                                  }}
                                />
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
                            {card.mode === "full" && card.note && (
                              <p className="card-note">
                                {teacher ? card.note : learnerText(card.note)}
                              </p>
                            )}
                            <div className="card-footer">
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
                            </div>
                          </>
                        )}
                        {connectHandle(card)}
                        {resizeHandle(card)}
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
                          {peer.role === "teacher" ? "🦝" : "🐻"}
                        </strong>
                        <small className="cursor-name">
                          {peer.role === "teacher" ? "Natasha" : "Leif"}
                        </small>
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
                <span ref={zoomLabel}>{Math.round(zoom * 100)}%</span>
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
            {peers.some((peer) => peer.draft) && (
              <div className="live-strip">
                {peers.map((peer) => (
                  <span key={peer.id}>
                    {peer.draft
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
              <div className="composer-entry">
                <select
                  className="composer-language"
                  aria-label="Input language"
                  value={sourceLanguage}
                  disabled={creatingPhrase}
                  onChange={(event) =>
                    setSourceLanguage(event.target.value as SourceLanguage)
                  }
                >
                  <option value="chinese">中文</option>
                  <option value="jyutping">Jyutping</option>
                  <option value="english">English</option>
                </select>
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
                <PushToTalk onPhrase={speechPhrase} notify={notify} />
                <button
                  className="primary"
                  type="submit"
                  disabled={!input.trim() || !doc || creatingPhrase}
                >
                  <Plus size={17} />{" "}
                  {creatingPhrase ? "Converting…" : "Add phrase"}
                </button>
              </div>
            </form>
          </section>
          {effectiveRightOpen && (
            <aside className="inspector">
              {selectedItems.size > 1 ? (
                <div className="inspector-block group-editor">
                  <div className="inspector-heading">
                    <h2>{selectedItems.size} elements</h2>
                    <button
                      aria-label="Close details"
                      onClick={() => setRightOpen(false)}
                    >
                      <X size={17} />
                    </button>
                  </div>
                  <p className="small-copy">
                    Changes apply to the selected elements. Drag any selected
                    item to move them together.
                  </p>
                  <div className="element-actions">
                    <button onClick={duplicateSelection}>
                      <CopyPlus size={14} /> Duplicate
                    </button>
                    <button onClick={removeSelected}>
                      <Trash2 size={14} /> Delete all
                    </button>
                  </div>
                  <div className="group-scale">
                    <button onClick={() => scaleSelection(0.9)}>Smaller</button>
                    <button onClick={() => scaleSelection(1.1)}>Larger</button>
                  </div>
                  {selectedCards.length === selectedItems.size && (
                    <>
                      <div className="element-actions">
                        <button onClick={() => alignSelection("x")}>
                          Align left
                        </button>
                        <button onClick={() => alignSelection("y")}>
                          Align top
                        </button>
                      </div>
                      {selectedCards.every(
                        (card) =>
                          card.kind !== "sticker" && card.mode !== "characters",
                      ) && (
                        <label>
                          Background for all
                          <input
                            aria-label="Group background"
                            type="color"
                            defaultValue="#ffffff"
                            onChange={(event) =>
                              patchSelection({ tint: event.target.value })
                            }
                          />
                        </label>
                      )}
                      {selectedCards.every((card) =>
                        ["phrase", "note"].includes(card.kind),
                      ) && (
                        <label>
                          Shape for all
                          <select
                            aria-label="Group shape"
                            defaultValue=""
                            onChange={(event) =>
                              patchSelection({
                                shape: event.target.value as Card["shape"],
                              })
                            }
                          >
                            <option value="" disabled>
                              Choose shape…
                            </option>
                            <option value="rounded">Rounded</option>
                            <option value="bubble">Speech bubble</option>
                          </select>
                        </label>
                      )}
                      {selectedCards.every(
                        (card) => card.kind === "phrase",
                      ) && (
                        <>
                          <label>
                            Card mode for all
                            <select
                              aria-label="Group card mode"
                              defaultValue=""
                              onChange={(event) =>
                                patchSelection({
                                  mode: event.target.value as CardMode,
                                  hideEnglishForLearner: false,
                                  height: 0,
                                })
                              }
                            >
                              <option value="" disabled>
                                Choose mode…
                              </option>
                              <option value="full">Standard</option>
                              <option value="peek">Compact</option>
                              <option value="practice">Practice</option>
                            </select>
                          </label>
                          <label>
                            Text size for all
                            <input
                              aria-label="Group text size"
                              type="range"
                              min="0.5"
                              max="3"
                              step="0.1"
                              defaultValue="1"
                              onChange={(event) =>
                                patchSelection({
                                  textScale: Number(event.target.value),
                                })
                              }
                            />
                          </label>
                        </>
                      )}
                      {selectedCards.length === 2 && (
                        <button
                          className="soft wide"
                          onClick={() =>
                            addConnector(
                              selectedCards[0].id,
                              selectedCards[1].id,
                            )
                          }
                        >
                          <Link2 size={14} /> Connect these elements
                        </button>
                      )}
                    </>
                  )}
                  {selectedCards.length === 0 && activeDrawing && (
                    <DrawingControls
                      color={activeDrawing.color}
                      width={activeDrawing.width ?? 3}
                      onColor={(color) => changeDrawing({ color })}
                      onWidth={(width) => changeDrawing({ width })}
                    />
                  )}
                </div>
              ) : activeDrawing ? (
                <div className="inspector-block">
                  <div className="inspector-heading">
                    <h2>Drawing</h2>
                    <button
                      aria-label="Close details"
                      onClick={() => setRightOpen(false)}
                    >
                      <X size={17} />
                    </button>
                  </div>
                  <p className="small-copy">
                    Click a mark to edit it. Press Delete to remove it.
                  </p>
                  <DrawingControls
                    color={activeDrawing.color}
                    width={activeDrawing.width ?? 3}
                    highlighter={
                      "opacity" in activeDrawing &&
                      Number(activeDrawing.opacity) < 1
                    }
                    onColor={(color) => changeDrawing({ color })}
                    onWidth={(width) => changeDrawing({ width })}
                  />
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
                        : active.kind === "conversation"
                          ? "Conversation"
                          : active.kind === "note"
                            ? "Note"
                            : active.kind === "sticker"
                              ? "Sticker"
                              : "Phrase"}
                    </h2>
                    <button
                      aria-label="Close details"
                      onClick={() => setRightOpen(false)}
                    >
                      <X size={17} />
                    </button>
                  </div>
                  <div className="element-actions">
                    <button onClick={duplicateSelection}>
                      <CopyPlus size={13} /> Duplicate
                    </button>
                    <button
                      aria-label="Delete element"
                      onClick={removeSelected}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  {active.kind === "conversation" && (
                    <label>
                      Conversation mode
                      <select
                        aria-label="Conversation mode"
                        value={active.mode}
                        onChange={(e) => {
                          if (doc)
                            doc.transact(() => {
                              patchCard(doc, active.id, {
                                mode: e.target.value as Card["mode"],
                                hideEnglishForLearner: false,
                                height: 0,
                              });
                              active.rows.forEach((row) =>
                                patchTableRow(doc, active.id, row.id, {
                                  mode: e.target.value as Card["mode"],
                                }),
                              );
                            });
                        }}
                      >
                        <option value="full">Standard</option>
                        <option value="peek">Compact</option>
                        <option value="practice">Practice</option>
                      </select>
                    </label>
                  )}
                  {active.kind === "table" && (
                    <>
                      <label>
                        Table layout
                        <select
                          aria-label="Table layout"
                          value={active.tableVariant}
                          onChange={(e) =>
                            doc &&
                            patchCard(doc, active.id, {
                              tableVariant: e.target
                                .value as Card["tableVariant"],
                            })
                          }
                        >
                          <option value="phrases">Phrase list</option>
                          <option value="vocabulary">Vocabulary</option>
                          <option value="pattern">Patterns</option>
                          <option value="qa">Question / answer</option>
                          <option value="comparison">Comparison</option>
                        </select>
                      </label>
                      <label>
                        Table appearance
                        <select
                          aria-label="Table appearance"
                          value={active.tableStyle}
                          onChange={(e) =>
                            doc &&
                            patchCard(doc, active.id, {
                              tableStyle: e.target.value as Card["tableStyle"],
                            })
                          }
                        >
                          <option value="minimal">Minimal</option>
                          <option value="ruled">Ruled</option>
                          <option value="cards">Soft rows</option>
                        </select>
                      </label>
                    </>
                  )}
                  <details className="size-options">
                    <summary>
                      <Scaling size={13} /> Size & style
                    </summary>
                    <div className="size-fields">
                      <label>
                        Width
                        <input
                          aria-label="Element width"
                          type="number"
                          min="60"
                          max="1400"
                          value={Math.round(cardBox(active).width)}
                          onChange={(event) =>
                            setElementSize(
                              active,
                              "width",
                              Number(event.target.value),
                            )
                          }
                        />
                      </label>
                      <label>
                        Height
                        <input
                          aria-label="Element height"
                          type="number"
                          min="45"
                          max="1400"
                          value={Math.round(cardBox(active).height)}
                          onChange={(event) =>
                            setElementSize(
                              active,
                              "height",
                              Number(event.target.value),
                            )
                          }
                        />
                      </label>
                    </div>
                    {active.kind !== "sticker" && (
                      <label>
                        Text size
                        <input
                          aria-label="Text size"
                          type="range"
                          min="0.5"
                          max="3"
                          step="0.1"
                          value={active.textScale}
                          onChange={(event) =>
                            doc &&
                            patchCard(doc, active.id, {
                              textScale: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                    )}
                    {active.kind !== "sticker" &&
                      active.mode !== "characters" && (
                        <label>
                          Background
                          <input
                            aria-label="Element background"
                            type="color"
                            value={active.tint || "#ffffff"}
                            onChange={(event) =>
                              doc &&
                              patchCard(doc, active.id, {
                                tint: event.target.value,
                              })
                            }
                          />
                        </label>
                      )}
                    <small>
                      Drag the corner to resize. Stickers keep their
                      proportions.
                    </small>
                  </details>
                  {["table", "conversation"].includes(active.kind) ? (
                    <>
                      <p className="small-copy">
                        {active.kind === "conversation"
                          ? "Build a dialogue together. Select a turn to edit its words."
                          : "Dense phrases for a live lesson. Select a row to edit its parts."}
                      </p>
                      <label>
                        {active.kind === "conversation"
                          ? "Dialogue title"
                          : "Table title"}
                        <input
                          aria-label={
                            active.kind === "conversation"
                              ? "Dialogue title in details"
                              : "Table title in details"
                          }
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

                      <button
                        className="soft wide"
                        onClick={() =>
                          doc && addTableRow(doc, active.id, createTableRow())
                        }
                      >
                        <Plus size={14} />{" "}
                        {active.kind === "conversation"
                          ? "Add dialogue turn"
                          : "Add table row"}
                      </button>
                      {activeRow && (
                        <div className="row-detail">
                          <h3>
                            {active.kind === "conversation"
                              ? "Selected turn"
                              : "Selected row"}
                          </h3>
                          <p className="detail-primary">
                            {teacher ? activeRow.chinese : activeRow.jyutping}
                          </p>
                          {!hidden && (
                            <label>
                              English translation
                              <textarea
                                value={activeRow.definition}
                                onFocus={(event) => {
                                  event.currentTarget.dataset.original =
                                    event.currentTarget.value;
                                }}
                                onBlur={(event) => {
                                  if (
                                    event.currentTarget.value !==
                                    event.currentTarget.dataset.original
                                  )
                                    void completeRow(
                                      active.id,
                                      activeRow,
                                      event.currentTarget.value,
                                      "english",
                                    );
                                }}
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
                          {active.kind === "conversation" && teacher && (
                            <AudioRecorder
                              audio={activeRow.audio}
                              onAudio={(audio, audioName) =>
                                doc &&
                                patchTableRow(doc, active.id, activeRow.id, {
                                  audio,
                                  audioName,
                                })
                              }
                              notify={notify}
                            />
                          )}
                          {active.kind === "conversation" && (
                            <>
                              <button
                                onClick={() => {
                                  if (!doc) return;
                                  if (
                                    teacher &&
                                    activeRow.starred &&
                                    activeRow.savedBy !== "teacher"
                                  ) {
                                    patchTableRow(doc, active.id, activeRow.id, {
                                      savedBy: "teacher",
                                      syncState: "pending",
                                      syncMessage: "",
                                      receipt: "",
                                    });
                                    return;
                                  }
                                  if (activeRow.starred) {
                                    patchTableRow(doc, active.id, activeRow.id, {
                                      starred: false,
                                    });
                                    removeJyutDeckOutboxItem(
                                      jyutDeckOutboxKey(session.id, activeRow.id),
                                    );
                                  } else {
                                    patchTableRow(doc, active.id, activeRow.id, {
                                      starred: true,
                                      savedBy: role,
                                      syncState: "pending",
                                      syncMessage: "",
                                      receipt: "",
                                    });
                                  }
                                }}
                              >
                                <Star size={14} />
                                {teacher &&
                                activeRow.starred &&
                                activeRow.savedBy !== "teacher"
                                  ? "Approve for JyutDeck"
                                  : activeRow.starred
                                    ? "Unsave bubble"
                                    : "Save bubble"}
                              </button>
                              {activeRow.starred && (
                                <p className="receipt">{syncLabel(activeRow)}</p>
                              )}
                            </>
                          )}
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
                    <StickerLibrary
                      selected={active.sticker}
                      onPick={(value) =>
                        doc && patchCard(doc, active.id, { sticker: value })
                      }
                    />
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
                          onBlur={(event) =>
                            void completePhrase(
                              active,
                              event.currentTarget.value,
                            )
                          }
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
                          onBlur={(event) => {
                            if (
                              event.currentTarget.value !==
                              event.currentTarget.dataset.original
                            )
                              void completePhrase(
                                active,
                                event.currentTarget.value,
                              );
                          }}
                          onFocus={(event) => {
                            event.currentTarget.dataset.original =
                              event.currentTarget.value;
                          }}
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
                  {["phrase", "table"].includes(active.kind) && (
                    <div className="appearance">
                      <h3>
                        {active.kind === "table"
                          ? "Table appearance"
                          : "Card appearance"}
                      </h3>
                      <CardBorder
                        card={active}
                        onChange={(patch) =>
                          doc && patchCard(doc, active.id, patch)
                        }
                      />
                      <div className="fill-presets" aria-label="Card fill">
                        {[
                          ["", "Transparent"],
                          ["#ffffff", "White"],
                          ["#eef3fa", "Mist"],
                          ["#f1eef8", "Lavender"],
                          ["#eef5f0", "Sage"],
                          ["#fbf3e7", "Sand"],
                        ].map(([tint, label]) => (
                          <button
                            key={label}
                            title={label}
                            aria-label={`${label} fill`}
                            aria-pressed={active.tint === tint}
                            style={{ backgroundColor: tint || "transparent" }}
                            onClick={() =>
                              doc && patchCard(doc, active.id, { tint })
                            }
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <p className="small-copy">
                        Choose how this item appears in the shared lesson.
                      </p>
                      <div className="option-label">Mode</div>
                      <div className="choice-grid">
                        {(
                          [
                            ["full", "Standard", "Language + English"],
                            ["peek", "Compact", "Meaning on hover or tap"],
                            ["practice", "Practice", "Language only"],
                          ] as [CardMode, string, string][]
                        ).map(([mode, label, hint]) => (
                          <button
                            key={mode}
                            className={active.mode === mode ? "chosen" : ""}
                            title={hint}
                            onClick={() =>
                              doc &&
                              patchCard(doc, active.id, {
                                mode,
                                hideEnglishForLearner: false,
                                height: 0,
                              })
                            }
                          >
                            <strong>{label}</strong>
                            <small>{hint}</small>
                          </button>
                        ))}
                      </div>
                      {active.kind === "phrase" && (
                        <>
                          <div className="option-label">Shape</div>
                          <div className="shape-choices">
                            {(
                              [
                                ["rounded", "Simple phrase"],
                                ["bubble", "Speech bubble"],
                              ] as [CardShape, string][]
                            ).map(([shape, label]) => (
                              <button
                                key={shape}
                                className={
                                  active.shape === shape ? "chosen" : ""
                                }
                                onClick={() =>
                                  doc && patchCard(doc, active.id, { shape })
                                }
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  {(active.kind === "phrase" ||
                    (["table", "conversation"].includes(active.kind) &&
                      activeRow)) && (
                    <WordBreakdown
                      verified={Boolean(vocabulary)}
                      words={wordList.map((word) => ({
                        ...word,
                        state: vocabularyState(word, vocabulary),
                      }))}
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
                      {active.starred && (
                        <p className="receipt">{syncLabel(active)}</p>
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
                <p className="small-copy">
                  Saved phrases sync to JyutDeck automatically.
                </p>
                <div className="tray">
                  {stars.length ? (
                    stars.map((card) => (
                      <button
                        key={card.id}
                        className="tray-item"
                        onClick={() => {
                          const parent = cards.find(
                            (item) =>
                              item.kind === "conversation" &&
                              item.rows.some((row) => row.id === card.id),
                          );
                          selectCard(
                            parent?.id ?? card.id,
                            parent ? card.id : null,
                          );
                          const target = parent ?? card;
                          const bounds = cardBox(target);
                          centerView(
                            bounds.x + bounds.width / 2,
                            bounds.y + bounds.height / 2,
                          );
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
                          {card.starred && (
                            <small className="receipt">{syncLabel(card)}</small>
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
          vocabularyMessage={vocabularyMessage}
          live={peers.length > 0}
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
              <h2>
                {window.desktop?.web
                  ? "Join your teaching desk"
                  : "A desk for two"}
              </h2>
              <button
                aria-label="Close sharing"
                onClick={() => setSharing(false)}
              >
                <X size={18} />
              </button>
            </div>
            {window.desktop?.web && (
              <div className="segmented join-roles">
                <button
                  className={!teacher ? "active" : ""}
                  onClick={() => setRole("learner")}
                >
                  Leif · Jyutping
                </button>
                <button
                  className={teacher ? "active" : ""}
                  onClick={() => setRole("teacher")}
                >
                  Natasha · 中文
                </button>
              </div>
            )}
            <p>
              Each person chooses their own view. Cards, tables, drawings, saved
              phrases, and recordings stay together.
            </p>
            {!window.desktop?.web && (
              <>
                <div className="share-step">
                  <span>01</span>
                  <div>
                    <h3>Invite Natasha or Leif</h3>
                    <p>
                      Choose Internet lesson for different Wi-Fi networks. Send
                      the private invitation and keep the host app open. Your
                      partner pastes it below and joins.
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
                  No account or network setup. This beta uses a temporary
                  Cloudflare connection; start a new invitation if the host app
                  restarts.
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
                    {session.relay?.startsWith("wss://") && (
                      <label>
                        iPad / browser invitation
                        <input
                          aria-label="iPad invitation"
                          readOnly
                          value={webInvitation(session.id, session.relay)}
                          onFocus={(e) => e.target.select()}
                        />
                        <button
                          onClick={() =>
                            void copyInvitation(
                              webInvitation(session.id, session.relay!),
                            )
                              .then(() => notify("iPad link copied."))
                              .catch(() =>
                                notify("Select and copy the invitation above."),
                              )
                          }
                        >
                          <Copy size={15} /> Copy iPad link
                        </button>
                      </label>
                    )}
                    <label>
                      Private invitation
                      <input
                        aria-label="Private invitation"
                        readOnly
                        value={invite}
                        onFocus={(e) => e.target.select()}
                      />
                    </label>
                    <button
                      onClick={() =>
                        void copyInvitation(invite)
                          .then(() => notify("Invitation copied."))
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
                  Anyone with the invitation can edit the room. Local ws://
                  traffic is unencrypted; use a trusted network or WSS/VPN. The
                  relay operator can read room contents.
                </small>
              </>
            )}
            <hr />
            <div className="share-step">
              <span>02</span>
              <div>
                <h3>Join an existing lesson</h3>
                <p>
                  Open your partner’s iPad link or paste their invitation. Next
                  time, just tap Join {teacher ? "Leif" : "Natasha"}.
                </p>
                {window.desktop?.web && (
                  <p className="install-tip">
                    In Safari, tap Share → Add to Home Screen to install
                    JyutBoard. Pencil draws; fingers pan in drawing tools. Use
                    Lasso to circle cards or ink, then drag the selection.
                  </p>
                )}
              </div>
            </div>
            {paired && (
              <div className="row">
                <button
                  onClick={() => void joinPartner()}
                  disabled={sharingBusy}
                >
                  {paired.host
                    ? "Open our room"
                    : teacher
                      ? "Join Leif"
                      : "Join Natasha"}
                </button>
                <button
                  onClick={() =>
                    void window.desktop
                      ?.pair({ action: "forget" })
                      .then(() => setPaired(null))
                  }
                >
                  Forget pairing
                </button>
              </div>
            )}
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
