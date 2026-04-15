/*
 * app.jsx — Core module: shared constants, utilities, hooks,
 *           small reusable components, and the main App shell.
 *
 * ── LOAD ORDER ──
 * This file is loaded FIRST. It defines everything the other
 * three files (pitch.jsx, scouting-form.jsx, timeline.jsx)
 * depend on: theme colors, uid(), Field, ToggleGroup, etc.
 *
 * The App component defined here references TacticalBoard,
 * ScoutingForm, and MatchTimeline — which don't exist yet
 * when this file executes. That's fine: JavaScript doesn't
 * evaluate a function body until the function is called.
 * By the time the mount script calls App(), all four files
 * have executed and those globals exist.
 *
 * Data persistence uses localStorage (the browser's built-in
 * key-value store).
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

            {/* Tab Bar */}
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