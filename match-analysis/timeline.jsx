/*
 * timeline.jsx — Match timeline: momentum tracker,
 *                live observations, and match summary.
 *
 * ── DEPENDS ON (from app.jsx, loaded before this file) ──
 *   Globals: C, uid
 *   Components: Field
 *   React hooks: useState
 *
 * ── EXPORTS (to global scope) ──
 *   MatchTimeline  — used by App in app.jsx
 */

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