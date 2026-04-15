/*
 * match-analysis.jsx — Tactical match analysis tool
 * frontendneeded.com/match-analysis
 *
 * This is a React component loaded via CDN (no build step).
 * React, ReactDOM, and Babel are loaded as global scripts in the HTML,
 * so we destructure hooks from the global React object instead of
 * using import statements.
 *
 * Data persistence uses localStorage (the browser's built-in key-value
 * store) instead of the Claude artifact window.storage API.
 */

/* eslint-disable no-unused-vars */
var { useState, useRef, useCallback, useEffect, useReducer } = React;

/* ═══════════════════════════════════════════════════════════
   THEME
   ═══════════════════════════════════════════════════════════ */
var C = {
    bg: "#0f1410", bgCard: "#161e14", bgInput: "#1a2316", bgHover: "#1e2a1a",
    border: "#2a3824", borderActive: "#3a4a30",
    accent: "#b8e636", accentDim: "rgba(184,230,54,0.15)",
    blue: "#4a9eff", blueDim: "rgba(74,158,255,0.15)",
    red: "#ff6b5a", redDim: "rgba(255,107,90,0.15)",
    yellow: "#ffd44a",
    text: "#d0dbc4", textMuted: "#7a8c6c", textDim: "#4a5c3e",
    pitch: "#1e2e18", pitchLine: "#3a5a2e",
    font: "'Saira', sans-serif", fontCond: "'Saira Condensed', sans-serif",
};

var FONT_LINK = "https://fonts.googleapis.com/css2?family=Saira:wght@300;400;500;600;700;800&family=Saira+Condensed:wght@400;500;600;700;800&display=swap";

var INITIAL_DATA = {
    match: { opponent: "", ourTeam: "", date: "", formationIn: "", formationOut: "", dangerPlayers: "" },
    boards: [{ id: "b1", name: "Formation", markers: [], arrows: [] }],
    activeBoard: "b1",
    scouting: {
        buildUp: {}, progression: {}, pressing: {}, block: {},
        posTransition: {}, negTransition: {},
        setPieces: [{ type: null, side: null, notes: "", minute: "" }],
    },
    momentum: {},
    observations: [],
    summary: { problems: "", opportunities: "", notes: "" },
};

var _id = Date.now();
var uid = function () { return "" + (++_id); };

var STORAGE_KEY = "match-analysis-v3";

/* ═══════════════════════════════════════════════════════════
   AUTO-SAVE using localStorage
   ═══════════════════════════════════════════════════════════

   localStorage is the browser's built-in key-value store.
   Unlike the Claude artifact API (window.storage), it's
   synchronous and doesn't need async/await.

   - localStorage.setItem(key, value)  → save a string
   - localStorage.getItem(key)         → get a string (or null)
   - localStorage.removeItem(key)      → delete a key

   We still debounce saves (wait 600ms of inactivity) so we're
   not writing to disk on every single keystroke.
   ═══════════════════════════════════════════════════════════ */
function useAutoSave(data, loaded) {
    var dataRef = useRef(data);
    dataRef.current = data;
    var tick = useRef(0);

    useEffect(function () {
        if (!loaded) return;
        tick.current++;
        var snap = tick.current;
        var t = setTimeout(function () {
            if (snap !== tick.current) return;
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(dataRef.current));
            } catch (e) {
                console.warn("Auto-save failed", e);
            }
        }, 600);
        return function () { clearTimeout(t); };
    }, [data, loaded]);
}

function loadSaved() {
    try {
        var raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

function clearSaved() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
}

/* ═══════════════════════════════════════════════════════════
   MATCH CLOCK
   ═══════════════════════════════════════════════════════════ */
function useMatchClock() {
    var _s = useState(0), seconds = _s[0], setSeconds = _s[1];
    var _r = useState(false), running = _r[0], setRunning = _r[1];
    var _h = useState(1), half = _h[0], setHalf = _h[1];
    var interval = useRef(null);

    useEffect(function () {
        if (running) {
            interval.current = setInterval(function () { setSeconds(function (s) { return s + 1; }); }, 1000);
        } else { clearInterval(interval.current); }
        return function () { clearInterval(interval.current); };
    }, [running]);

    var minute = Math.floor(seconds / 60) + (half === 2 ? 45 : 0);
    var toggle = function () { setRunning(function (r) { return !r; }); };
    var reset = function () { setSeconds(0); setRunning(false); };
    var startSecondHalf = function () { setHalf(2); setSeconds(0); setRunning(true); };

    return { minute: minute, seconds: seconds % 60, running: running, half: half, toggle: toggle, reset: reset, startSecondHalf: startSecondHalf };
}

/* ═══════════════════════════════════════════════════════════
   BOARD HISTORY REDUCER
   ═══════════════════════════════════════════════════════════ */
function boardReducer(state, action) {
    switch (action.type) {
        case "INIT":
            return { current: action.board, history: [], future: [] };
        case "DO":
            return {
                current: action.board,
                history: state.history.slice(-30).concat([state.current]),
                future: [],
            };
        case "UNDO": {
            if (!state.history.length) return state;
            return {
                current: state.history[state.history.length - 1],
                history: state.history.slice(0, -1),
                future: [state.current].concat(state.future),
            };
        }
        case "REDO": {
            if (!state.future.length) return state;
            return {
                current: state.future[0],
                history: state.history.concat([state.current]),
                future: state.future.slice(1),
            };
        }
        default:
            return state;
    }
}

/* ═══════════════════════════════════════════════════════════
   SMALL REUSABLE COMPONENTS
   ═══════════════════════════════════════════════════════════ */
function ToggleGroup(_ref) {
    var options = _ref.options, value = _ref.value, onChange = _ref.onChange, multi = _ref.multi || false;
    var handle = function (opt) {
        if (multi) {
            var a = value || [];
            onChange(a.includes(opt) ? a.filter(function (v) { return v !== opt; }) : a.concat([opt]));
        } else { onChange(value === opt ? null : opt); }
    };
    return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }} role="group">
            {options.map(function (opt) {
                var on = multi ? (value || []).includes(opt) : value === opt;
                return (
                    <button key={opt} onClick={function () { handle(opt); }} role={multi ? "checkbox" : "radio"}
                        aria-checked={on} style={{
                            padding: "7px 13px", fontSize: 13, border: "1px solid",
                            borderColor: on ? C.accent : C.border, borderRadius: 4, cursor: "pointer",
                            background: on ? C.accentDim : "transparent",
                            color: on ? C.accent : C.textMuted, fontFamily: C.font, fontWeight: on ? 600 : 400,
                            transition: "all 0.12s", minHeight: 40, minWidth: 44,
                        }}>{opt}</button>
                );
            })}
        </div>
    );
}

function Field(_ref) {
    var label = _ref.label, value = _ref.value, onChange = _ref.onChange, placeholder = _ref.placeholder, multiline = _ref.multiline, minute = _ref.minute, onMinuteChange = _ref.onMinuteChange;
    var shared = {
        value: value || "", onChange: function (e) { onChange(e.target.value); },
        placeholder: placeholder || "",
        style: {
            width: "100%", padding: "8px 11px", fontSize: 14, background: C.bgInput,
            border: "1px solid " + C.border, borderRadius: 4, color: C.text,
            fontFamily: C.font, resize: multiline ? "vertical" : "none",
            minHeight: multiline ? 60 : "auto", outline: "none", boxSizing: "border-box",
        },
    };
    return (
        <div style={{ marginBottom: 10 }}>
            {label && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <label style={{
                        fontSize: 11, color: C.textMuted, fontFamily: C.fontCond,
                        textTransform: "uppercase", letterSpacing: 1
                    }}>{label}</label>
                    {onMinuteChange !== undefined && (
                        <input value={minute || ""} onChange={function (e) { onMinuteChange(e.target.value); }}
                            placeholder="min" aria-label={"Minute for " + label}
                            style={{
                                width: 48, padding: "3px 6px", fontSize: 11, textAlign: "center",
                                background: C.bgInput, border: "1px solid " + C.border, borderRadius: 3,
                                color: C.yellow, fontFamily: C.fontCond, outline: "none"
                            }} />
                    )}
                </div>
            )}
            {multiline ? <textarea {...shared} rows={3} /> : <input {...shared} />}
        </div>
    );
}

