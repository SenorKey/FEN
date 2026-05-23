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
    bg: "#0c0e11", bgCard: "#161a20", bgInput: "#1c2128", bgHover: "#232831",
    border: "#2a313c", borderActive: "#3a424f",
    accent: "#b8e636", accentDim: "rgba(184,230,54,0.15)",
    blue: "#5fa8ff", blueDim: "rgba(95,168,255,0.15)",
    red: "#ff6b5a", redDim: "rgba(255,107,90,0.15)",
    yellow: "#ffd44a",
    amber: "#ff9d3d", amberDim: "rgba(255,157,61,0.15)",
    danger: "#f15545", dangerDim: "rgba(241,85,69,0.15)",
    arrow: "#e8eef2",
    text: "#e3e6ec", textMuted: "#8b94a3", textDim: "#6b7380",
    pitch: "#15301e", pitchLine: "#3a5a2e",
    font: "'Saira', sans-serif", fontCond: "'Saira Condensed', sans-serif",
};

/* ── Header segmented controls (view tabs + Save/Load/Export) ──
   Shared styling so both groups look identical. The container's
   flex-direction is flipped to a column on mobile (see App) so the
   buttons stack vertically instead of crowding the match clock. */
var segGroupStyle = {
    display: "flex", alignItems: "center", gap: 2,
    background: C.bgInput, border: "1px solid " + C.border,
    borderRadius: 4, padding: 2,
};
var segBtnStyle = {
    padding: "4px 11px", fontSize: 10, fontFamily: C.fontCond,
    fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5,
    whiteSpace: "nowrap", border: "none", borderRadius: 3, cursor: "pointer",
    transition: "background 0.12s, color 0.12s",
};

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
var LIBRARY_KEY = "match-analysis-library-v1";

