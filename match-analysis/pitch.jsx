/*
 * pitch.jsx — Tactical board: pitch SVG, markers, arrows,
 *             tool selection, undo/redo, and board tabs.
 *
 * ── DEPENDS ON (from app.jsx, loaded before this file) ──
 *   Globals: C, uid
 *   React hooks: useState, useRef, useCallback, useEffect, useReducer
 *
 * ── EXPORTS (to global scope) ──
 *   TacticalBoard  — used by App in app.jsx
 */

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
   ACTION MENU
   Expands horizontally to the left so it doesn't
   drop behind the pitch SVG.
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
                                onClick={function () { item.action(); }}
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