function Section(_ref) {
    var title = _ref.title, icon = _ref.icon, children = _ref.children, isOpen = _ref.isOpen, onToggle = _ref.onToggle, color = _ref.color || C.accent;
    return (
        <div style={{
            marginBottom: 6, borderRadius: 6, overflow: "hidden",
            border: "1px solid " + (isOpen ? color + "33" : C.bgCard), background: C.bgCard
        }}>
            <button onClick={onToggle} aria-expanded={isOpen} style={{
                width: "100%", padding: "13px 14px", display: "flex", alignItems: "center",
                gap: 10, background: isOpen ? C.bgHover : "transparent", border: "none",
                cursor: "pointer", textAlign: "left"
            }}>
                <span style={{ fontSize: 16, width: 24, textAlign: "center" }}>{icon}</span>
                <span style={{
                    flex: 1, fontSize: 13, fontWeight: 700, color: isOpen ? color : C.textMuted,
                    fontFamily: C.fontCond, textTransform: "uppercase", letterSpacing: 1.5
                }}>{title}</span>
                <span style={{
                    fontSize: 16, color: C.textDim,
                    transform: isOpen ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s"
                }}>▾</span>
            </button>
            {isOpen && <div style={{ padding: "10px 14px 14px" }}>{children}</div>}
        </div>
    );
}

function Label(_ref) {
    return <div style={{
        fontSize: 11, color: C.textMuted, fontFamily: C.fontCond,
        textTransform: "uppercase", letterSpacing: 1, marginBottom: 5
    }}>{_ref.children}</div>;
}
function Spacer() { return <div style={{ height: 10 }} />; }

/* ═══════════════════════════════════════════════════════════
   ACTION MENU
   ── CHANGED: now expands horizontally to the left instead
      of dropping down behind the pitch SVG.
   ═══════════════════════════════════════════════════════════ */