function loadLibrary() {
    try {
        var raw = localStorage.getItem(LIBRARY_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
}

function writeLibrary(items) {
    try { localStorage.setItem(LIBRARY_KEY, JSON.stringify(items)); } catch (e) { console.warn("Library save failed", e); }
}

function findDuplicateLabel(data) {
    var opp = data.match.opponent || "";
    var our = data.match.ourTeam || "";
    var dt = data.match.date || "";
    var match = loadLibrary().find(function (e) {
        return e.opponent === opp && e.ourTeam === our && e.date === dt;
    });
    if (!match) return null;
    return (match.ourTeam || "Our Team") + " vs " + (match.opponent || "Opponent") + (match.date ? " (" + match.date + ")" : "");
}

function saveToLibrary(data) {
    var lib = loadLibrary();
    var entry = {
        id: "" + Date.now() + "-" + Math.floor(Math.random() * 1000),
        savedAt: new Date().toISOString(),
        opponent: data.match.opponent || "",
        ourTeam: data.match.ourTeam || "",
        date: data.match.date || "",
        data: JSON.parse(JSON.stringify(data)),
    };
    var idx = lib.findIndex(function (e) {
        return e.opponent === entry.opponent && e.ourTeam === entry.ourTeam && e.date === entry.date;
    });
    if (idx > -1) { lib[idx] = entry; } else { lib.unshift(entry); }
    writeLibrary(lib);
    return entry;
}

function deleteFromLibrary(id) {
    writeLibrary(loadLibrary().filter(function (e) { return e.id !== id; }));
}

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
   CONFIRM MODAL
   Replaces native window.confirm() — promise-based so callers can
   `.then(ok => ...)`. Mount the returned `modal` once in the tree
   and call `confirm({ message, ... })` to await a user decision.
   ═══════════════════════════════════════════════════════════ */
function ConfirmModal(props) {
    useEffect(function () {
        var onKey = function (e) {
            if (e.key === "Escape") { e.preventDefault(); props.onCancel(); }
            else if (e.key === "Enter") { e.preventDefault(); props.onConfirm(); }
        };
        document.addEventListener("keydown", onKey);
        return function () { document.removeEventListener("keydown", onKey); };
    }, [props.onCancel, props.onConfirm]);

    return (
        <div role="dialog" aria-modal="true" aria-label={props.title || "Confirm"}
            onClick={props.onCancel}
            style={{
                position: "fixed", inset: 0, zIndex: 2000,
                background: "rgba(0,0,0,0.6)",
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: 16, fontFamily: C.font,
            }}>
            <div onClick={function (e) { e.stopPropagation(); }} style={{
                background: C.bgCard, border: "1px solid " + C.borderActive,
                borderRadius: 6, padding: 20, maxWidth: 380, width: "100%",
                color: C.text, boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
            }}>
                <div style={{
                    fontSize: 11, fontFamily: C.fontCond, fontWeight: 800,
                    textTransform: "uppercase", letterSpacing: 2,
                    color: props.danger ? C.danger : C.textMuted, marginBottom: 10,
                }}>{props.title || "Confirm"}</div>
                <div style={{ fontSize: 14, lineHeight: 1.4, marginBottom: 18 }}>
                    {props.message}
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                    <button onClick={props.onCancel} style={{
                        ...segBtnStyle, padding: "8px 14px",
                        background: "transparent", color: C.textMuted,
                        border: "1px solid " + C.border,
                    }}>{props.cancelLabel || "Cancel"}</button>
                    <button onClick={props.onConfirm} autoFocus style={{
                        ...segBtnStyle, padding: "8px 14px",
                        background: props.danger ? C.danger : C.accent,
                        color: props.danger ? "#fff" : C.bg,
                    }}>{props.confirmLabel || "Confirm"}</button>
                </div>
            </div>
        </div>
    );
}

function useConfirm() {
    var _s = useState(null), state = _s[0], setState = _s[1];

    var confirm = useCallback(function (opts) {
        return new Promise(function (resolve) {
            setState({
                title: opts.title,
                message: opts.message,
                confirmLabel: opts.confirmLabel,
                cancelLabel: opts.cancelLabel,
                danger: !!opts.danger,
                resolve: resolve,
            });
        });
    }, []);

    var handleCancel = function () {
        if (state) { state.resolve(false); setState(null); }
    };
    var handleConfirm = function () {
        if (state) { state.resolve(true); setState(null); }
    };

    var modal = state ? (
        <ConfirmModal
            title={state.title} message={state.message}
            confirmLabel={state.confirmLabel} cancelLabel={state.cancelLabel}
            danger={state.danger}
            onCancel={handleCancel} onConfirm={handleConfirm}
        />
    ) : null;

    return { confirm: confirm, modal: modal };
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
    var reset = function () { setSeconds(0); setRunning(false); setHalf(1); };
    var startSecondHalf = function () { setHalf(2); setSeconds(0); setRunning(true); };

    return { minute: minute, seconds: seconds % 60, running: running, half: half, toggle: toggle, reset: reset, startSecondHalf: startSecondHalf };
}

/* ═══════════════════════════════════════════════════════════
   RESPONSIVE — mobile breakpoint
   Matches the 768px threshold the Scout/Timeline layouts use in
   match-analysis.css. Below it, the header's tab + action groups
   stack their buttons vertically instead of sitting in a row.
   ═══════════════════════════════════════════════════════════ */
var MOBILE_BREAKPOINT = 768;
function useIsMobile() {
    var query = "(max-width: " + (MOBILE_BREAKPOINT - 0.02) + "px)";
    var _m = useState(function () { return window.matchMedia(query).matches; });
    var isMobile = _m[0], setIsMobile = _m[1];
    useEffect(function () {
        var mql = window.matchMedia(query);
        var handler = function (e) { setIsMobile(e.matches); };
        mql.addEventListener("change", handler);
        return function () { mql.removeEventListener("change", handler); };
    }, []);
    return isMobile;
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
    var label = _ref.label, value = _ref.value, onChange = _ref.onChange, placeholder = _ref.placeholder, multiline = _ref.multiline, minute = _ref.minute, onMinuteChange = _ref.onMinuteChange, type = _ref.type;
    var shared = {
        value: value || "", onChange: function (e) { onChange(e.target.value); },
        placeholder: placeholder || "",
        type: type || "text",
        style: {
            width: "100%", padding: "8px 11px", fontSize: 14, background: C.bgInput,
            border: "1px solid " + C.border, borderRadius: 4, color: C.text,
            fontFamily: C.font, resize: multiline ? "vertical" : "none",
            minHeight: multiline ? 60 : "auto", outline: "none", boxSizing: "border-box",
            colorScheme: "dark",
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
    var title = _ref.title, description = _ref.description, icon = _ref.icon, children = _ref.children, isOpen = _ref.isOpen, onToggle = _ref.onToggle, color = _ref.color || C.accent, iconColor = _ref.iconColor || color, borderColor = _ref.borderColor || color;
    return (
        <div style={{
            borderRadius: 8, overflow: "hidden",
            border: "1px solid " + (isOpen ? borderColor + "66" : C.border),
            background: C.bgCard,
            alignSelf: "stretch",
            width: "100%",
            transition: "border-color 0.15s",
        }}>
            <button onClick={onToggle} aria-expanded={isOpen} style={{
                width: "100%",
                padding: isOpen ? "13px 14px" : "18px 16px",
                display: "flex", alignItems: isOpen ? "center" : "flex-start",
                gap: 12, background: isOpen ? C.bgHover : "transparent", border: "none",
                cursor: "pointer", textAlign: "left",
                height: isOpen ? "auto" : 96,
                overflow: "hidden",
            }}>
                <span style={{
                    fontSize: isOpen ? 16 : 24, width: isOpen ? 24 : 32,
                    textAlign: "center", lineHeight: 1, flexShrink: 0, color: iconColor,
                }}>{icon}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{
                        display: "block", fontSize: isOpen ? 13 : 14, fontWeight: 700,
                        color: isOpen ? color : C.text, fontFamily: C.fontCond,
                        textTransform: "uppercase", letterSpacing: 1.4, lineHeight: 1.25,
                    }}>{title}</span>
                    {!isOpen && description && (
                        <span style={{
                            display: "block", fontSize: 11, color: C.textDim,
                            marginTop: 5, fontFamily: C.font, lineHeight: 1.4,
                        }}>{description}</span>
                    )}
                </span>
                <span style={{
                    fontSize: 16, color: C.textDim, flexShrink: 0,
                    transform: isOpen ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s",
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
   PRINTABLE HTML REPORT
   ═══════════════════════════════════════════════════════════ */
function escHTML(s) {
    return String(s == null ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function generateReportHTML(data) {
    var m = data.match;
    var s = data.scouting;
    var title = (m.ourTeam || "Our Team") + " vs " + (m.opponent || "Opponent");

    var boardSvg = "";
    var svgEl = document.querySelector("svg[viewBox='0 0 700 460']");
    if (svgEl) {
        var clone = svgEl.cloneNode(true);
        clone.removeAttribute("style");
        clone.setAttribute("width", "100%");
        clone.setAttribute("height", "auto");
        boardSvg = clone.outerHTML;
    }

    var sections = [];

    var meta = [];
    if (m.date) meta.push("<strong>Date:</strong> " + escHTML(m.date));
    if (m.formationIn) meta.push("<strong>In Possession:</strong> " + escHTML(m.formationIn));
    if (m.formationOut) meta.push("<strong>Out of Possession:</strong> " + escHTML(m.formationOut));
    if (meta.length) sections.push('<div class="meta">' + meta.join(" &nbsp;·&nbsp; ") + "</div>");
    if (m.dangerPlayers) sections.push('<h2>Danger Players</h2><p>' + escHTML(m.dangerPlayers) + "</p>");

    if (boardSvg) sections.push('<h2>Formation Board</h2><div class="board">' + boardSvg + "</div>");

    var row = function (label, val) { return val ? "<li><strong>" + escHTML(label) + ":</strong> " + escHTML(Array.isArray(val) ? val.join(", ") : val) + "</li>" : ""; };
    var block = function (title, items) {
        var li = items.filter(Boolean).join("");
        return li ? "<h2>" + escHTML(title) + "</h2><ul>" + li + "</ul>" : "";
    };

    var bu = s.buildUp || {};
    sections.push(block("In Possession — Build-Up", [
        row("Goalkeeper", bu.gk), row("Focus", bu.focus), row("Fullbacks", bu.fbRole),
        row("Midfield", bu.midfield), row("Patterns", bu.patterns), row("Under Pressure", bu.weakness),
    ]));

    var pr = s.progression || {};
    sections.push(block("In Possession — Progression", [
        row("Entry", pr.entry), row("Runs Behind", pr.fwdRuns),
        row("Attacker Behavior", pr.attackerBehavior), row("Overload", pr.overload),
        row("Threat Zones", pr.threatZones), row("Notes", pr.notes),
    ]));

    var ps = s.pressing || {};
    sections.push(block("Defending — Pressing Shape", [
        row("Block Height", ps.blockHeight), row("Led By", ps.whoLeads),
        row("Show To", ps.direction), row("Triggers", ps.traps),
    ]));

    var bl = s.block || {};
    sections.push(block("Defending — Block", [
        row("Shape", bl.compactness), row("Lines", bl.space),
        row("Weak Areas", bl.weakAreas), row("Exploit", bl.exploit),
    ]));

    var pt = s.posTransition || {};
    sections.push(block("Positive Transition (Their Counter)", [
        row("Style", pt.style), row("Direction", pt.direction),
        row("Target", pt.target), row("Exploit", pt.weakness),
    ]));

    var nt = s.negTransition || {};
    sections.push(block("Negative Transition (Losing the Ball)", [
        row("Speed", nt.speed), row("Response", nt.response),
        row("Quality", nt.quality), row("Exposed", nt.exposed),
    ]));

    var activeSP = (s.setPieces || []).filter(function (sp) { return sp.type || sp.notes; });
    if (activeSP.length) {
        var spHtml = activeSP.map(function (sp) {
            var label = [sp.type, sp.side].filter(Boolean).map(escHTML).join(" — ");
            var minute = sp.minute ? " <span class='muted'>(" + escHTML(sp.minute) + "')</span>" : "";
            return "<li><strong>" + (label || "Set Piece") + "</strong>" + minute + (sp.notes ? "<br>" + escHTML(sp.notes) : "") + "</li>";
        }).join("");
        sections.push("<h2>Set Pieces</h2><ul>" + spHtml + "</ul>");
    }

    if (data.observations && data.observations.length) {
        var obs = data.observations.map(function (o) {
            return "<li><strong>" + (o.minute ? escHTML(o.minute) + "'" : "—") + "</strong> " + escHTML(o.text) + "</li>";
        }).join("");
        sections.push("<h2>Match Observations</h2><ol class='obs'>" + obs + "</ol>");
    }

    var sm = data.summary || {};
    if (sm.problems || sm.opportunities || sm.notes) {
        var sumParts = [];
        if (sm.problems) sumParts.push("<h3>Problems</h3><p>" + escHTML(sm.problems) + "</p>");
        if (sm.opportunities) sumParts.push("<h3>Opportunities</h3><p>" + escHTML(sm.opportunities) + "</p>");
        if (sm.notes) sumParts.push("<h3>Notes</h3><p>" + escHTML(sm.notes) + "</p>");
        sections.push("<h2>Summary</h2>" + sumParts.join(""));
    }

    var css = [
        "*{box-sizing:border-box}",
        "body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111;margin:0;padding:24px;line-height:1.45;font-size:12pt}",
        "header{border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:18px}",
        "h1{margin:0 0 4px;font-size:22pt;letter-spacing:0.5px}",
        "h2{font-size:13pt;text-transform:uppercase;letter-spacing:1.2px;border-bottom:1px solid #999;padding-bottom:3px;margin:18px 0 8px}",
        "h3{font-size:11pt;margin:10px 0 4px;text-transform:uppercase;letter-spacing:0.6px;color:#444}",
        "ul,ol{margin:6px 0;padding-left:20px}",
        "li{margin:3px 0}",
        ".meta{font-size:10.5pt;color:#333;margin-bottom:6px}",
        ".muted{color:#888;font-weight:normal}",
        ".board{max-width:520px;margin:8px 0}",
        ".board svg{width:100%;height:auto;border:1px solid #ccc;background:#f5f5f5}",
        "p{margin:4px 0}",
        "@page{margin:14mm}",
        "@media print{body{padding:0} h2{page-break-after:avoid} ul,ol,p{page-break-inside:avoid}}",
    ].join("");

    return "<!doctype html><html><head><meta charset='utf-8'><title>" + escHTML(title) + "</title><style>" + css + "</style></head><body>" +
        "<header><h1>" + escHTML(title) + "</h1>" + (m.date ? "<div class='meta'>" + escHTML(m.date) + "</div>" : "") + "</header>" +
        sections.filter(Boolean).join("") +
        "</body></html>";
}

function printPDF(data) {
    var html = generateReportHTML(data);
    var iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.visibility = "hidden";
    document.body.appendChild(iframe);

    var cleanup = function () {
        setTimeout(function () {
            if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        }, 1000);
    };

    var doPrint = function () {
        try {
            var win = iframe.contentWindow;
            win.focus();
            win.print();
        } catch (e) { /* ignore */ }
        var onAfter = function () { cleanup(); win.removeEventListener("afterprint", onAfter); };
        try { iframe.contentWindow.addEventListener("afterprint", onAfter); } catch (e) { cleanup(); }
    };

    iframe.onload = function () { setTimeout(doPrint, 100); };
    var doc = iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();
}

/* ═══════════════════════════════════════════════════════════
   EXPORT MENU
   ═══════════════════════════════════════════════════════════ */
function ExportMenu(_ref) {
    var data = _ref.data, onAction = _ref.onAction;
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
                setTimeout(function () { setCopied(false); setOpen(false); if (onAction) onAction(); }, 1200);
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
        if (onAction) onAction();
    };

    return (
        <div ref={ref} style={{ position: "relative", display: "flex", flexDirection: "column" }}>
            <button onClick={function () { setOpen(!open); }} aria-label="Export" style={{
                ...segBtnStyle,
                background: open ? C.bgHover : "transparent",
                color: open ? C.text : C.textMuted,
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
                        borderBottom: "1px solid " + C.border, color: C.text, cursor: "pointer",
                    }}>💾  Download .txt</button>
                    <button onClick={function () { setOpen(false); printPDF(data); if (onAction) onAction(); }} style={{
                        width: "100%", padding: "12px 14px", fontSize: 13, fontFamily: C.fontCond,
                        fontWeight: 600, textAlign: "left", background: "transparent", border: "none",
                        color: C.text, cursor: "pointer",
                    }}>🖨  Print / Save as PDF</button>
                </div>
            )}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════
   SAVE BUTTON & LOAD MENU
   ═══════════════════════════════════════════════════════════ */
function SaveButton(_ref) {
    var data = _ref.data, onAction = _ref.onAction, confirm = _ref.confirm;
    var _s = useState(false), saved = _s[0], setSaved = _s[1];
    var commit = function () {
        saveToLibrary(data);
        setSaved(true);
        setTimeout(function () { setSaved(false); }, 1400);
        if (onAction) onAction();
    };
    var onClick = function () {
        var dupLabel = findDuplicateLabel(data);
        if (!dupLabel) { commit(); return; }
        confirm({
            title: "Overwrite saved analysis",
            message: "An analysis for " + dupLabel + " already exists. Overwrite it?",
            confirmLabel: "Overwrite",
        }).then(function (ok) { if (ok) commit(); });
    };
    return (
        <button onClick={onClick} aria-label="Save analysis" style={{
            ...segBtnStyle,
            background: saved ? C.accent : "transparent",
            color: saved ? C.bg : C.textMuted,
        }}>{saved ? "✓ Saved" : "Save"}</button>
    );
}

function LoadMenu(_ref) {
    var onLoad = _ref.onLoad, currentData = _ref.currentData, onAction = _ref.onAction, confirm = _ref.confirm;
    var _o = useState(false), open = _o[0], setOpen = _o[1];
    var _l = useState([]), lib = _l[0], setLib = _l[1];
    var ref = useRef(null);

    useEffect(function () {
        if (!open) return;
        setLib(loadLibrary());
        var handler = function (e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener("pointerdown", handler);
        return function () { document.removeEventListener("pointerdown", handler); };
    }, [open]);

    var hasContent = function (d) {
        return !!(d && (d.match.opponent || d.match.ourTeam || d.match.date ||
            (d.observations && d.observations.length) ||
            (d.summary && (d.summary.problems || d.summary.opportunities || d.summary.notes))));
    };

    var doLoad = function (entry) {
        onLoad(entry.data);
        setOpen(false);
        if (onAction) onAction();
    };

    var load = function (entry) {
        if (!hasContent(currentData)) { doLoad(entry); return; }
        confirm({
            title: "Replace current analysis",
            message: "Replace the current analysis with " + (entry.ourTeam || "Our Team") + " vs " + (entry.opponent || "Opponent") + "?",
            confirmLabel: "Replace",
        }).then(function (ok) { if (ok) doLoad(entry); });
    };

    var remove = function (e, entry) {
        e.stopPropagation();
        var label = (entry.ourTeam || "Our Team") + " vs " + (entry.opponent || "Opponent");
        confirm({
            title: "Delete saved analysis",
            message: "Delete saved analysis: " + label + "?",
            confirmLabel: "Delete",
            danger: true,
        }).then(function (ok) {
            if (!ok) return;
            deleteFromLibrary(entry.id);
            setLib(loadLibrary());
        });
    };

    var fmtSavedAt = function (iso) {
        try { return new Date(iso).toLocaleDateString(); } catch (e) { return ""; }
    };

    return (
        <div ref={ref} style={{ position: "relative", display: "flex", flexDirection: "column" }}>
            <button onClick={function () { setOpen(!open); }} aria-label="Load saved analysis" style={{
                ...segBtnStyle,
                background: open ? C.bgHover : "transparent",
                color: open ? C.text : C.textMuted,
            }}>Load</button>
            {open && (
                <div style={{
                    position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 50,
                    background: C.bgCard, border: "1px solid " + C.borderActive, borderRadius: 6,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.5)", minWidth: 260, maxWidth: 320,
                    maxHeight: 340, overflowY: "auto",
                }}>
                    {lib.length === 0 && (
                        <div style={{ padding: "14px", fontSize: 12, color: C.textMuted, fontFamily: C.fontCond, textAlign: "center" }}>
                            No saved analyses yet.
                        </div>
                    )}
                    {lib.map(function (entry) {
                        var title = (entry.ourTeam || "Our Team") + " vs " + (entry.opponent || "Opponent");
                        return (
                            <div key={entry.id} onClick={function () { load(entry); }} style={{
                                display: "flex", alignItems: "center", gap: 6, padding: "10px 12px",
                                borderBottom: "1px solid " + C.border, cursor: "pointer",
                            }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{
                                        fontSize: 13, fontFamily: C.fontCond, fontWeight: 700,
                                        color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                                    }}>{title}</div>
                                    <div style={{ fontSize: 10, color: C.textDim, marginTop: 2, lineHeight: 1.4 }}>
                                        {entry.date && (<div>Match date: {entry.date}</div>)}
                                        <div>Save date: {fmtSavedAt(entry.savedAt)}</div>
                                    </div>
                                </div>
                                <button onClick={function (e) { remove(e, entry); }} aria-label="Delete" style={{
                                    background: "transparent", border: "1px solid " + C.danger + "55",
                                    color: C.danger, borderRadius: 3, padding: "3px 7px", fontSize: 11,
                                    cursor: "pointer", flexShrink: 0,
                                }}>✕</button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════
   ACCORDION PILL
   Mobile-only: collapses a header button group into a single
   pill. Tapping it floats the full group upward as an overlay.
   ═══════════════════════════════════════════════════════════ */
function AccordionPill(_ref) {
    var label = _ref.label, open = _ref.open, onToggle = _ref.onToggle,
        align = _ref.align, children = _ref.children;
    var ref = useRef(null);
    var _p = useState(null), pos = _p[0], setPos = _p[1];

    useEffect(function () {
        if (!open) { setPos(null); return; }
        // The overlay floats upward from the pill. It uses fixed positioning
        // so it can extend past the app's clipped (overflow:hidden) bounds.
        var measure = function () {
            if (!ref.current) return;
            var r = ref.current.getBoundingClientRect();
            var next = { bottom: Math.round(window.innerHeight - r.bottom) };
            if (align === "right") next.right = Math.round(window.innerWidth - r.right);
            else next.left = Math.round(r.left);
            setPos(next);
        };
        measure();
        var handler = function (e) {
            if (ref.current && !ref.current.contains(e.target)) onToggle(false);
        };
        document.addEventListener("pointerdown", handler);
        window.addEventListener("resize", measure);
        return function () {
            document.removeEventListener("pointerdown", handler);
            window.removeEventListener("resize", measure);
        };
    }, [open, align]);

    return (
        <div ref={ref} style={{ position: "relative" }}>
            <button onClick={function () { onToggle(!open); }} aria-expanded={open}
                style={{
                    ...segBtnStyle, padding: "10px 14px", background: C.bgInput,
                    border: "1px solid " + C.border, borderRadius: 4, color: C.text,
                    visibility: (open && pos) ? "hidden" : "visible",
                }}>{label}</button>
            {open && pos && (
                <div style={{ position: "fixed", zIndex: 1000, ...pos }}>
                    {children}
                </div>
            )}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════
   ERROR BOUNDARY
   A class component because that's the only way React lets us
   catch render errors. Wraps each tab panel so one section
   crashing doesn't blank the whole app — the scout's notes live
   in localStorage and survive a render error.
   ═══════════════════════════════════════════════════════════ */
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
        this.handleRetry = this.handleRetry.bind(this);
    }
    static getDerivedStateFromError(error) {
        return { error: error };
    }
    componentDidCatch(error, info) {
        console.error("ErrorBoundary caught error in " + (this.props.section || "section") + ":", error, info);
    }
    handleRetry() {
        this.setState({ error: null });
    }
    render() {
        if (!this.state.error) return this.props.children;
        var section = this.props.section || "this section";
        return (
            <div role="alert" style={{
                padding: 24, height: "100%", display: "flex",
                flexDirection: "column", alignItems: "center", justifyContent: "center",
                textAlign: "center", color: C.text, fontFamily: C.font, gap: 14,
            }}>
                <div style={{
                    fontSize: 11, fontFamily: C.fontCond, fontWeight: 800,
                    textTransform: "uppercase", letterSpacing: 2, color: C.danger,
                }}>Something went wrong</div>
                <div style={{ fontSize: 14, lineHeight: 1.4, maxWidth: 360, color: C.textMuted }}>
                    The {section} view hit an error and stopped rendering.
                    Your saved work is safe — it's stored locally and untouched by this crash.
                </div>
                <button onClick={this.handleRetry} style={{
                    ...segBtnStyle, padding: "8px 16px",
                    background: C.accent, color: C.bg,
                }}>Reload this section</button>
            </div>
        );
    }
}

/* ═══════════════════════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════════════════════ */
function App() {
    var _d = useState(INITIAL_DATA), data = _d[0], setData = _d[1];
    var _t = useState("board"), tab = _t[0], setTab = _t[1];
    var _l = useState(false), loaded = _l[0], setLoaded = _l[1];
    var clock = useMatchClock();
    var isMobile = useIsMobile();
    var _om = useState(null), openMenu = _om[0], setOpenMenu = _om[1];
    var _cf = useConfirm(), confirm = _cf.confirm, confirmModal = _cf.modal;

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
        confirm({
            title: "Reset all data",
            message: "Clear all data and start fresh?",
            confirmLabel: "Reset",
            danger: true,
        }).then(function (ok) {
            if (!ok) return;
            setData(INITIAL_DATA);
            clearSaved();
        });
    };

    var tabs = [
        { id: "board", label: "Board" },
        { id: "timeline", label: "Timeline" },
        { id: "scout", label: "Scout" }
    ];

    var activeViewLabel = (tabs.find(function (t) { return t.id === tab; }) || tabs[0]).label;
    var closeMenus = function () { setOpenMenu(null); };

    var tabGroup = (
        <div style={{
            ...segGroupStyle,
            flexDirection: isMobile ? "column" : "row",
            alignItems: isMobile ? "stretch" : "center",
        }}>
            {tabs.map(function (t) {
                var active = tab === t.id;
                return (
                    <button key={t.id}
                        onClick={function () { setTab(t.id); closeMenus(); }}
                        aria-label={t.label} aria-current={active ? "page" : undefined}
                        style={{
                            ...segBtnStyle,
                            background: active ? C.accent : "transparent",
                            color: active ? C.bg : C.textDim,
                        }}>{t.label}</button>
                );
            })}
        </div>
    );

    var actionGroup = (
        <div style={{
            ...segGroupStyle,
            flexDirection: isMobile ? "column" : "row",
            alignItems: isMobile ? "stretch" : "center",
        }}>
            <SaveButton data={data} onAction={closeMenus} confirm={confirm} />
            <LoadMenu currentData={data} onAction={closeMenus} confirm={confirm} onLoad={function (d) {
                var merged = { ...INITIAL_DATA, ...d };
                var idMap = {};
                merged.boards = (merged.boards || []).map(function (b) {
                    var newId = uid();
                    idMap[b.id] = newId;
                    return { ...b, id: newId };
                });
                merged.activeBoard = idMap[merged.activeBoard] || (merged.boards[0] ? merged.boards[0].id : "");
                setData(merged);
            }} />
            <ExportMenu data={data} onAction={closeMenus} />
            <button onClick={function () { resetAll(); closeMenus(); }} aria-label="Reset" style={{
                ...segBtnStyle,
                background: "transparent",
                color: C.danger,
            }}>Reset</button>
        </div>
    );

    return (
        <div style={{
            display: "flex", flexDirection: "column", background: C.bg, fontFamily: C.font, color: C.text,
            overflow: "hidden", height: "100%",
        }}>
            {confirmModal}
            {/* Header */}
            <div style={{
                display: "flex", flexDirection: "column",
                padding: isMobile ? "8px 10px 4px" : "8px 10px",
                background: C.bgCard, borderBottom: "1px solid " + C.border, gap: 8, flexShrink: 0,
            }}>
                <h1 style={{
                    margin: 0, fontSize: 15, fontFamily: C.fontCond, fontWeight: 800,
                    textTransform: "uppercase", letterSpacing: 2, color: C.text,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    textAlign: "center",
                }}>
                    {(data.match.ourTeam || "Our Team") + " vs " + (data.match.opponent || "Opponent")}
                </h1>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {/* Left zone — view tabs (stacks vertically on mobile).
                        Bottom-aligned on mobile so the tabs sit close to the
                        header's lower border, even though the action group is
                        one Reset row taller. */}
                    <div style={{
                        flex: "1 1 0", minWidth: 0, display: "flex",
                        justifyContent: "flex-start", alignItems: "center",
                        alignSelf: isMobile ? "flex-end" : "center",
                    }}>
                        {isMobile ? (
                            <AccordionPill label={activeViewLabel} align="left"
                                open={openMenu === "tabs"}
                                onToggle={function (v) { setOpenMenu(v ? "tabs" : null); }}>
                                {tabGroup}
                            </AccordionPill>
                        ) : tabGroup}
                    </div>
                    {/* Center zone — match clock. Bottom-aligned on mobile so
                        it sits near the lower border like the button groups. */}
                    <div style={{
                        flexShrink: 0, display: "flex", alignItems: "center", gap: 5, background: C.bg,
                        padding: "4px 8px", borderRadius: 4, border: "1px solid " + C.border,
                        alignSelf: isMobile ? "flex-end" : "center",
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
                    {/* Right zone — actions. Reset is the final segment of the
                        Save/Load/Export group; the group stacks on mobile. */}
                    <div style={{
                        flex: "1 1 0", minWidth: 0, display: "flex",
                        justifyContent: "flex-end", alignItems: "center",
                    }}>
                        {isMobile ? (
                            <AccordionPill label="Actions" align="right"
                                open={openMenu === "actions"}
                                onToggle={function (v) { setOpenMenu(v ? "actions" : null); }}>
                                {actionGroup}
                            </AccordionPill>
                        ) : actionGroup}
                    </div>
                </div>
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
                    <ErrorBoundary section="tactical board">
                        <TacticalBoard boards={data.boards} activeBoard={data.activeBoard}
                            onUpdate={updateBoard} onSetActive={setActiveBoard}
                            onAddBoard={addBoard} onRenameBoard={renameBoard} onDeleteBoard={deleteBoard} />
                    </ErrorBoundary>
                </div>
                <div style={{ display: tab === "scout" ? "block" : "none", height: "100%", overflowY: "auto" }}>
                    <ErrorBoundary section="scouting form">
                        <ScoutingForm data={data.scouting} matchInfo={data.match}
                            onUpdateMatch={updateMatch} onUpdateSection={updateSection} onUpdateSetPieces={updateSetPieces} />
                    </ErrorBoundary>
                </div>
                <div style={{ display: tab === "timeline" ? "block" : "none", height: "100%", overflowY: "auto" }}>
                    <ErrorBoundary section="timeline">
                        <MatchTimeline momentum={data.momentum} onMomentumChange={updateMomentum}
                            observations={data.observations} onAddObservation={addObservation}
                            onDeleteObservation={deleteObservation} summary={data.summary}
                            onUpdateSummary={updateSummary} clockMinute={clock.minute} />
                    </ErrorBoundary>
                </div>
            </div>
        </div>
    );
}