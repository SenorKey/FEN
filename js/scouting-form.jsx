/*
 * scouting-form.jsx — The opponent scouting form.
 *
 * Contains collapsible sections for each phase of play:
 * build-up, progression, pressing, defensive block,
 * positive/negative transitions, and set pieces.
 *
 * ── DEPENDS ON (from app.jsx, loaded before this file) ──
 *   Globals: C
 *   Components: Field, ToggleGroup, Section, Label, Spacer
 *   React hooks: useState
 *
 * ── EXPORTS (to global scope) ──
 *   ScoutingForm  — used by App in app.jsx
 */

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