function ActionMenu(_ref) {
    var onUndo = _ref.onUndo, onRedo = _ref.onRedo, onClear = _ref.onClear, canUndo = _ref.canUndo, canRedo = _ref.canRedo;
    var _s = useState(false), open = _s[0], setOpen = _s[1];
    var ref = useRef(null);

    useEffect(function () {
        if (!open) return;
        var handler = function (e) {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener("pointerdown", handler);
        return function () { document.removeEventListener("pointerdown", handler); };
    }, [open]);

    var items = [
        { label: "↩  Undo", action: onUndo, disabled: !canUndo },
        { label: "↪  Redo", action: onRedo, disabled: !canRedo },
        { label: "⌫  Clear All", action: onClear, color: C.red },
    ];

    return (
        <div ref={ref} style={{ position: "relative" }}>
            <button onClick={function () { setOpen(!open); }} aria-label="Board actions" aria-expanded={open}
                style={{
                    padding: "7px 10px", fontSize: 16, background: open ? C.bgHover : "transparent",
                    border: "1px solid " + C.border, color: C.textMuted, borderRadius: 4,
                    cursor: "pointer", minHeight: 36, lineHeight: 1,
                }}>⋯</button>
            {open && (
                <div style={{
                    position: "absolute", top: "50%", right: "calc(100% + 6px)", transform: "translateY(-50%)", zIndex: 50,
                    background: C.bgCard, border: "1px solid " + C.borderActive, borderRadius: 6,
                    boxShadow: "-4px 4px 24px rgba(0,0,0,0.5)", display: "flex", overflow: "hidden",
                }}>
                    {items.map(function (item, i) {
                        return (
                            <button key={i} disabled={item.disabled}
                                onClick={function () { item.action(); setOpen(false); }}
                                style={{
                                    padding: "9px 14px", fontSize: 12, fontFamily: C.fontCond,
                                    fontWeight: 600, textAlign: "center", background: "transparent", border: "none",
                                    borderRight: i < items.length - 1 ? "1px solid " + C.border : "none",
                                    color: item.disabled ? C.textDim : (item.color || C.text),
                                    cursor: item.disabled ? "default" : "pointer",
                                    opacity: item.disabled ? 0.4 : 1, whiteSpace: "nowrap",
                                }}>{item.label}</button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════
   PITCH SVG
   ═══════════════════════════════════════════════════════════ */
function PitchSVG(_ref) {
    var children = _ref.children, svgRef = _ref.svgRef, onPointerDown = _ref.onPointerDown, onPointerMove = _ref.onPointerMove, onPointerUp = _ref.onPointerUp;
    return (
        <svg ref={svgRef} viewBox="0 0 700 460" preserveAspectRatio="xMidYMid meet"
            style={{
                width: "100%", height: "100%", background: C.pitch,
                borderRadius: 6, border: "2px solid " + C.border, touchAction: "none", display: "block",
            }}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
        >
            <defs>
                <marker id="ah" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0,10 3.5,0 7" fill={C.yellow} /></marker>
                <marker id="ah-ghost" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0,10 3.5,0 7" fill={C.yellow} opacity="0.5" /></marker>
            </defs>
            <rect x="30" y="20" width="640" height="420" fill="none" stroke={C.pitchLine} strokeWidth="2" />
            <line x1="350" y1="20" x2="350" y2="440" stroke={C.pitchLine} strokeWidth="2" />
            <circle cx="350" cy="230" r="62" fill="none" stroke={C.pitchLine} strokeWidth="2" />
            <circle cx="350" cy="230" r="3" fill={C.pitchLine} />
            <rect x="30" y="125" width="115" height="210" fill="none" stroke={C.pitchLine} strokeWidth="2" />
            <rect x="30" y="178" width="46" height="104" fill="none" stroke={C.pitchLine} strokeWidth="2" />
            <circle cx="145" cy="230" r="3" fill={C.pitchLine} />
            <path d="M 145 185 A 45 45 0 0 1 145 275" fill="none" stroke={C.pitchLine} strokeWidth="2" />
            <rect x="555" y="125" width="115" height="210" fill="none" stroke={C.pitchLine} strokeWidth="2" />
            <rect x="624" y="178" width="46" height="104" fill="none" stroke={C.pitchLine} strokeWidth="2" />
            <circle cx="555" cy="230" r="3" fill={C.pitchLine} />
            <path d="M 555 185 A 45 45 0 0 0 555 275" fill="none" stroke={C.pitchLine} strokeWidth="2" />
            <path d="M 30 30 A 10 10 0 0 1 40 20" fill="none" stroke={C.pitchLine} strokeWidth="2" />
            <path d="M 660 20 A 10 10 0 0 1 670 30" fill="none" stroke={C.pitchLine} strokeWidth="2" />
            <path d="M 40 440 A 10 10 0 0 1 30 430" fill="none" stroke={C.pitchLine} strokeWidth="2" />
            <path d="M 670 430 A 10 10 0 0 1 660 440" fill="none" stroke={C.pitchLine} strokeWidth="2" />
            <rect x="14" y="200" width="16" height="60" fill="none" stroke={C.pitchLine} strokeWidth="1.5" rx="2" />
            <rect x="670" y="200" width="16" height="60" fill="none" stroke={C.pitchLine} strokeWidth="1.5" rx="2" />
            {children}
        </svg>
    );
}

/* ═══════════════════════════════════════════════════════════
   TACTICAL BOARD
   ═══════════════════════════════════════════════════════════ */
function TacticalBoard(_ref) {
    var boards = _ref.boards, activeBoard = _ref.activeBoard, onUpdate = _ref.onUpdate, onSetActive = _ref.onSetActive, onAddBoard = _ref.onAddBoard, onRenameBoard = _ref.onRenameBoard, onDeleteBoard = _ref.onDeleteBoard;
    var svgRef = useRef(null);
    var _t = useState("o"), tool = _t[0], setTool = _t[1];
    var _a = useState(null), arrowDraft = _a[0], setArrowDraft = _a[1];
    var _e = useState(null), editingName = _e[0], setEditingName = _e[1];
    var _n = useState(null), newMarkerId = _n[0], setNewMarkerId = _n[1];

    var _d = useState(null), dragPos = _d[0], setDragPos = _d[1];
    var dragRef = useRef(null);

    var boardObj = boards.find(function (b) { return b.id === activeBoard; }) || boards[0];

    var _br = useReducer(boardReducer, {
        current: { markers: boardObj ? boardObj.markers : [], arrows: boardObj ? boardObj.arrows : [] },
        history: [], future: [],
    }), boardState = _br[0], dispatch = _br[1];

    var prevBoardId = useRef(activeBoard);
    useEffect(function () {
        if (activeBoard !== prevBoardId.current) {
            var b = boards.find(function (bb) { return bb.id === activeBoard; }) || boards[0];
            if (b) dispatch({ type: "INIT", board: { markers: b.markers, arrows: b.arrows } });
            prevBoardId.current = activeBoard;
        }
    }, [activeBoard, boards]);

    var cur = boardState.current;

    var syncToParent = useCallback(function (newBoard) {
        if (boardObj) onUpdate(boardObj.id, { ...boardObj, markers: newBoard.markers, arrows: newBoard.arrows });
    }, [boardObj, onUpdate]);

    var doAction = useCallback(function (newBoard) {
        dispatch({ type: "DO", board: newBoard });
        syncToParent(newBoard);
    }, [syncToParent]);

    var handleUndo = useCallback(function () {
        if (!boardState.history.length) return;
        var prev = boardState.history[boardState.history.length - 1];
        dispatch({ type: "UNDO" });
        syncToParent(prev);
    }, [boardState.history, syncToParent]);

    var handleRedo = useCallback(function () {
        if (!boardState.future.length) return;
        var next = boardState.future[0];
        dispatch({ type: "REDO" });
        syncToParent(next);
    }, [boardState.future, syncToParent]);

    var handleClear = useCallback(function () {
        var empty = { markers: [], arrows: [] };
        doAction(empty);
    }, [doAction]);

    useEffect(function () {
        if (!newMarkerId) return;
        var t = setTimeout(function () { setNewMarkerId(null); }, 500);
        return function () { clearTimeout(t); };
    }, [newMarkerId]);

    var getSVGPoint = useCallback(function (e) {
        var svg = svgRef.current;
        if (!svg) return { x: 0, y: 0 };
        var pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        var transformed = pt.matrixTransform(svg.getScreenCTM().inverse());
        return { x: transformed.x, y: transformed.y };
      }, []);

    var hitMarker = useCallback(function (pt, markers, r) {
        r = r || 20;
        return markers.slice().reverse().find(function (m) { return Math.hypot(m.x - pt.x, m.y - pt.y) < r; });
    }, []);

    var hitArrow = useCallback(function (pt, arrows) {
        return arrows.slice().reverse().find(function (a) {
            var mx = (a.x1 + a.x2) / 2, my = (a.y1 + a.y2) / 2;
            return Math.hypot(mx - pt.x, my - pt.y) < 25;
        });
    }, []);

    var handlePointerDown = useCallback(function (e) {
        e.preventDefault();
        if (svgRef.current && svgRef.current.setPointerCapture) svgRef.current.setPointerCapture(e.pointerId);
        var pt = getSVGPoint(e);

        if (tool === "x" || tool === "o") {
            var id = uid();
            var newBoard = { ...cur, markers: cur.markers.concat([{ id: id, type: tool, x: pt.x, y: pt.y }]) };
            doAction(newBoard);
            setNewMarkerId(id);
        } else if (tool === "arrow") {
            setArrowDraft({ x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y });
        } else if (tool === "select") {
            var hit = hitMarker(pt, cur.markers);
            if (hit) {
                dragRef.current = { id: hit.id, ox: pt.x - hit.x, oy: pt.y - hit.y };
                setDragPos({ id: hit.id, x: hit.x, y: hit.y });
            }
        } else if (tool === "erase") {
            var hitM = hitMarker(pt, cur.markers);
            if (hitM) { doAction({ ...cur, markers: cur.markers.filter(function (m) { return m.id !== hitM.id; }) }); return; }
            var hitA = hitArrow(pt, cur.arrows);
            if (hitA) { doAction({ ...cur, arrows: cur.arrows.filter(function (a) { return a.id !== hitA.id; }) }); }
        }
    }, [tool, cur, doAction, getSVGPoint, hitMarker, hitArrow]);

    var handlePointerMove = useCallback(function (e) {
        e.preventDefault();
        var pt = getSVGPoint(e);
        if (dragRef.current && tool === "select") {
            setDragPos({ id: dragRef.current.id, x: pt.x - dragRef.current.ox, y: pt.y - dragRef.current.oy });
        } else if (arrowDraft && tool === "arrow") {
            setArrowDraft(function (a) { return a ? { ...a, x2: pt.x, y2: pt.y } : null; });
        }
    }, [tool, arrowDraft, getSVGPoint]);

    var handlePointerUp = useCallback(function (e) {
        if (arrowDraft && tool === "arrow") {
            if (Math.hypot(arrowDraft.x2 - arrowDraft.x1, arrowDraft.y2 - arrowDraft.y1) > 15) {
                doAction({ ...cur, arrows: cur.arrows.concat([{ id: uid(), x1: arrowDraft.x1, y1: arrowDraft.y1, x2: arrowDraft.x2, y2: arrowDraft.y2 }]) });
            }
            setArrowDraft(null);
        }
        if (dragRef.current && dragPos) {
            var finalMarkers = cur.markers.map(function (m) {
                return m.id === dragPos.id ? { ...m, x: dragPos.x, y: dragPos.y } : m;
            });
            doAction({ ...cur, markers: finalMarkers });
            dragRef.current = null;
            setDragPos(null);
        }
        if (svgRef.current && svgRef.current.releasePointerCapture && e) svgRef.current.releasePointerCapture(e.pointerId);
    }, [arrowDraft, tool, cur, dragPos, doAction]);

    var tools = [
        { id: "select", label: "Move", icon: "✋" },
        { id: "o", label: "Us", icon: "○", color: C.blue },
        { id: "x", label: "Opp", icon: "✕", color: C.red },
        { id: "arrow", label: "Arrow", icon: "→", color: C.yellow },
        { id: "erase", label: "Erase", icon: "⌫" },
    ];

    var cursorMap = { select: "grab", x: "crosshair", o: "crosshair", arrow: "crosshair", erase: "pointer" };

    var displayMarkers = cur.markers.map(function (m) {
        if (dragPos && dragPos.id === m.id) return { ...m, x: dragPos.x, y: dragPos.y };
        return m;
    });

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            {/* Toolbar */}
            <div style={{
                display: "flex", gap: 4, padding: "6px 8px", overflowX: "auto",
                background: C.bgCard, borderBottom: "1px solid " + C.border,
                flexShrink: 0, alignItems: "center",
            }}>
                {tools.map(function (t) {
                    return (
                        <button key={t.id} onClick={function () { setTool(t.id); }}
                            aria-label={t.label} aria-pressed={tool === t.id}
                            style={{
                                display: "flex", alignItems: "center", gap: 4,
                                padding: "7px 10px", fontSize: 12, fontFamily: C.fontCond,
                                fontWeight: tool === t.id ? 700 : 500, border: "1px solid",
                                borderColor: tool === t.id ? (t.color || C.accent) : C.border,
                                background: tool === t.id ? (t.color || C.accent) + "22" : "transparent",
                                color: tool === t.id ? (t.color || C.accent) : C.textMuted,
                                borderRadius: 4, cursor: "pointer", whiteSpace: "nowrap",
                                minHeight: 36, textTransform: "uppercase", letterSpacing: 0.5,
                            }}>
                            <span style={{ fontSize: 14 }}>{t.icon}</span> {t.label}
                        </button>
                    );
                })}
                <div style={{ flex: 1 }} />
                <ActionMenu onUndo={handleUndo} onRedo={handleRedo} onClear={handleClear}
                    canUndo={boardState.history.length > 0} canRedo={boardState.future.length > 0} />
            </div>

            {/* Pitch */}
            <div style={{
                flex: 1, padding: "8px 8px 0", overflow: "hidden",
                display: "flex", flexDirection: "column", cursor: cursorMap[tool] || "default",
            }}>
                <PitchSVG svgRef={svgRef}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}>
                    {/* Arrows */}
                    {cur.arrows.map(function (a) {
                        return (
                            <line key={a.id} x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2}
                                stroke={C.yellow} strokeWidth="2.5" markerEnd="url(#ah)"
                                style={{ pointerEvents: tool === "erase" ? "auto" : "none" }} />
                        );
                    })}
                    {arrowDraft && (
                        <line x1={arrowDraft.x1} y1={arrowDraft.y1} x2={arrowDraft.x2} y2={arrowDraft.y2}
                            stroke={C.yellow} strokeWidth="2.5" opacity="0.5" markerEnd="url(#ah-ghost)" />
                    )}
                    {/* Markers */}
                    {displayMarkers.map(function (m, idx) {
                        var oNum = displayMarkers.filter(function (mm, j) { return mm.type === "o" && j <= idx; }).length;
                        var isNew = m.id === newMarkerId;
                        var isDragging = dragPos && dragPos.id === m.id;
                        return (
                            <g key={m.id} style={{
                                cursor: tool === "select" ? (isDragging ? "grabbing" : "grab")
                                    : tool === "erase" ? "pointer" : "default",
                            }}>
                                <circle cx={m.x} cy={m.y} r="20" fill="transparent" />
                                {isNew && (
                                    <circle cx={m.x} cy={m.y} r="15" fill="none"
                                        stroke={m.type === "o" ? C.blue : C.red} strokeWidth="3" opacity="0">
                                        <animate attributeName="r" from="15" to="32" dur="0.45s" fill="freeze" />
                                        <animate attributeName="opacity" from="0.7" to="0" dur="0.45s" fill="freeze" />
                                    </circle>
                                )}
                                {m.type === "o" ? (
                                    <>
                                        <circle cx={m.x} cy={m.y} r="15" fill={C.blue} stroke="#fff" strokeWidth="2" />
                                        <text x={m.x} y={m.y + 5} textAnchor="middle" fontSize="13"
                                            fontWeight="800" fill="#fff" fontFamily={C.fontCond}
                                            style={{ pointerEvents: "none", userSelect: "none" }}>{oNum}</text>
                                    </>
                                ) : (
                                    <>
                                        <circle cx={m.x} cy={m.y} r="15" fill={C.red} stroke="#fff" strokeWidth="2" />
                                        <line x1={m.x - 7} y1={m.y - 7} x2={m.x + 7} y2={m.y + 7}
                                            stroke="#fff" strokeWidth="2.5" strokeLinecap="round" style={{ pointerEvents: "none" }} />
                                        <line x1={m.x + 7} y1={m.y - 7} x2={m.x - 7} y2={m.y + 7}
                                            stroke="#fff" strokeWidth="2.5" strokeLinecap="round" style={{ pointerEvents: "none" }} />
                                    </>
                                )}
                            </g>
                        );
                    })}
                </PitchSVG>
            </div>

            {/* Board tabs */}
            <div style={{
                display: "flex", gap: 4, padding: "6px 8px", overflowX: "auto",
                background: C.bgCard, borderTop: "1px solid " + C.border, flexShrink: 0, alignItems: "center",
            }}>
                {boards.map(function (b) {
                    return (
                        <button key={b.id}
                            onClick={function () { if (editingName !== b.id) onSetActive(b.id); }}
                            onDoubleClick={function () { setEditingName(b.id); }}
                            aria-label={"Board: " + b.name}
                            aria-current={b.id === activeBoard ? "true" : undefined}
                            style={{
                                padding: "5px 12px", fontSize: 11, fontFamily: C.fontCond, fontWeight: 600,
                                textTransform: "uppercase", letterSpacing: 1, border: "1px solid",
                                borderColor: b.id === activeBoard ? C.accent : C.border,
                                background: b.id === activeBoard ? C.accentDim : "transparent",
                                color: b.id === activeBoard ? C.accent : C.textMuted,
                                borderRadius: 4, cursor: "pointer", whiteSpace: "nowrap", minHeight: 32,
                            }}>
                            {editingName === b.id ? (
                                <input autoFocus value={b.name}
                                    onClick={function (e) { e.stopPropagation(); }}
                                    onChange={function (e) { onRenameBoard(b.id, e.target.value); }}
                                    onBlur={function () { setEditingName(null); }}
                                    onKeyDown={function (e) { if (e.key === "Enter") setEditingName(null); }}
                                    style={{
                                        background: "transparent", border: "none", color: C.accent,
                                        fontFamily: C.fontCond, fontSize: 11, fontWeight: 600,
                                        textTransform: "uppercase", outline: "none", width: 80, padding: 0,
                                    }} />
                            ) : (
                                <>
                                    {b.name}
                                    {boards.length > 1 && b.id === activeBoard && (
                                        <span onClick={function (e) { e.stopPropagation(); onDeleteBoard(b.id); }}
                                            style={{ marginLeft: 6, opacity: 0.4, fontSize: 10, cursor: "pointer" }}>✕</span>
                                    )}
                                </>
                            )}
                        </button>
                    );
                })}
                <button onClick={onAddBoard} aria-label="Add board"
                    style={{
                        padding: "5px 10px", fontSize: 13, background: "transparent",
                        border: "1px dashed " + C.border, color: C.textDim, borderRadius: 4,
                        cursor: "pointer", minHeight: 32
                    }}>+</button>
                <span style={{
                    marginLeft: "auto", fontSize: 9, color: C.textDim, fontFamily: C.fontCond,
                    whiteSpace: "nowrap", paddingRight: 4
                }}>Double-tap to rename</span>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════
   SCOUTING FORM
   ═══════════════════════════════════════════════════════════ */
function ScoutingForm(_ref) {
    var data = _ref.data, matchInfo = _ref.matchInfo, onUpdateMatch = _ref.onUpdateMatch, onUpdateSection = _ref.onUpdateSection, onUpdateSetPieces = _ref.onUpdateSetPieces;
    var _s = useState("buildUp"), openSection = _s[0], setOpenSection = _s[1];
    var toggle = function (id) { setOpenSection(function (p) { return p === id ? null : id; }); };
    var s = data;
    var upd = function (section, key, val) { onUpdateSection(section, { ...s[section], [key]: val }); };

    return (
        <div style={{ padding: "8px 10px 100px", overflowY: "auto" }}>
            <div style={{
                padding: "10px 12px", background: C.bgCard, borderRadius: 6,
                border: "1px solid " + C.border, marginBottom: 8
            }}>
                <div style={{
                    fontSize: 11, color: C.textMuted, fontFamily: C.fontCond,
                    textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8
                }}>Match Info</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    <Field label="Opponent" value={matchInfo.opponent} onChange={function (v) { onUpdateMatch("opponent", v); }} />
                    <Field label="Our Team" value={matchInfo.ourTeam} onChange={function (v) { onUpdateMatch("ourTeam", v); }} />
                    <Field label="In Possession" value={matchInfo.formationIn} onChange={function (v) { onUpdateMatch("formationIn", v); }} placeholder="4-3-3" />
                    <Field label="Out of Possession" value={matchInfo.formationOut} onChange={function (v) { onUpdateMatch("formationOut", v); }} placeholder="4-4-2" />
                </div>
                <Field label="Key Danger Players" value={matchInfo.dangerPlayers}
                    onChange={function (v) { onUpdateMatch("dangerPlayers", v); }} multiline placeholder="#10 creative, #9 pace in behind..." />
            </div>

            <Section title="In Possession — Build-Up" icon="⬆" isOpen={openSection === "buildUp"} onToggle={function () { toggle("buildUp"); }} color={C.blue}>
                <Label>GK Distribution</Label>
                <ToggleGroup options={["Long", "Short"]} value={s.buildUp.gk} onChange={function (v) { upd("buildUp", "gk", v); }} />
                <Spacer />
                <Label>Build-Up Focus</Label>
                <ToggleGroup options={["Left", "Right", "Central"]} value={s.buildUp.focus} onChange={function (v) { upd("buildUp", "focus", v); }} />
                <Spacer />
                <Label>Fullback Role</Label>
                <ToggleGroup options={["High", "Invert", "Low"]} value={s.buildUp.fbRole} onChange={function (v) { upd("buildUp", "fbRole", v); }} />
                <Spacer />
                <Label>Midfield Movement</Label>
                <ToggleGroup options={["Drop", "Rotate", "Stay"]} value={s.buildUp.midfield} onChange={function (v) { upd("buildUp", "midfield", v); }} />
                <Spacer />
                <Field label="Patterns Observed" value={s.buildUp.patterns} onChange={function (v) { upd("buildUp", "patterns", v); }}
                    multiline placeholder="Describe build-up patterns..."
                    minute={s.buildUp.patternsMin} onMinuteChange={function (v) { upd("buildUp", "patternsMin", v); }} />
                <Field label="Under Pressure Weakness" value={s.buildUp.weakness} onChange={function (v) { upd("buildUp", "weakness", v); }} placeholder="How do they react?" />
            </Section>

            <Section title="In Possession — Progression" icon="⚡" isOpen={openSection === "progression"} onToggle={function () { toggle("progression"); }} color={C.yellow}>
                <Label>Final Third Entry</Label>
                <ToggleGroup options={["Wide", "Central", "Direct/Through"]} value={s.progression.entry} onChange={function (v) { upd("progression", "entry", v); }} />
                <Spacer />
                <Label>Runs Behind Defence</Label>
                <ToggleGroup options={["Yes", "No"]} value={s.progression.fwdRuns} onChange={function (v) { upd("progression", "fwdRuns", v); }} />
                <Spacer />
                <Field label="Overload Areas / When" value={s.progression.overload} onChange={function (v) { upd("progression", "overload", v); }} placeholder="Where and when?" />
                <Field label="Main Threat Zones" value={s.progression.threatZones} onChange={function (v) { upd("progression", "threatZones", v); }} placeholder="Half-spaces, wide areas..." />
                <Label>Key Attacker Behavior</Label>
                <ToggleGroup options={["Dribble", "Cut Inside", "Run Behind", "Switch", "Cross"]}
                    value={s.progression.attackerBehavior} multi onChange={function (v) { upd("progression", "attackerBehavior", v); }} />
                <Spacer />
                <Field label="Notes" value={s.progression.notes} onChange={function (v) { upd("progression", "notes", v); }} multiline
                    minute={s.progression.notesMin} onMinuteChange={function (v) { upd("progression", "notesMin", v); }} />
            </Section>

            <Section title="Defending — Pressing Shape" icon="🛡" isOpen={openSection === "pressing"} onToggle={function () { toggle("pressing"); }} color="#e6824a">
                <Label>Block Height</Label>
                <ToggleGroup options={["High", "Mid", "Low"]} value={s.pressing.blockHeight} onChange={function (v) { upd("pressing", "blockHeight", v); }} />
                <Spacer />
                <Label>Who Leads Press</Label>
                <ToggleGroup options={["ST", "Wingers", "Midfield", "Whole Team", "Unorganized"]}
                    value={s.pressing.whoLeads} onChange={function (v) { upd("pressing", "whoLeads", v); }} />
                <Spacer />
                <Label>They Show Play To</Label>
                <ToggleGroup options={["Wide", "Central"]} value={s.pressing.direction} onChange={function (v) { upd("pressing", "direction", v); }} />
                <Spacer />
                <Field label="Press Triggers / Traps" value={s.pressing.traps} onChange={function (v) { upd("pressing", "traps", v); }} multiline placeholder="What triggers their press?"
                    minute={s.pressing.trapsMin} onMinuteChange={function (v) { upd("pressing", "trapsMin", v); }} />
            </Section>

            <Section title="Defending — Defensive Block" icon="🧱" isOpen={openSection === "block"} onToggle={function () { toggle("block"); }} color={C.red}>
                <Label>Compactness</Label>
                <ToggleGroup options={["Compact", "Loose"]} value={s.block.compactness} onChange={function (v) { upd("block", "compactness", v); }} />
                <Spacer />
                <Label>Space Between Lines</Label>
                <ToggleGroup options={["Small", "Large"]} value={s.block.space} onChange={function (v) { upd("block", "space", v); }} />
                <Spacer />
                <Label>Weak Areas</Label>
                <ToggleGroup options={["Slow CB", "Isolated FB", "DEF-MF Gap", "Wide Gaps"]}
                    value={s.block.weakAreas} multi onChange={function (v) { upd("block", "weakAreas", v); }} />
                <Spacer />
                <Field label="How We Can Exploit" value={s.block.exploit} onChange={function (v) { upd("block", "exploit", v); }} multiline placeholder="Tactical ideas..." />
            </Section>

            <Section title="Positive Transition (Their Counter)" icon="↗" isOpen={openSection === "posTrans"} onToggle={function () { toggle("posTrans"); }} color="#b070e6">
                <Label>Transition Style</Label>
                <ToggleGroup options={["Counter Attack", "Quick Passes", "Direct Long", "Controlled"]}
                    value={s.posTransition.style} onChange={function (v) { upd("posTransition", "style", v); }} />
                <Spacer />
                <Label>Direction</Label>
                <ToggleGroup options={["Left", "Right", "Central", "Diagonal"]}
                    value={s.posTransition.direction} onChange={function (v) { upd("posTransition", "direction", v); }} />
                <Spacer />
                <Field label="Who / What They Target" value={s.posTransition.target} onChange={function (v) { upd("posTransition", "target", v); }} />
                <Field label="Weakness We Can Exploit" value={s.posTransition.weakness} onChange={function (v) { upd("posTransition", "weakness", v); }} />
            </Section>

            <Section title="Negative Transition (Losing Ball)" icon="↙" isOpen={openSection === "negTrans"} onToggle={function () { toggle("negTrans"); }} color={C.blue}>
                <Label>Reaction Speed</Label>
                <ToggleGroup options={["Fast", "Slow"]} value={s.negTransition.speed} onChange={function (v) { upd("negTransition", "speed", v); }} />
                <Spacer />
                <Label>Response</Label>
                <ToggleGroup options={["Counter-Press", "Recover to Shape"]} value={s.negTransition.response} onChange={function (v) { upd("negTransition", "response", v); }} />
                <Spacer />
                <Label>Quality</Label>
                <ToggleGroup options={["Organized", "Delayed", "Disorganized"]} value={s.negTransition.quality} onChange={function (v) { upd("negTransition", "quality", v); }} />
                <Spacer />
                <Field label="Exposed Areas" value={s.negTransition.exposed} onChange={function (v) { upd("negTransition", "exposed", v); }} placeholder="Areas left open..." />
            </Section>

            <Section title="Set Pieces" icon="🎯" isOpen={openSection === "setPieces"} onToggle={function () { toggle("setPieces"); }} color={C.yellow}>
                {s.setPieces.map(function (sp, i) {
                    return (
                        <div key={i} style={{ padding: 10, background: C.bgHover, borderRadius: 6, marginBottom: 6 }}>
                            <div style={{ fontSize: 11, color: C.textDim, fontFamily: C.fontCond, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                                Set Piece #{i + 1}</div>
                            <Label>Type</Label>
                            <ToggleGroup options={["Corner", "Free Kick", "Throw-in"]} value={sp.type}
                                onChange={function (v) { var a = s.setPieces.slice(); a[i] = { ...sp, type: v }; onUpdateSetPieces(a); }} />
                            <Spacer />
                            <Label>Side</Label>
                            <ToggleGroup options={["Attacking", "Defending"]} value={sp.side}
                                onChange={function (v) { var a = s.setPieces.slice(); a[i] = { ...sp, side: v }; onUpdateSetPieces(a); }} />
                            <Spacer />
                            <Field label="Routines / Patterns" value={sp.notes} multiline placeholder="Describe..."
                                onChange={function (v) { var a = s.setPieces.slice(); a[i] = { ...sp, notes: v }; onUpdateSetPieces(a); }}
                                minute={sp.minute}
                                onMinuteChange={function (v) { var a = s.setPieces.slice(); a[i] = { ...sp, minute: v }; onUpdateSetPieces(a); }} />
                        </div>
                    );
                })}
                <button onClick={function () { onUpdateSetPieces(s.setPieces.concat([{ type: null, side: null, notes: "", minute: "" }])); }}
                    style={{
                        width: "100%", padding: 10, fontSize: 12, border: "1px dashed " + C.border,
                        background: "transparent", color: C.textMuted, borderRadius: 6, cursor: "pointer",
                        fontFamily: C.fontCond, textTransform: "uppercase", letterSpacing: 1
                    }}>+ Add Set Piece</button>
            </Section>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════
   MATCH TIMELINE
   ═══════════════════════════════════════════════════════════ */
function MatchTimeline(_ref) {
    var momentum = _ref.momentum, onMomentumChange = _ref.onMomentumChange, observations = _ref.observations, onAddObservation = _ref.onAddObservation, onDeleteObservation = _ref.onDeleteObservation;
    var summary = _ref.summary, onUpdateSummary = _ref.onUpdateSummary, clockMinute = _ref.clockMinute;
    var _o = useState(""), newObs = _o[0], setNewObs = _o[1];
    var _m = useState(""), newObsMin = _m[0], setNewObsMin = _m[1];
    var SEGS = 18;
    var segStates = ["neutral", "us", "them"];

    var cycleSeg = function (i) {
        var cur = momentum[i] || "neutral";
        var next = segStates[(segStates.indexOf(cur) + 1) % 3];
        onMomentumChange({ ...momentum, [i]: next === "neutral" ? undefined : next });
    };

    var addObs = function () {
        if (!newObs.trim()) return;
        onAddObservation({ id: uid(), text: newObs, minute: newObsMin || (clockMinute > 0 ? String(clockMinute) : "") });
        setNewObs(""); setNewObsMin("");
    };

    return (
        <div style={{ padding: "8px 10px 100px", overflowY: "auto" }}>
            <div style={{ padding: 12, background: C.bgCard, borderRadius: 6, border: "1px solid " + C.border, marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: C.textMuted, fontFamily: C.fontCond, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>
                    Match Momentum — Tap to cycle</div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.textDim, fontFamily: C.fontCond, marginBottom: 4 }}>
                    <span>0'</span><span>45' HT</span><span>90'</span></div>
                <div style={{ display: "flex", gap: 2 }}>
                    {Array.from({ length: SEGS }).map(function (_, i) {
                        var state = momentum[i] || "neutral";
                        var bg = state === "us" ? C.blue : state === "them" ? C.red : C.bgInput;
                        return (
                            <button key={i} onClick={function () { cycleSeg(i); }} aria-label={(i * 5) + "'-" + ((i + 1) * 5) + "' segment"}
                                style={{
                                    flex: 1, height: 44, background: bg, border: "none", borderRadius: 3,
                                    cursor: "pointer", opacity: state === "neutral" ? 0.35 : 0.85,
                                    transition: "all 0.12s",
                                    borderLeft: i === 9 ? "2px solid " + C.accent : "none",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                }}>
                                {state !== "neutral" && (
                                    <span style={{ fontSize: 8, color: "#fff", fontFamily: C.fontCond, fontWeight: 700 }}>{i * 5}'</span>
                                )}
                            </button>
                        );
                    })}
                </div>
                <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 11, fontFamily: C.fontCond }}>
                    <span style={{ color: C.blue }}>■ Us</span>
                    <span style={{ color: C.red }}>■ Them</span>
                    <span style={{ color: C.textDim }}>■ Neutral</span></div>
            </div>

            <div style={{ padding: 12, background: C.bgCard, borderRadius: 6, border: "1px solid " + C.border, marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: C.textMuted, fontFamily: C.fontCond, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>
                    Match Observations</div>
                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                    <input value={newObsMin} onChange={function (e) { setNewObsMin(e.target.value); }}
                        placeholder={clockMinute > 0 ? clockMinute + "'" : "min"} aria-label="Minute"
                        style={{
                            width: 48, padding: "8px 4px", fontSize: 13, textAlign: "center",
                            background: C.bgInput, border: "1px solid " + C.border, borderRadius: 4,
                            color: C.yellow, fontFamily: C.fontCond, outline: "none"
                        }} />
                    <input value={newObs} onChange={function (e) { setNewObs(e.target.value); }}
                        onKeyDown={function (e) { if (e.key === "Enter") addObs(); }}
                        placeholder="Quick note..." aria-label="Observation"
                        style={{
                            flex: 1, padding: "8px 10px", fontSize: 14, background: C.bgInput,
                            border: "1px solid " + C.border, borderRadius: 4, color: C.text,
                            fontFamily: C.font, outline: "none"
                        }} />
                    <button onClick={addObs} aria-label="Add" style={{
                        padding: "8px 14px", fontSize: 12, background: C.accent, color: C.bg,
                        border: "none", borderRadius: 4, cursor: "pointer", fontFamily: C.fontCond,
                        fontWeight: 700, textTransform: "uppercase"
                    }}>Add</button>
                </div>
                {observations.length === 0 && (
                    <div style={{ fontSize: 12, color: C.textDim, fontStyle: "italic", padding: "8px 0" }}>
                        No observations yet.</div>
                )}
                {observations.slice().reverse().map(function (o) {
                    return (
                        <div key={o.id} style={{
                            display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 0",
                            borderBottom: "1px solid " + C.border + "22"
                        }}>
                            {o.minute && (
                                <span style={{
                                    fontSize: 12, color: C.yellow, fontFamily: C.fontCond, fontWeight: 700,
                                    minWidth: 30, textAlign: "right", paddingTop: 1, flexShrink: 0
                                }}>{o.minute}'</span>
                            )}
                            <span style={{ flex: 1, fontSize: 13, color: C.text, lineHeight: 1.4 }}>{o.text}</span>
                            <button onClick={function () { onDeleteObservation(o.id); }} aria-label="Delete"
                                style={{ background: "transparent", border: "none", color: C.textDim, cursor: "pointer", fontSize: 13, padding: "2px 4px" }}>✕</button>
                        </div>
                    );
                })}
            </div>

            <div style={{ padding: 12, background: C.bgCard, borderRadius: 6, border: "1px solid " + C.border }}>
                <div style={{ fontSize: 11, color: C.textMuted, fontFamily: C.fontCond, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>
                    Match Summary</div>
                <Field label="Key Problems" value={summary.problems} onChange={function (v) { onUpdateSummary("problems", v); }} multiline placeholder="Major issues..." />
                <Field label="Key Opportunities" value={summary.opportunities} onChange={function (v) { onUpdateSummary("opportunities", v); }} multiline placeholder="Where we can hurt them..." />
                <Field label="Half-Time / Post-Match Notes" value={summary.notes} onChange={function (v) { onUpdateSummary("notes", v); }} multiline placeholder="Adjustments..." />
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════
   FORMATTED TEXT EXPORT
   ═══════════════════════════════════════════════════════════ */
function generateReport(data) {
    var ln = function (label, val) { return val ? "  " + label + ": " + val : null; };
    var section = function (title) { return "\n── " + title + " " + "─".repeat(Math.max(0, 40 - title.length)); };
    var tags = function (label, val) {
        if (!val) return null;
        if (Array.isArray(val)) return val.length ? "  " + label + ": " + val.join(", ") : null;
        return "  " + label + ": " + val;
    };

    var m = data.match;
    var s = data.scouting;
    var lines = [];

    lines.push("══════════════════════════════════════════");
    lines.push("  MATCH ANALYSIS" + (m.opponent ? ": vs " + m.opponent : ""));
    if (m.date) lines.push("  " + m.date);
    if (m.ourTeam) lines.push("  " + m.ourTeam);
    lines.push("══════════════════════════════════════════");

    var formLine = [
        m.formationIn ? "In Poss: " + m.formationIn : null,
        m.formationOut ? "Out Poss: " + m.formationOut : null,
    ].filter(Boolean).join("  |  ");
    if (formLine) { lines.push("\nFORMATIONS"); lines.push("  " + formLine); }
    if (m.dangerPlayers) { lines.push("\nDANGER PLAYERS"); lines.push("  " + m.dangerPlayers); }

    var bu = s.buildUp;
    if (bu.gk || bu.focus || bu.fbRole || bu.midfield || bu.patterns || bu.weakness) {
        lines.push(section("IN POSSESSION: BUILD-UP"));
        var quickTags = [bu.gk ? "GK: " + bu.gk : null, bu.focus ? "Focus: " + bu.focus : null,
        bu.fbRole ? "FB: " + bu.fbRole : null, bu.midfield ? "MF: " + bu.midfield : null].filter(Boolean);
        if (quickTags.length) lines.push("  " + quickTags.join("  |  "));
        if (bu.patterns) lines.push("  Patterns: " + bu.patterns);
        if (bu.weakness) lines.push("  Under Pressure: " + bu.weakness);
    }

    var pr = s.progression;
    if (pr.entry || pr.fwdRuns || pr.overload || pr.threatZones || (pr.attackerBehavior && pr.attackerBehavior.length) || pr.notes) {
        lines.push(section("IN POSSESSION: PROGRESSION"));
        var qt = [pr.entry ? "Entry: " + pr.entry : null, pr.fwdRuns ? "Runs Behind: " + pr.fwdRuns : null].filter(Boolean);
        if (qt.length) lines.push("  " + qt.join("  |  "));
        if (pr.attackerBehavior && pr.attackerBehavior.length) lines.push("  Behavior: " + pr.attackerBehavior.join(", "));
        if (pr.overload) lines.push("  Overload: " + pr.overload);
        if (pr.threatZones) lines.push("  Threat Zones: " + pr.threatZones);
        if (pr.notes) lines.push("  Notes: " + pr.notes);
    }

    var ps = s.pressing;
    if (ps.blockHeight || ps.whoLeads || ps.direction || ps.traps) {
        lines.push(section("DEFENDING: PRESSING SHAPE"));
        var qt2 = [ps.blockHeight ? "Block: " + ps.blockHeight : null,
        ps.whoLeads ? "Led by: " + ps.whoLeads : null,
        ps.direction ? "Show to: " + ps.direction : null].filter(Boolean);
        if (qt2.length) lines.push("  " + qt2.join("  |  "));
        if (ps.traps) lines.push("  Triggers: " + ps.traps);
    }

    var bl = s.block;
    if (bl.compactness || bl.space || (bl.weakAreas && bl.weakAreas.length) || bl.exploit) {
        lines.push(section("DEFENDING: BLOCK"));
        var qt3 = [bl.compactness ? "Shape: " + bl.compactness : null,
        bl.space ? "Lines: " + bl.space : null].filter(Boolean);
        if (qt3.length) lines.push("  " + qt3.join("  |  "));
        if (bl.weakAreas && bl.weakAreas.length) lines.push("  Weak Areas: " + bl.weakAreas.join(", "));
        if (bl.exploit) lines.push("  Exploit: " + bl.exploit);
    }

    var pt = s.posTransition;
    if (pt.style || pt.direction || pt.target || pt.weakness) {
        lines.push(section("POSITIVE TRANSITION (THEIR COUNTER)"));
        var qt4 = [pt.style, pt.direction ? "Dir: " + pt.direction : null].filter(Boolean);
        if (qt4.length) lines.push("  " + qt4.join("  |  "));
        if (pt.target) lines.push("  Target: " + pt.target);
        if (pt.weakness) lines.push("  Exploit: " + pt.weakness);
    }

    var nt = s.negTransition;
    if (nt.speed || nt.response || nt.quality || nt.exposed) {
        lines.push(section("NEGATIVE TRANSITION (LOSING BALL)"));
        var qt5 = [nt.speed ? "Speed: " + nt.speed : null, nt.response, nt.quality].filter(Boolean);
        if (qt5.length) lines.push("  " + qt5.join("  |  "));
        if (nt.exposed) lines.push("  Exposed: " + nt.exposed);
    }

    var activeSP = s.setPieces.filter(function (sp) { return sp.type || sp.notes; });
    if (activeSP.length) {
        lines.push(section("SET PIECES"));
        activeSP.forEach(function (sp, i) {
            var label = [sp.type, sp.side].filter(Boolean).join(" — ");
            lines.push("  " + (i + 1) + ". " + (label || "Set Piece"));
            if (sp.notes) lines.push("     " + sp.notes);
        });
    }

    if (data.observations.length) {
        lines.push(section("MATCH OBSERVATIONS"));
        data.observations.forEach(function (o) {
            lines.push("  " + (o.minute ? o.minute + "'" : "  ") + " " + o.text);
        });
    }

    var sm = data.summary;
    if (sm.problems || sm.opportunities || sm.notes) {
        lines.push(section("SUMMARY"));
        if (sm.problems) { lines.push("  PROBLEMS:"); lines.push("  " + sm.problems); }
        if (sm.opportunities) { lines.push("  OPPORTUNITIES:"); lines.push("  " + sm.opportunities); }
        if (sm.notes) { lines.push("  NOTES:"); lines.push("  " + sm.notes); }
    }

    lines.push("\n══════════════════════════════════════════");

    return lines.filter(function (l) { return l !== null; }).join("\n");
}

/* ═══════════════════════════════════════════════════════════
   EXPORT MENU
   ═══════════════════════════════════════════════════════════ */
function ExportMenu(_ref) {
    var data = _ref.data;
    var _s = useState(false), open = _s[0], setOpen = _s[1];
    var _c = useState(false), copied = _c[0], setCopied = _c[1];
    var ref = useRef(null);

    useEffect(function () {
        if (!open) return;
        var handler = function (e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener("pointerdown", handler);
        return function () { document.removeEventListener("pointerdown", handler); };
    }, [open]);

    var copyToClipboard = function () {
        var text = generateReport(data);
        try {
            navigator.clipboard.writeText(text).then(function () {
                setCopied(true);
                setTimeout(function () { setCopied(false); setOpen(false); }, 1200);
            });
        } catch (e) {
            var ta = document.createElement("textarea");
            ta.value = text; document.body.appendChild(ta);
            ta.select(); document.execCommand("copy");
            document.body.removeChild(ta);
            setCopied(true);
            setTimeout(function () { setCopied(false); setOpen(false); }, 1200);
        }
    };

    var downloadText = function () {
        var text = generateReport(data);
        var blob = new Blob([text], { type: "text/plain" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "analysis-" + (data.match.opponent || "match") + "-" + (data.match.date || new Date().toISOString().slice(0, 10)) + ".txt";
        a.click(); URL.revokeObjectURL(url);
        setOpen(false);
    };

    return (
        <div ref={ref} style={{ position: "relative" }}>
            <button onClick={function () { setOpen(!open); }} aria-label="Export" style={{
                padding: "5px 10px", fontSize: 10, background: C.accent, color: C.bg,
                border: "none", borderRadius: 3, cursor: "pointer", fontWeight: 700,
                fontFamily: C.fontCond, textTransform: "uppercase", letterSpacing: 0.5,
            }}>Export</button>
            {open && (
                <div style={{
                    position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 50,
                    background: C.bgCard, border: "1px solid " + C.borderActive, borderRadius: 6,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.5)", minWidth: 180, overflow: "hidden",
                }}>
                    <button onClick={copyToClipboard} style={{
                        width: "100%", padding: "12px 14px", fontSize: 13, fontFamily: C.fontCond,
                        fontWeight: 600, textAlign: "left", background: "transparent", border: "none",
                        borderBottom: "1px solid " + C.border, color: copied ? C.accent : C.text, cursor: "pointer",
                    }}>{copied ? "✓  Copied!" : "📋  Copy to Clipboard"}</button>
                    <button onClick={downloadText} style={{
                        width: "100%", padding: "12px 14px", fontSize: 13, fontFamily: C.fontCond,
                        fontWeight: 600, textAlign: "left", background: "transparent", border: "none",
                        color: C.text, cursor: "pointer",
                    }}>💾  Download .txt</button>
                </div>
            )}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════════════════════ */
function App() {
    var _d = useState(INITIAL_DATA), data = _d[0], setData = _d[1];
    var _t = useState("board"), tab = _t[0], setTab = _t[1];
    var _l = useState(false), loaded = _l[0], setLoaded = _l[1];
    var clock = useMatchClock();

    /*
     * On mount, check localStorage for saved data.
     * loadSaved() is synchronous now (unlike the async window.storage),
     * but we still use useEffect to keep it out of the render path.
     */
    useEffect(function () {
        var saved = loadSaved();
        if (saved) setData(function () { return { ...INITIAL_DATA, ...saved }; });
        setLoaded(true);
    }, []);

    useAutoSave(data, loaded);

    var updateMatch = function (key, val) { setData(function (d) { return { ...d, match: { ...d.match, [key]: val } }; }); };
    var updateBoard = useCallback(function (id, board) {
        setData(function (d) { return { ...d, boards: d.boards.map(function (b) { return b.id === id ? board : b; }) }; });
    }, []);
    var setActiveBoard = function (id) { setData(function (d) { return { ...d, activeBoard: id }; }); };
    var addBoard = function () {
        var id = uid();
        setData(function (d) { return { ...d, boards: d.boards.concat([{ id: id, name: "Board " + (d.boards.length + 1), markers: [], arrows: [] }]), activeBoard: id }; });
    };
    var renameBoard = function (id, name) { setData(function (d) { return { ...d, boards: d.boards.map(function (b) { return b.id === id ? { ...b, name: name } : b; }) }; }); };
    var deleteBoard = function (id) {
        setData(function (d) {
            var boards = d.boards.filter(function (b) { return b.id !== id; });
            return { ...d, boards: boards, activeBoard: boards[0] ? boards[0].id : "" };
        });
    };
    var updateSection = function (section, val) { setData(function (d) { return { ...d, scouting: { ...d.scouting, [section]: val } }; }); };
    var updateSetPieces = function (val) { setData(function (d) { return { ...d, scouting: { ...d.scouting, setPieces: val } }; }); };
    var updateMomentum = function (val) { setData(function (d) { return { ...d, momentum: val }; }); };
    var addObservation = function (obs) { setData(function (d) { return { ...d, observations: d.observations.concat([obs]) }; }); };
    var deleteObservation = function (id) { setData(function (d) { return { ...d, observations: d.observations.filter(function (o) { return o.id !== id; }) }; }); };
    var updateSummary = function (key, val) { setData(function (d) { return { ...d, summary: { ...d.summary, [key]: val } }; }); };

    var resetAll = function () {
        if (confirm("Clear all data and start fresh?")) { setData(INITIAL_DATA); clearSaved(); }
    };

    var tabs = [
        { id: "board", label: "Board", icon: "⚽" },
        { id: "scout", label: "Scout", icon: "📋" },
        { id: "timeline", label: "Timeline", icon: "📊" },
    ];

    return (
        <div style={{
            /* flex:1 fills the space below the nav bar.
               The original used height:"100vh" but that would overlap the nav. */
            display: "flex", flexDirection: "column", background: C.bg, fontFamily: C.font, color: C.text,
            overflow: "hidden", height: "100%",
        }}>
            <link href={FONT_LINK} rel="stylesheet" />

            {/* Header */}
            <div style={{
                display: "flex", alignItems: "center", padding: "8px 10px",
                background: C.bgCard, borderBottom: "1px solid " + C.border, gap: 8, flexShrink: 0,
            }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <h1 style={{
                        margin: 0, fontSize: 15, fontFamily: C.fontCond, fontWeight: 800,
                        textTransform: "uppercase", letterSpacing: 2, color: C.accent,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                        {data.match.opponent ? "vs " + data.match.opponent : "Match Analysis"}
                    </h1>
                </div>
                <div style={{
                    display: "flex", alignItems: "center", gap: 5, background: C.bg,
                    padding: "4px 8px", borderRadius: 4, border: "1px solid " + C.border,
                }}>
                    <button onClick={clock.toggle} aria-label={clock.running ? "Pause" : "Start"}
                        style={{
                            width: 26, height: 26,
                            background: clock.running ? C.red + "33" : C.accent + "33",
                            border: "1px solid " + (clock.running ? C.red : C.accent),
                            color: clock.running ? C.red : C.accent,
                            borderRadius: 3, cursor: "pointer", fontSize: 10,
                            display: "flex", alignItems: "center", justifyContent: "center",
                        }}>{clock.running ? "❚❚" : "▶"}</button>
                    <span style={{
                        fontFamily: C.fontCond, fontWeight: 700, fontSize: 17,
                        color: clock.running ? C.accent : C.textMuted,
                        minWidth: 36, textAlign: "center", fontVariantNumeric: "tabular-nums",
                    }}>{clock.minute}'</span>
                    <span style={{ fontSize: 9, color: C.textDim, fontFamily: C.fontCond }}>{clock.half === 1 ? "1H" : "2H"}</span>
                </div>
                <ExportMenu data={data} />
                <button onClick={resetAll} aria-label="Reset" style={{
                    padding: "5px 6px", fontSize: 13, background: "transparent",
                    border: "1px solid " + C.red + "44", color: C.red, borderRadius: 3,
                    cursor: "pointer", opacity: 0.7,
                }}>⟲</button>
            </div>

            {clock.half === 1 && clock.minute >= 45 && (
                <button onClick={clock.startSecondHalf} style={{
                    padding: 7, fontSize: 11, fontFamily: C.fontCond, fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: 1, background: C.yellow + "22",
                    border: "none", borderBottom: "1px solid " + C.yellow + "44", color: C.yellow,
                    cursor: "pointer", textAlign: "center", flexShrink: 0,
                }}>Start Second Half →</button>
            )}

            {/* Content */}
            <div style={{ flex: 1, overflow: "hidden" }}>
                <div style={{ display: tab === "board" ? "flex" : "none", flexDirection: "column", height: "100%" }}>
                    <TacticalBoard boards={data.boards} activeBoard={data.activeBoard}
                        onUpdate={updateBoard} onSetActive={setActiveBoard}
                        onAddBoard={addBoard} onRenameBoard={renameBoard} onDeleteBoard={deleteBoard} />
                </div>
                <div style={{ display: tab === "scout" ? "block" : "none", height: "100%", overflowY: "auto" }}>
                    <ScoutingForm data={data.scouting} matchInfo={data.match}
                        onUpdateMatch={updateMatch} onUpdateSection={updateSection} onUpdateSetPieces={updateSetPieces} />
                </div>
                <div style={{ display: tab === "timeline" ? "block" : "none", height: "100%", overflowY: "auto" }}>
                    <MatchTimeline momentum={data.momentum} onMomentumChange={updateMomentum}
                        observations={data.observations} onAddObservation={addObservation}
                        onDeleteObservation={deleteObservation} summary={data.summary}
                        onUpdateSummary={updateSummary} clockMinute={clock.minute} />
                </div>
            </div>

            {/* Tab Bar — CHANGED: darker background (#0a0f0c) and vertical dividers */}
            <div style={{
                display: "flex", background: "#0a0f0c", borderTop: "1px solid " + C.border,
                flexShrink: 0, padding: "2px 0 env(safe-area-inset-bottom, 2px)",
            }}>
                {tabs.map(function (t, i) {
                    return (
                        <button key={t.id} onClick={function () { setTab(t.id); }} aria-label={t.label}
                            aria-current={tab === t.id ? "page" : undefined}
                            style={{
                                flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                                gap: 1, padding: "7px 0", background: "transparent",
                                border: "none",
                                borderRight: i < tabs.length - 1 ? "1px solid " + C.border : "none",
                                cursor: "pointer", color: tab === t.id ? C.accent : C.textDim,
                                transition: "color 0.12s",
                            }}>
                            <span style={{ fontSize: 17 }}>{t.icon}</span>
                            <span style={{ fontSize: 9, fontFamily: C.fontCond, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{t.label}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}