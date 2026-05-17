// session-planning.jsx (v2)
// =====================================================================
// Session Planning module — weekly microcycle, session editor, templates.
//
// Exposes globals (this file is loaded as a non-module <script>):
//   - SessionPlanning         → the root React component to render in App.
//   - spSeedWeekFromMatch     → bridge fn match-analysis can call to seed
//                               a new week's carryover from a saved match.
//
// Persistence: localStorage under SP_STORAGE_KEY (versioned key — bump
// the suffix and add a migration in `spLoad` when the shape changes).
//
// Convention notes:
//   - Inline styles driven by `C` theme tokens (matching the rest of
//     the app). Tokens are accessed via spTok(key) which falls back to
//     sensible dark-forest defaults if a key isn't on C.
//   - Each leaf component is annotated with a `// SWAP:` comment naming
//     the existing primitive (Section, Field, ToggleGroup, etc.) that
//     can replace it once those APIs are mapped.
//
// File layout:
//   1.  Constants
//   2.  Theme adapter + fallback tokens
//   3.  Pure helpers (id, dates, MD-X math, persistence, str→arr)
//   4.  Mobile detection hook
//   5.  Style registry (computed once per render via spMkStyles)
//   6.  Factories (make week / day / session / activity)
//   7.  Reducer + initial state
//   8.  Bridge: spSeedWeekFromMatch + sp:hydrate event
//   9.  Styled leaf components (SPButton, SPInput, SPCollapsible, …)
//  10.  Weekly microcycle view (responsive)
//  11.  Single session view
//  12.  Templates view (renamed from "Library")
//  13.  Root SessionPlanning component
// =====================================================================


// ─────────────────────────────────────────────────────────────────────
// 1. Constants
// ─────────────────────────────────────────────────────────────────────

const SP_STORAGE_KEY = 'fen-session-planning-v1';
const SP_MOBILE_BREAKPOINT = 640;

// Standard six-block session arc. New sessions start with this skeleton
// pre-populated; the coach can add / remove / reorder freely.
const SP_ACTIVITY_BLUEPRINT = [
  { type: 'warmup',    name: 'Warm-up / Activation' },
  { type: 'technical', name: 'Technical' },
  { type: 'tactical',  name: 'Tactical / Positional' },
  { type: 'game',      name: 'Game-related' },
  { type: 'ssg',       name: 'Small-sided / Scrimmage' },
  { type: 'cooldown',  name: 'Cool-down' },
];

const SP_FOUR_CORNERS = [
  { id: 'technical',     label: 'Technical' },
  { id: 'tactical',      label: 'Tactical' },
  { id: 'physical',      label: 'Physical' },
  { id: 'psychological', label: 'Psychological' },
];

const SP_GAME_PHASES = [
  { id: 'attacking',   label: 'Attacking' },
  { id: 'defending',   label: 'Defending' },
  { id: 'transitions', label: 'Transitions' },
  { id: 'set_pieces',  label: 'Set Pieces' },
];

const SP_LOAD_TAGS      = ['', 'high', 'moderate', 'low'];
const SP_INTENSITY_TAGS = ['', 'high', 'low'];

const SP_AVAILABILITY_STATUSES = [
  'available', 'injured', 'returning', 'suspended', 'international',
];


// ─────────────────────────────────────────────────────────────────────
// 2. Theme adapter
// ─────────────────────────────────────────────────────────────────────
//
// The existing app uses a `C` theme object with inline styles. We read
// from C if it's defined, otherwise fall back to dark-forest defaults
// so the module renders coherently even before C is wired up.
//
// Expected keys on C: bg, surface, surfaceAlt, fg, fgMuted, border,
// accent, accentSoft, danger, fontDisplay, fontBody. Adjust the
// fallback object below if your token names differ.

const SP_FALLBACK_TOKENS = {
  bg:           '#0e1612',
  surface:      '#162119',
  surfaceAlt:   '#1e2c23',
  fg:           '#e6ede8',
  fgMuted:      '#8a9c8f',
  border:       '#2c3c33',
  accent:       '#7fbc8c',
  accentSoft:   '#3d5f48',
  danger:       '#d97070',
  fontDisplay:  "'Saira Condensed', 'Saira', system-ui, sans-serif",
  fontBody:     "'Saira', system-ui, sans-serif",
};

// The existing app's `C` object uses different token names than the ones
// this module expects. Map planner-side names → app-side names so the
// shared theme propagates without changing either side.
const SP_C_ALIASES = {
  surface:     'bgCard',
  surfaceAlt:  'bgInput',
  fg:          'text',
  fgMuted:     'textMuted',
  accentSoft:  'accentDim',
  danger:      'red',
  fontDisplay: 'fontCond',
  fontBody:    'font',
};

function spTok(key) {
  if (typeof C !== 'undefined' && C) {
    if (C[key] != null) return C[key];
    const alias = SP_C_ALIASES[key];
    if (alias && C[alias] != null) return C[alias];
  }
  return SP_FALLBACK_TOKENS[key];
}


// ─────────────────────────────────────────────────────────────────────
// 3. Pure helpers
// ─────────────────────────────────────────────────────────────────────

function spId() {
  return typeof uid === 'function' ? uid() : Math.random().toString(36).slice(2, 10);
}

// MD-X label for a day position in a microcycle. Pure function — easy
// to unit-test. Last day = MD; first `recoveryDays` = MD+1, MD+2;
// everything between counts back from MD.
function spCalcMDTag(dayIndex, totalDays, recoveryDays) {
  const matchDayIndex = totalDays - 1;
  if (dayIndex === matchDayIndex) return 'MD';
  if (dayIndex < recoveryDays) return `MD+${dayIndex + 1}`;
  return `MD-${matchDayIndex - dayIndex}`;
}

function spDefaultRecovery(totalDays) {
  return totalDays <= 5 ? 1 : 2;
}

// Dates as yyyy-mm-dd strings — timezone-safe through (de)serialization.
function spToday() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

function spAddDays(yyyyMmDd, n) {
  if (!yyyyMmDd) return yyyyMmDd;
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return [
    dt.getFullYear(),
    String(dt.getMonth() + 1).padStart(2, '0'),
    String(dt.getDate()).padStart(2, '0'),
  ].join('-');
}

function spFormatDate(yyyyMmDd) {
  if (!yyyyMmDd) return '';
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

// Used by the carryover bridge. Match-analysis stores summary fields
// as freeform strings; this normalizes them into an array of items
// split on newlines (and bullet-style markers, just in case).
function spStrToArray(input) {
  if (Array.isArray(input)) return input.map(String).map(s => s.trim()).filter(Boolean);
  if (input == null) return [];
  return String(input)
    .split(/\r?\n|;|•|·/)
    .map(s => s.replace(/^[\s\-*]+/, '').trim())
    .filter(Boolean);
}

function spLoad() {
  try {
    const raw = localStorage.getItem(SP_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // DEFER: shape migrations land here when the key suffix bumps.
    return parsed;
  } catch (e) {
    console.warn('[session-planning] load failed', e);
    return null;
  }
}

function spSave(state) {
  try {
    localStorage.setItem(SP_STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('[session-planning] save failed', e);
  }
}


// ─────────────────────────────────────────────────────────────────────
// 4. Mobile detection
// ─────────────────────────────────────────────────────────────────────

function spUseIsMobile(breakpoint = SP_MOBILE_BREAKPOINT) {
  const [is, setIs] = React.useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false
  );
  React.useEffect(() => {
    function onResize() { setIs(window.innerWidth < breakpoint); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpoint]);
  return is;
}


// ─────────────────────────────────────────────────────────────────────
// 5. Style registry
// ─────────────────────────────────────────────────────────────────────
//
// Recomputed cheaply per render; values come from spTok() so theme
// swaps would propagate (if C ever becomes reactive). Grouped by role
// so refactoring one cluster doesn't ripple elsewhere.

function spMkStyles() {
  const accent     = spTok('accent');
  const accentSoft = spTok('accentSoft');
  const bg         = spTok('bg');
  const surface    = spTok('surface');
  const surfaceAlt = spTok('surfaceAlt');
  const fg         = spTok('fg');
  const fgMuted    = spTok('fgMuted');
  const border     = spTok('border');
  const danger     = spTok('danger');
  const fontBody   = spTok('fontBody');
  const fontDisp   = spTok('fontDisplay');

  return {
    root: {
      fontFamily: fontBody, color: fg, background: bg,
      padding: '1rem', minHeight: '100%', boxSizing: 'border-box',
    },
    tabs: {
      display: 'flex', flexWrap: 'wrap', gap: '0.5rem',
      alignItems: 'center', marginBottom: '1rem',
      borderBottom: `1px solid ${border}`, paddingBottom: '0.75rem',
    },
    card: {
      background: surface, border: `1px solid ${border}`,
      borderRadius: 4, padding: '0.75rem',
    },
    cardAlt: {
      background: surfaceAlt, border: `1px solid ${border}`,
      borderRadius: 4, padding: '0.75rem',
    },
    sectionHeader: {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      marginBottom: '0.5rem',
    },
    h2: {
      fontFamily: fontDisp, fontSize: '1.25rem', fontWeight: 600,
      letterSpacing: '0.02em', margin: '0 0 0.5rem 0', textTransform: 'uppercase',
    },
    h3: {
      fontFamily: fontDisp, fontSize: '1rem', fontWeight: 600,
      letterSpacing: '0.02em', margin: '0 0 0.5rem 0', textTransform: 'uppercase',
    },
    h4: {
      fontFamily: fontDisp, fontSize: '0.85rem', fontWeight: 600,
      letterSpacing: '0.04em', margin: '0 0 0.4rem 0', textTransform: 'uppercase',
      color: fgMuted,
    },
    btn: {
      background: surface, color: fg, border: `1px solid ${border}`,
      padding: '0.4rem 0.75rem', borderRadius: 3, cursor: 'pointer',
      fontFamily: 'inherit', fontSize: '0.85rem', lineHeight: 1.2,
    },
    btnPrimary: { background: accent, color: bg, borderColor: accent, fontWeight: 600 },
    btnGhost:   { background: 'transparent', borderColor: 'transparent', color: fgMuted },
    btnDanger:  { background: 'transparent', color: danger, borderColor: danger },
    btnActive:  { background: accentSoft, color: fg, borderColor: accent },
    btnIcon: {
      width: 28, height: 28, padding: 0,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '0.9rem',
    },
    input: {
      background: surfaceAlt, color: fg,
      border: `1px solid ${border}`, padding: '0.4rem 0.5rem',
      borderRadius: 3, fontFamily: 'inherit', fontSize: '0.9rem',
      width: '100%', boxSizing: 'border-box',
    },
    labelStack: {
      display: 'flex', flexDirection: 'column', gap: '0.25rem',
      fontSize: '0.75rem', color: fgMuted, textTransform: 'uppercase',
      letterSpacing: '0.05em',
    },
    chip: {
      background: surfaceAlt, color: fg, border: `1px solid ${border}`,
      padding: '0.3rem 0.6rem', borderRadius: 999, cursor: 'pointer',
      fontFamily: 'inherit', fontSize: '0.75rem', textTransform: 'uppercase',
      letterSpacing: '0.04em',
    },
    chipActive: { background: accent, color: bg, borderColor: accent },
    chips:      { display: 'flex', flexWrap: 'wrap', gap: '0.4rem' },
    collapsible: {
      border: `1px solid ${border}`, borderRadius: 4,
      marginTop: '0.75rem', background: surface,
    },
    collapsibleToggle: {
      width: '100%', textAlign: 'left',
      background: 'transparent', border: 0, color: fg,
      padding: '0.6rem 0.75rem', cursor: 'pointer',
      display: 'flex', alignItems: 'center', gap: '0.5rem',
      fontFamily: fontDisp, fontSize: '0.8rem', fontWeight: 600,
      letterSpacing: '0.04em', textTransform: 'uppercase',
    },
    collapsibleBody: {
      padding: '0.75rem', borderTop: `1px solid ${border}`,
      display: 'flex', flexDirection: 'column', gap: '0.75rem',
    },
    badge: {
      background: accentSoft, color: fg, borderRadius: 999,
      padding: '0.1rem 0.5rem', fontSize: '0.7rem', marginLeft: 'auto',
    },
    dayCellMatch: { background: accentSoft, borderColor: accent },
    mdTag: {
      fontFamily: fontDisp, fontSize: '0.7rem', fontWeight: 700,
      letterSpacing: '0.06em', color: accent, textTransform: 'uppercase',
    },
    dateLabel: { fontSize: '0.7rem', color: fgMuted },
    danger:    { color: danger },
    muted:     { color: fgMuted },
  };
}


// ─────────────────────────────────────────────────────────────────────
// 6. Factories
// ─────────────────────────────────────────────────────────────────────

function spMakeActivity(type = 'technical', name = 'Activity') {
  return {
    id: spId(), type, name,
    duration: '', organization: '', description: '',
    coachingPoints: '', progressions: '', notes: '', diagram: '',
  };
}

function spMakeSession({ date = spToday(), mdTag = '', dayId = null } = {}) {
  return {
    id: spId(), dayId, name: '',
    date, mdTag,
    theme: '', duration: '', playerCount: '', ageGroup: '',
    location: '', equipment: '',
    objectives: { technical: false, tactical: false, physical: false, psychological: false },
    gamePhase:  { attacking: false, defending: false, transitions: false, set_pieces: false },
    mainObjective: '',
    activities: SP_ACTIVITY_BLUEPRINT.map(b => spMakeActivity(b.type, b.name)),
    reflection: { worked: '', didnt: '', revisit: '', playerNotes: '' },
    isTemplate: false, templateName: '',
  };
}

function spMakeDay(dayIndex, totalDays, weekStartDate, recoveryDays) {
  return {
    id: spId(), dayIndex,
    date: spAddDays(weekStartDate, dayIndex),
    mdTag: spCalcMDTag(dayIndex, totalDays, recoveryDays),
    theme: '', load: '', intensity: '',
    sessionId: null,
  };
}

function spMakeWeek({
  anchorDate = spToday(),
  opponent = '', venue = '', competition = '',
  length = 7,
} = {}) {
  const recoveryDays = spDefaultRecovery(length);
  const startDate = spAddDays(anchorDate, -(length - 1));
  const days = Array.from({ length }, (_, i) =>
    spMakeDay(i, length, startDate, recoveryDays)
  );
  return {
    id: spId(),
    anchor: { date: anchorDate, opponent, venue, competition },
    length, recoveryDays, days,
    availability: [],
    carryover: { problems: [], opportunities: [] },
  };
}


// ─────────────────────────────────────────────────────────────────────
// 7. Reducer + initial state
// ─────────────────────────────────────────────────────────────────────

const spInitialState = {
  weeks: {}, sessions: {}, weekOrder: [], currentWeekId: null,
};

function spPatch(obj, patch) { return { ...obj, ...patch }; }
function spPatchAt(map, id, patch) {
  return { ...map, [id]: spPatch(map[id], patch) };
}

function spReducer(state, action) {
  switch (action.type) {

    case 'CREATE_WEEK': {
      const week = spMakeWeek(action.payload || {});
      return {
        ...state,
        weeks: { ...state.weeks, [week.id]: week },
        weekOrder: [...state.weekOrder, week.id],
        currentWeekId: week.id,
      };
    }

    case 'SELECT_WEEK':
      return { ...state, currentWeekId: action.weekId };

    case 'UPDATE_WEEK_ANCHOR': {
      // Date changes shift every day; MD-X tags depend on position.
      const w = state.weeks[action.weekId];
      if (!w) return state;
      const anchor = { ...w.anchor, ...action.patch };
      const startDate = spAddDays(anchor.date, -(w.length - 1));
      const days = w.days.map((d, i) => ({ ...d, date: spAddDays(startDate, i) }));
      return { ...state, weeks: spPatchAt(state.weeks, action.weekId, { anchor, days }) };
    }

    case 'UPDATE_WEEK_LENGTH': {
      // Sessions linked to dropped days remain in `sessions` map and
      // stay accessible via Templates — no silent data loss.
      const w = state.weeks[action.weekId];
      if (!w) return state;
      const length = Math.max(3, Math.min(10, action.length));
      const recoveryDays = spDefaultRecovery(length);
      const startDate = spAddDays(w.anchor.date, -(length - 1));
      const newDays = Array.from({ length }, (_, i) => {
        const existing = w.days[i];
        const fresh = spMakeDay(i, length, startDate, recoveryDays);
        return existing
          ? { ...fresh, theme: existing.theme, load: existing.load,
              intensity: existing.intensity, sessionId: existing.sessionId }
          : fresh;
      });
      return {
        ...state,
        weeks: spPatchAt(state.weeks, action.weekId, { length, recoveryDays, days: newDays }),
      };
    }

    case 'UPDATE_DAY': {
      const w = state.weeks[action.weekId];
      if (!w) return state;
      const days = w.days.map(d =>
        d.id === action.dayId ? { ...d, ...action.patch } : d
      );
      return { ...state, weeks: spPatchAt(state.weeks, action.weekId, { days }) };
    }

    case 'UPDATE_CARRYOVER':
      return {
        ...state,
        weeks: spPatchAt(state.weeks, action.weekId, { carryover: action.carryover }),
      };

    case 'UPDATE_AVAILABILITY':
      return {
        ...state,
        weeks: spPatchAt(state.weeks, action.weekId, { availability: action.availability }),
      };

    case 'DELETE_WEEK': {
      const { [action.weekId]: _, ...rest } = state.weeks;
      const weekOrder = state.weekOrder.filter(id => id !== action.weekId);
      const currentWeekId = state.currentWeekId === action.weekId
        ? (weekOrder[weekOrder.length - 1] || null)
        : state.currentWeekId;
      return { ...state, weeks: rest, weekOrder, currentWeekId };
    }

    case 'DUPLICATE_WEEK': {
      const src = state.weeks[action.weekId];
      if (!src) return state;
      const newWeek = spMakeWeek({
        anchorDate: action.newAnchorDate || spAddDays(src.anchor.date, 7),
        opponent: '', length: src.length,
      });
      const newSessions = { ...state.sessions };
      newWeek.days = newWeek.days.map((d, i) => {
        const srcDay = src.days[i];
        if (!srcDay) return d;
        let sessionId = null;
        if (srcDay.sessionId && state.sessions[srcDay.sessionId]) {
          const srcSession = state.sessions[srcDay.sessionId];
          const cloned = {
            ...JSON.parse(JSON.stringify(srcSession)),
            id: spId(), dayId: d.id,
            date: d.date, mdTag: d.mdTag,
            reflection: { worked: '', didnt: '', revisit: '', playerNotes: '' },
            isTemplate: false, templateName: '',
          };
          cloned.activities = cloned.activities.map(a => ({ ...a, id: spId(), notes: '' }));
          newSessions[cloned.id] = cloned;
          sessionId = cloned.id;
        }
        return { ...d, theme: srcDay.theme, load: srcDay.load,
                 intensity: srcDay.intensity, sessionId };
      });
      newWeek.carryover = {
        problems: [...src.carryover.problems],
        opportunities: [...src.carryover.opportunities],
      };
      newWeek.availability = src.availability.map(p => ({ ...p, id: spId() }));
      return {
        ...state,
        weeks: { ...state.weeks, [newWeek.id]: newWeek },
        sessions: newSessions,
        weekOrder: [...state.weekOrder, newWeek.id],
        currentWeekId: newWeek.id,
      };
    }

    case 'CREATE_SESSION_FOR_DAY': {
      const w = state.weeks[action.weekId];
      if (!w) return state;
      const day = w.days.find(d => d.id === action.dayId);
      if (!day) return state;
      const session = spMakeSession({ date: day.date, mdTag: day.mdTag, dayId: day.id });
      const days = w.days.map(d =>
        d.id === action.dayId ? { ...d, sessionId: session.id } : d
      );
      return {
        ...state,
        sessions: { ...state.sessions, [session.id]: session },
        weeks: spPatchAt(state.weeks, action.weekId, { days }),
      };
    }

    case 'UPDATE_SESSION':
      return {
        ...state,
        sessions: spPatchAt(state.sessions, action.sessionId, action.patch),
      };

    case 'UPDATE_SESSION_NESTED': {
      const s = state.sessions[action.sessionId];
      if (!s) return state;
      const next = { ...s, [action.key]: { ...s[action.key], ...action.patch } };
      return { ...state, sessions: { ...state.sessions, [action.sessionId]: next } };
    }

    case 'DELETE_SESSION': {
      const { [action.sessionId]: _, ...rest } = state.sessions;
      const weeks = Object.fromEntries(
        Object.entries(state.weeks).map(([wid, w]) => [
          wid,
          {
            ...w,
            days: w.days.map(d =>
              d.sessionId === action.sessionId ? { ...d, sessionId: null } : d
            ),
          },
        ])
      );
      return { ...state, sessions: rest, weeks };
    }

    case 'ADD_ACTIVITY': {
      const s = state.sessions[action.sessionId];
      if (!s) return state;
      const activities = [...s.activities, spMakeActivity('technical', 'New activity')];
      return { ...state, sessions: spPatchAt(state.sessions, action.sessionId, { activities }) };
    }

    case 'UPDATE_ACTIVITY': {
      const s = state.sessions[action.sessionId];
      if (!s) return state;
      const activities = s.activities.map(a =>
        a.id === action.activityId ? { ...a, ...action.patch } : a
      );
      return { ...state, sessions: spPatchAt(state.sessions, action.sessionId, { activities }) };
    }

    case 'REMOVE_ACTIVITY': {
      const s = state.sessions[action.sessionId];
      if (!s) return state;
      const activities = s.activities.filter(a => a.id !== action.activityId);
      return { ...state, sessions: spPatchAt(state.sessions, action.sessionId, { activities }) };
    }

    case 'MOVE_ACTIVITY': {
      const s = state.sessions[action.sessionId];
      if (!s) return state;
      const idx = s.activities.findIndex(a => a.id === action.activityId);
      const target = idx + action.direction;
      if (idx < 0 || target < 0 || target >= s.activities.length) return state;
      const activities = [...s.activities];
      [activities[idx], activities[target]] = [activities[target], activities[idx]];
      return { ...state, sessions: spPatchAt(state.sessions, action.sessionId, { activities }) };
    }

    case 'SAVE_AS_TEMPLATE': {
      const src = state.sessions[action.sessionId];
      if (!src) return state;
      const tpl = {
        ...JSON.parse(JSON.stringify(src)),
        id: spId(), dayId: null, date: '',
        reflection: { worked: '', didnt: '', revisit: '', playerNotes: '' },
        isTemplate: true,
        templateName: action.name || src.theme || 'Untitled template',
      };
      tpl.activities = tpl.activities.map(a => ({ ...a, id: spId(), notes: '' }));
      return { ...state, sessions: { ...state.sessions, [tpl.id]: tpl } };
    }

    case 'APPLY_TEMPLATE_TO_DAY': {
      const tpl = state.sessions[action.templateId];
      const w = state.weeks[action.weekId];
      if (!tpl || !w) return state;
      const day = w.days.find(d => d.id === action.dayId);
      if (!day) return state;
      const cloned = {
        ...JSON.parse(JSON.stringify(tpl)),
        id: spId(), dayId: day.id,
        date: day.date, mdTag: day.mdTag,
        isTemplate: false, templateName: '',
      };
      cloned.activities = cloned.activities.map(a => ({ ...a, id: spId() }));
      const days = w.days.map(d =>
        d.id === action.dayId ? { ...d, sessionId: cloned.id } : d
      );
      return {
        ...state,
        sessions: { ...state.sessions, [cloned.id]: cloned },
        weeks: spPatchAt(state.weeks, action.weekId, { days }),
      };
    }

    case 'HYDRATE':
      return action.state || state;

    default:
      return state;
  }
}


// ─────────────────────────────────────────────────────────────────────
// 8. Bridge: match-analysis → planner
// ─────────────────────────────────────────────────────────────────────
//
// Match-analysis (app.jsx) can call spSeedWeekFromMatch() from its Save
// handler to create a new microcycle anchored at today+7 with the
// match's Problems / Opportunities already populated as carryover.
//
// This function operates directly on localStorage and dispatches a
// 'sp:hydrate' DOM event. If SessionPlanning is mounted, it picks up
// the event and re-hydrates from storage. If not, the new week is
// waiting next time the planner opens.
//
// Returns the new week's id (so the caller can offer a deep-link to
// open the planner directly to that week, if desired).
//
// Usage from app.jsx:
//
//   if (typeof spSeedWeekFromMatch === 'function') {
//     spSeedWeekFromMatch({
//       summary:     state.summary,      // { problems, opportunities, notes }
//       matchDate:   state.match.date,   // yyyy-mm-dd string
//       opponent:    state.match.opponent,
//       venue:       state.match.venue,
//       competition: state.match.competition,
//     });
//   }

function spSeedWeekFromMatch({
  summary = {}, matchDate, opponent, venue, competition,
  // If matchDate is the date of the match JUST PLAYED, the next match
  // is typically a week later. Caller can override.
  nextMatchOffsetDays = 7,
} = {}) {
  const state = spLoad() || spInitialState;
  const anchor = matchDate ? spAddDays(matchDate, nextMatchOffsetDays) : spToday();
  const week = spMakeWeek({
    anchorDate: anchor,
    opponent: opponent || '',
    venue: venue || '',
    competition: competition || '',
  });
  week.carryover = {
    problems: spStrToArray(summary.problems),
    opportunities: spStrToArray(summary.opportunities),
  };
  const newState = {
    ...state,
    weeks: { ...state.weeks, [week.id]: week },
    weekOrder: [...state.weekOrder, week.id],
    currentWeekId: week.id,
  };
  spSave(newState);
  if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
    window.dispatchEvent(new CustomEvent('sp:hydrate', { detail: { weekId: week.id } }));
  }
  return week.id;
}


// ─────────────────────────────────────────────────────────────────────
// 9. Styled leaf components
// ─────────────────────────────────────────────────────────────────────

// SWAP: when your shared Button primitive is available, replace this.
function SPButton({ variant, active, style, children, ...rest }) {
  const s = spMkStyles();
  const composed = {
    ...s.btn,
    ...(variant === 'primary' ? s.btnPrimary : null),
    ...(variant === 'danger'  ? s.btnDanger  : null),
    ...(variant === 'ghost'   ? s.btnGhost   : null),
    ...(variant === 'icon'    ? s.btnIcon    : null),
    ...(active ? s.btnActive : null),
    ...style,
  };
  return <button type="button" style={composed} {...rest}>{children}</button>;
}

// SWAP: use the shared Field component when its API is mapped.
function SPField({ label, children, wide }) {
  const s = spMkStyles();
  return (
    <label style={{ ...s.labelStack, gridColumn: wide ? '1 / -1' : 'auto' }}>
      {label ? <span>{label}</span> : null}
      {children}
    </label>
  );
}

function SPInput(props) {
  const s = spMkStyles();
  return <input style={{ ...s.input, ...(props.style || {}) }} {...props} />;
}

function SPTextarea(props) {
  const s = spMkStyles();
  return <textarea style={{ ...s.input, resize: 'vertical', minHeight: 60, ...(props.style || {}) }} {...props} />;
}

function SPSelect({ children, style, ...rest }) {
  const s = spMkStyles();
  return <select style={{ ...s.input, ...style }} {...rest}>{children}</select>;
}

// SWAP: this is where the existing `Section` component plugs in.
function SPCollapsible({ title, defaultOpen = false, children, badge }) {
  const s = spMkStyles();
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div style={s.collapsible}>
      <button
        type="button" style={s.collapsibleToggle}
        onClick={() => setOpen(o => !o)} aria-expanded={open}
      >
        <span style={{ width: '0.8em' }}>{open ? '▾' : '▸'}</span>
        <span>{title}</span>
        {badge ? <span style={s.badge}>{badge}</span> : null}
      </button>
      {open ? <div style={s.collapsibleBody}>{children}</div> : null}
    </div>
  );
}

// SWAP: maps onto the existing ToggleGroup component.
function SPChipToggles({ options, values, onToggle }) {
  const s = spMkStyles();
  return (
    <div style={s.chips}>
      {options.map(opt => {
        const id = typeof opt === 'string' ? opt : opt.id;
        const label = typeof opt === 'string' ? opt : opt.label;
        const active = !!values[id];
        return (
          <button
            key={id || 'none'} type="button"
            style={{ ...s.chip, ...(active ? s.chipActive : null) }}
            onClick={() => onToggle(id)}
          >{label || '—'}</button>
        );
      })}
    </div>
  );
}

function SPStringList({ items, onChange, placeholder = 'Add item…' }) {
  const [draft, setDraft] = React.useState('');
  function commit() {
    const v = draft.trim();
    if (!v) return;
    onChange([...items, v]);
    setDraft('');
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      {items.length > 0 ? (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none',
                     display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {items.map((it, i) => (
            <li key={i}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem',
                         background: spTok('surfaceAlt'), padding: '0.3rem 0.5rem',
                         border: `1px solid ${spTok('border')}`, borderRadius: 3 }}>
              <span style={{ flex: 1 }}>{it}</span>
              <SPButton variant="icon"
                onClick={() => onChange(items.filter((_, j) => j !== i))}
                aria-label="Remove">×</SPButton>
            </li>
          ))}
        </ul>
      ) : null}
      <div style={{ display: 'flex', gap: '0.4rem' }}>
        <SPInput
          type="text" value={draft} placeholder={placeholder}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
        />
        <SPButton onClick={commit}>Add</SPButton>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────
// 10. Weekly microcycle view (responsive)
// ─────────────────────────────────────────────────────────────────────

function SPWeeklyView({ state, dispatch, onOpenSession, onOpenTemplates }) {
  const s = spMkStyles();
  const isMobile = spUseIsMobile();
  const week = state.weeks[state.currentWeekId];

  if (!week) {
    return (
      <div style={{ ...s.card, textAlign: 'center' }}>
        <h2 style={s.h2}>No microcycle yet</h2>
        <p style={s.muted}>Start by anchoring a week to a match.</p>
        <SPButton variant="primary" onClick={() => dispatch({ type: 'CREATE_WEEK' })}>
          Create week
        </SPButton>
      </div>
    );
  }

  function patchAnchor(patch) {
    dispatch({ type: 'UPDATE_WEEK_ANCHOR', weekId: week.id, patch });
  }
  function patchDay(dayId, patch) {
    dispatch({ type: 'UPDATE_DAY', weekId: week.id, dayId, patch });
  }
  function createSession(dayId) {
    dispatch({ type: 'CREATE_SESSION_FOR_DAY', weekId: week.id, dayId });
  }

  // Day grid: 1-column stack on mobile, week.length columns on desktop.
  const dayGridStyle = isMobile
    ? { display: 'flex', flexDirection: 'column', gap: '0.5rem' }
    : { display: 'grid', gap: '0.5rem',
        gridTemplateColumns: `repeat(${week.length}, minmax(0, 1fr))` };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* Week header */}
      <div style={s.card}>
        <div style={{
          display: 'grid', gap: '0.5rem',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(140px, 1fr))',
        }}>
          <SPField label="Opponent">
            <SPInput type="text" value={week.anchor.opponent}
              placeholder="e.g. Tarella FC"
              onChange={e => patchAnchor({ opponent: e.target.value })} />
          </SPField>
          <SPField label="Match date">
            <SPInput type="date" value={week.anchor.date}
              onChange={e => patchAnchor({ date: e.target.value })} />
          </SPField>
          <SPField label="Venue">
            <SPInput type="text" value={week.anchor.venue}
              placeholder="Home / Away"
              onChange={e => patchAnchor({ venue: e.target.value })} />
          </SPField>
          <SPField label="Competition">
            <SPInput type="text" value={week.anchor.competition}
              placeholder="League / Cup"
              onChange={e => patchAnchor({ competition: e.target.value })} />
          </SPField>
          <SPField label="Cycle length">
            <SPSelect value={week.length}
              onChange={e => dispatch({
                type: 'UPDATE_WEEK_LENGTH', weekId: week.id, length: Number(e.target.value),
              })}>
              {[5, 6, 7, 8].map(n => <option key={n} value={n}>{n} days</option>)}
            </SPSelect>
          </SPField>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.75rem' }}>
          <SPButton onClick={() => dispatch({ type: 'DUPLICATE_WEEK', weekId: week.id })}>
            Use as next week
          </SPButton>
          <SPButton onClick={onOpenTemplates}>Templates</SPButton>
          <SPButton variant="danger" onClick={() => {
            if (confirm('Delete this microcycle? Sessions remain in Templates.')) {
              dispatch({ type: 'DELETE_WEEK', weekId: week.id });
            }
          }}>Delete week</SPButton>
        </div>
      </div>

      {/* Day grid / stack */}
      <div style={dayGridStyle}>
        {week.days.map(day => (
          <SPDayCell
            key={day.id}
            day={day}
            isMobile={isMobile}
            onPatch={p => patchDay(day.id, p)}
            onCreateSession={() => createSession(day.id)}
            onOpenSession={() => onOpenSession(day.sessionId)}
          />
        ))}
      </div>

      {/* Carryover */}
      <SPCollapsible
        title="Carryover from last match"
        defaultOpen={true}
        badge={(week.carryover.problems.length + week.carryover.opportunities.length) || null}
      >
        <div style={{
          display: 'grid', gap: '1rem',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
        }}>
          <div>
            <h4 style={s.h4}>Key problems to address</h4>
            <SPStringList
              items={week.carryover.problems}
              onChange={problems => dispatch({
                type: 'UPDATE_CARRYOVER', weekId: week.id,
                carryover: { ...week.carryover, problems },
              })}
              placeholder="e.g. Losing midfield duels"
            />
          </div>
          <div>
            <h4 style={s.h4}>Opportunities</h4>
            <SPStringList
              items={week.carryover.opportunities}
              onChange={opportunities => dispatch({
                type: 'UPDATE_CARRYOVER', weekId: week.id,
                carryover: { ...week.carryover, opportunities },
              })}
              placeholder="e.g. Space in behind their FBs"
            />
          </div>
        </div>
      </SPCollapsible>

      {/* Availability */}
      <SPCollapsible title="Player availability" badge={week.availability.length || null}>
        <SPAvailabilityList
          items={week.availability}
          onChange={availability => dispatch({
            type: 'UPDATE_AVAILABILITY', weekId: week.id, availability,
          })}
        />
      </SPCollapsible>
    </div>
  );
}

function SPDayCell({ day, isMobile, onPatch, onCreateSession, onOpenSession }) {
  const s = spMkStyles();
  const isMatch = day.mdTag === 'MD';
  const cellStyle = {
    ...s.card,
    ...(isMatch ? s.dayCellMatch : null),
    display: 'flex', flexDirection: 'column', gap: '0.5rem',
    minHeight: isMobile ? 'auto' : 200,
  };
  return (
    <div style={cellStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={s.mdTag}>{day.mdTag}</span>
        <span style={s.dateLabel}>{spFormatDate(day.date)}</span>
      </div>

      <SPInput
        type="text"
        placeholder={isMatch ? 'Match' : 'Theme…'}
        value={day.theme}
        onChange={e => onPatch({ theme: e.target.value })}
        disabled={isMatch}
      />

      {!isMatch && (
        <SPCollapsible title="Load / Intensity">
          <SPField label="Load">
            <SPSelect value={day.load} onChange={e => onPatch({ load: e.target.value })}>
              {SP_LOAD_TAGS.map(t => <option key={t || 'none'} value={t}>{t || '—'}</option>)}
            </SPSelect>
          </SPField>
          <SPField label="Intensity">
            <SPSelect value={day.intensity} onChange={e => onPatch({ intensity: e.target.value })}>
              {SP_INTENSITY_TAGS.map(t => <option key={t || 'none'} value={t}>{t || '—'}</option>)}
            </SPSelect>
          </SPField>
        </SPCollapsible>
      )}

      {!isMatch && (
        <div style={{ marginTop: 'auto' }}>
          {day.sessionId
            ? <SPButton variant="primary" onClick={onOpenSession} style={{ width: '100%' }}>
                Open session
              </SPButton>
            : <SPButton onClick={onCreateSession} style={{ width: '100%' }}>
                + Plan session
              </SPButton>}
        </div>
      )}
    </div>
  );
}

function SPAvailabilityList({ items, onChange }) {
  const [name, setName] = React.useState('');
  function add() {
    const v = name.trim();
    if (!v) return;
    onChange([...items, { id: spId(), name: v, status: 'available' }]);
    setName('');
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      {items.map(p => (
        <div key={p.id}
             style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0.4rem' }}>
          <SPInput type="text" value={p.name}
            onChange={e => onChange(items.map(x =>
              x.id === p.id ? { ...x, name: e.target.value } : x))}
          />
          <SPSelect value={p.status}
            onChange={e => onChange(items.map(x =>
              x.id === p.id ? { ...x, status: e.target.value } : x))}
            style={{ width: 'auto' }}>
            {SP_AVAILABILITY_STATUSES.map(st => <option key={st} value={st}>{st}</option>)}
          </SPSelect>
          <SPButton variant="icon"
            onClick={() => onChange(items.filter(x => x.id !== p.id))}
            aria-label="Remove">×</SPButton>
        </div>
      ))}
      <div style={{ display: 'flex', gap: '0.4rem' }}>
        <SPInput type="text" placeholder="Player name" value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <SPButton onClick={add}>Add</SPButton>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────
// 11. Single session view
// ─────────────────────────────────────────────────────────────────────

function SPSessionView({ session, dispatch, onBack }) {
  const s = spMkStyles();
  const isMobile = spUseIsMobile();

  if (!session) {
    return (
      <div style={s.card}>
        <p>Session not found.</p>
        <SPButton onClick={onBack}>Back</SPButton>
      </div>
    );
  }

  function patch(p)              { dispatch({ type: 'UPDATE_SESSION', sessionId: session.id, patch: p }); }
  function patchNested(key, p)   { dispatch({ type: 'UPDATE_SESSION_NESTED', sessionId: session.id, key, patch: p }); }
  function patchActivity(aId, p) { dispatch({ type: 'UPDATE_ACTIVITY', sessionId: session.id, activityId: aId, patch: p }); }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* Header */}
      <div style={{ ...s.card, display: 'flex', flexWrap: 'wrap',
                    alignItems: 'center', gap: '0.5rem' }}>
        <SPButton variant="ghost" onClick={onBack}>← Back to week</SPButton>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline', marginLeft: 'auto' }}>
          {session.mdTag ? <span style={s.mdTag}>{session.mdTag}</span> : null}
          {session.date ? <span style={s.dateLabel}>{spFormatDate(session.date)}</span> : null}
        </div>
        <div style={{ width: isMobile ? '100%' : 'auto',
                       display: 'flex', gap: '0.4rem',
                       marginLeft: isMobile ? 0 : '0.5rem' }}>
          <SPButton onClick={() => {
            const name = prompt('Template name:', session.theme || 'Untitled template');
            if (name != null) dispatch({ type: 'SAVE_AS_TEMPLATE', sessionId: session.id, name });
          }}>Save as template</SPButton>
          {/* DEFER: PDF export, pocket-foldable print stylesheet. */}
        </div>
      </div>

      {/* Header fields */}
      <div style={{
        ...s.card,
        display: 'grid', gap: '0.6rem',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(140px, 1fr))',
      }}>
        <SPField label="Theme">
          <SPInput type="text" value={session.theme}
            placeholder="e.g. Pressing triggers in midfield"
            onChange={e => patch({ theme: e.target.value })} />
        </SPField>
        <SPField label="Duration (min)">
          <SPInput type="number" value={session.duration}
            onChange={e => patch({ duration: e.target.value })} />
        </SPField>
        <SPField label="# Players">
          <SPInput type="number" value={session.playerCount}
            onChange={e => patch({ playerCount: e.target.value })} />
        </SPField>
        <SPField label="Age group">
          <SPInput type="text" value={session.ageGroup}
            placeholder="U15 / Senior"
            onChange={e => patch({ ageGroup: e.target.value })} />
        </SPField>
        <SPField label="Location / Field">
          <SPInput type="text" value={session.location}
            onChange={e => patch({ location: e.target.value })} />
        </SPField>
        <SPField label="Equipment" wide>
          <SPInput type="text" value={session.equipment}
            placeholder="Cones, bibs, 10 balls, 4 mini-goals…"
            onChange={e => patch({ equipment: e.target.value })} />
        </SPField>
        <SPField label="Main objective" wide>
          <SPTextarea rows={2} value={session.mainObjective}
            placeholder="In a single sentence: what should the players take away?"
            onChange={e => patch({ mainObjective: e.target.value })} />
        </SPField>
      </div>

      {/* Advanced objectives (collapsed by default) */}
      <SPCollapsible title="Objectives breakdown">
        <div>
          <h4 style={s.h4}>Four corners</h4>
          <SPChipToggles
            options={SP_FOUR_CORNERS}
            values={session.objectives}
            onToggle={id => patchNested('objectives', { [id]: !session.objectives[id] })}
          />
        </div>
        <div>
          <h4 style={s.h4}>Game phase focus</h4>
          <SPChipToggles
            options={SP_GAME_PHASES}
            values={session.gamePhase}
            onToggle={id => patchNested('gamePhase', { [id]: !session.gamePhase[id] })}
          />
        </div>
      </SPCollapsible>

      {/* Activities */}
      <div style={s.card}>
        <div style={s.sectionHeader}>
          <h3 style={s.h3}>Activities</h3>
          <SPButton onClick={() => dispatch({ type: 'ADD_ACTIVITY', sessionId: session.id })}>
            + Add activity
          </SPButton>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {session.activities.map((a, i) => (
            <SPActivityBlock
              key={a.id}
              activity={a} index={i} total={session.activities.length} isMobile={isMobile}
              onPatch={p => patchActivity(a.id, p)}
              onMove={dir => dispatch({
                type: 'MOVE_ACTIVITY', sessionId: session.id,
                activityId: a.id, direction: dir,
              })}
              onRemove={() => dispatch({
                type: 'REMOVE_ACTIVITY', sessionId: session.id, activityId: a.id,
              })}
            />
          ))}
        </div>
      </div>

      {/* Reflection */}
      <SPCollapsible title="Post-session reflection">
        <SPField label="What worked">
          <SPTextarea rows={3} value={session.reflection.worked}
            onChange={e => patchNested('reflection', { worked: e.target.value })} />
        </SPField>
        <SPField label="What didn't">
          <SPTextarea rows={3} value={session.reflection.didnt}
            onChange={e => patchNested('reflection', { didnt: e.target.value })} />
        </SPField>
        <SPField label="Revisit next session">
          <SPTextarea rows={2} value={session.reflection.revisit}
            onChange={e => patchNested('reflection', { revisit: e.target.value })} />
        </SPField>
        <SPField label="Individual player notes">
          <SPTextarea rows={3} value={session.reflection.playerNotes}
            placeholder="Who struggled, who stood out, anything to flag for selection…"
            onChange={e => patchNested('reflection', { playerNotes: e.target.value })} />
        </SPField>
      </SPCollapsible>
    </div>
  );
}

function SPActivityBlock({ activity, index, total, isMobile, onPatch, onMove, onRemove }) {
  const s = spMkStyles();
  return (
    <div style={s.cardAlt}>
      {/* Header row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? 'auto 1fr' : 'auto 1fr auto auto',
        gap: '0.4rem', alignItems: 'center',
      }}>
        <span style={{ ...s.mdTag, minWidth: 18, textAlign: 'center' }}>{index + 1}</span>
        <SPInput type="text" value={activity.name}
          onChange={e => onPatch({ name: e.target.value })} />
        {!isMobile && (
          <SPInput type="text" value={activity.duration}
            placeholder="min" inputMode="numeric"
            style={{ width: 60 }}
            onChange={e => onPatch({ duration: e.target.value })} />
        )}
        {!isMobile && (
          <div style={{ display: 'flex', gap: '0.2rem' }}>
            <SPButton variant="icon" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move up">↑</SPButton>
            <SPButton variant="icon" onClick={() => onMove(1)} disabled={index === total - 1} aria-label="Move down">↓</SPButton>
            <SPButton variant="icon" onClick={onRemove} aria-label="Remove">×</SPButton>
          </div>
        )}
      </div>

      {/* On mobile, controls sit below the name */}
      {isMobile && (
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginTop: '0.4rem' }}>
          <SPInput type="text" value={activity.duration}
            placeholder="min" inputMode="numeric"
            style={{ flex: 1 }}
            onChange={e => onPatch({ duration: e.target.value })} />
          <SPButton variant="icon" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move up">↑</SPButton>
          <SPButton variant="icon" onClick={() => onMove(1)} disabled={index === total - 1} aria-label="Move down">↓</SPButton>
          <SPButton variant="icon" onClick={onRemove} aria-label="Remove">×</SPButton>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
        <SPField label="Organization">
          <SPInput type="text" value={activity.organization}
            placeholder="Space, # players, # balls"
            onChange={e => onPatch({ organization: e.target.value })} />
        </SPField>
        <SPField label="Description">
          <SPTextarea rows={2} value={activity.description}
            onChange={e => onPatch({ description: e.target.value })} />
        </SPField>
        <SPField label="Key coaching points">
          <SPTextarea rows={2} value={activity.coachingPoints}
            onChange={e => onPatch({ coachingPoints: e.target.value })} />
        </SPField>
        <SPCollapsible title="Progressions / Diagram / Notes">
          <SPField label="Progressions">
            <SPTextarea rows={2} value={activity.progressions}
              onChange={e => onPatch({ progressions: e.target.value })} />
          </SPField>
          <SPField label="Diagram notes">
            {/* DEFER: replace with a real drawing surface. */}
            <SPTextarea rows={2} value={activity.diagram}
              placeholder="Describe the setup (drawing tool coming)"
              onChange={e => onPatch({ diagram: e.target.value })} />
          </SPField>
          <SPField label="Observation / post-session notes">
            <SPTextarea rows={2} value={activity.notes}
              onChange={e => onPatch({ notes: e.target.value })} />
          </SPField>
        </SPCollapsible>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────
// 12. Templates view (renamed from "Library" to avoid colliding with
//     the existing match-analysis Library)
// ─────────────────────────────────────────────────────────────────────

function SPTemplatesView({ state, dispatch, onBack, onOpenSession }) {
  const s = spMkStyles();
  const isMobile = spUseIsMobile();
  // Default filter: templates only (the most common reason to open this view).
  const [filter, setFilter] = React.useState({
    kind: 'templates', corner: '', phase: '', search: '',
  });

  const allSessions = Object.values(state.sessions);
  const filtered = allSessions.filter(s2 => {
    if (filter.kind === 'templates' && !s2.isTemplate) return false;
    if (filter.kind === 'sessions' && s2.isTemplate) return false;
    if (filter.corner && !s2.objectives[filter.corner]) return false;
    if (filter.phase && !s2.gamePhase[filter.phase]) return false;
    if (filter.search) {
      const q = filter.search.toLowerCase();
      const hay = [s2.theme, s2.mainObjective, s2.templateName, s2.mdTag,
                   ...s2.activities.flatMap(a => [a.name, a.description, a.coachingPoints])]
        .join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const currentWeek = state.weeks[state.currentWeekId];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ ...s.card, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <SPButton variant="ghost" onClick={onBack}>← Back to week</SPButton>
        <h2 style={{ ...s.h2, margin: 0 }}>Templates</h2>
      </div>

      <div style={{
        ...s.card,
        display: 'grid', gap: '0.5rem',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(140px, 1fr))',
      }}>
        <SPField label="Kind">
          <SPSelect value={filter.kind}
            onChange={e => setFilter({ ...filter, kind: e.target.value })}>
            <option value="templates">Templates</option>
            <option value="sessions">Past sessions</option>
            <option value="all">All</option>
          </SPSelect>
        </SPField>
        <SPField label="Corner">
          <SPSelect value={filter.corner}
            onChange={e => setFilter({ ...filter, corner: e.target.value })}>
            <option value="">Any</option>
            {SP_FOUR_CORNERS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </SPSelect>
        </SPField>
        <SPField label="Phase">
          <SPSelect value={filter.phase}
            onChange={e => setFilter({ ...filter, phase: e.target.value })}>
            <option value="">Any</option>
            {SP_GAME_PHASES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </SPSelect>
        </SPField>
        <SPField label="Search">
          <SPInput type="search" value={filter.search}
            placeholder="Theme, notes, activity name…"
            onChange={e => setFilter({ ...filter, search: e.target.value })} />
        </SPField>
      </div>

      {filtered.length === 0 ? (
        <div style={{ ...s.card, textAlign: 'center', color: spTok('fgMuted') }}>
          Nothing matches those filters.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {filtered.map(s2 => (
            <div key={s2.id}
                 style={{ ...s.card, display: 'grid',
                          gridTemplateColumns: isMobile ? '1fr' : '1fr auto',
                          gap: '0.6rem', alignItems: 'center' }}>
              <div>
                <strong>{s2.isTemplate ? (s2.templateName || 'Untitled template') : (s2.theme || '(untitled session)')}</strong>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem',
                              fontSize: '0.75rem', color: spTok('fgMuted'),
                              marginTop: '0.25rem', alignItems: 'center' }}>
                  {s2.isTemplate ? <span style={{ ...s.chip, padding: '0.05rem 0.4rem' }}>Template</span> : null}
                  {s2.mdTag ? <span style={s.mdTag}>{s2.mdTag}</span> : null}
                  {s2.date ? <span>{spFormatDate(s2.date)}</span> : null}
                  <span>{s2.activities.length} activities</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                <SPButton onClick={() => onOpenSession(s2.id)}>Open</SPButton>
                {s2.isTemplate && currentWeek ? (
                  <SPApplyTemplateButton week={currentWeek}
                    onApply={dayId => dispatch({
                      type: 'APPLY_TEMPLATE_TO_DAY',
                      templateId: s2.id, weekId: currentWeek.id, dayId,
                    })} />
                ) : null}
                <SPButton variant="danger" onClick={() => {
                  if (confirm('Delete this session/template?')) {
                    dispatch({ type: 'DELETE_SESSION', sessionId: s2.id });
                  }
                }}>Delete</SPButton>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SPApplyTemplateButton({ week, onApply }) {
  const [open, setOpen] = React.useState(false);
  const candidates = week.days.filter(d => d.mdTag !== 'MD');
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <SPButton onClick={() => setOpen(o => !o)}>Apply to day…</SPButton>
      {open ? (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 4,
          background: spTok('surface'), border: `1px solid ${spTok('border')}`,
          borderRadius: 4, padding: 4, zIndex: 10, minWidth: 160,
          display: 'flex', flexDirection: 'column', gap: 2,
        }}>
          {candidates.map(d => (
            <SPButton key={d.id} variant="ghost"
              onClick={() => { onApply(d.id); setOpen(false); }}
              style={{ justifyContent: 'flex-start', textAlign: 'left' }}>
              {d.mdTag} · {spFormatDate(d.date)}
            </SPButton>
          ))}
        </div>
      ) : null}
    </span>
  );
}


// ─────────────────────────────────────────────────────────────────────
// 13. Root SessionPlanning component
// ─────────────────────────────────────────────────────────────────────

function SessionPlanning() {
  const s = spMkStyles();
  const [state, dispatch] = React.useReducer(spReducer, spInitialState, init => {
    const persisted = spLoad();
    return persisted || init;
  });

  // Persist on every change. Data is small; no debounce needed yet.
  React.useEffect(() => { spSave(state); }, [state]);

  // Listen for external hydration events (fired by spSeedWeekFromMatch
  // when match-analysis seeds a new week while we're already mounted).
  React.useEffect(() => {
    function onHydrate() {
      const fresh = spLoad();
      if (fresh) dispatch({ type: 'HYDRATE', state: fresh });
    }
    window.addEventListener('sp:hydrate', onHydrate);
    return () => window.removeEventListener('sp:hydrate', onHydrate);
  }, []);

  const [view, setView] = React.useState('weekly');
  const [activeSessionId, setActiveSessionId] = React.useState(null);

  function openSession(sessionId) { setActiveSessionId(sessionId); setView('session'); }
  function backToWeek()           { setActiveSessionId(null); setView('weekly'); }
  function openTemplates()        { setView('templates'); }

  return (
    <div className="sp-root" style={s.root}>
      <nav style={s.tabs}>
        <SPButton active={view === 'weekly'} onClick={() => setView('weekly')}>Weekly</SPButton>
        <SPButton active={view === 'templates'} onClick={openTemplates}>Templates</SPButton>
        {state.weekOrder.length > 1 ? (
          <SPSelect
            value={state.currentWeekId || ''}
            onChange={e => dispatch({ type: 'SELECT_WEEK', weekId: e.target.value })}
            style={{ width: 'auto', maxWidth: 220 }}
          >
            {state.weekOrder.map(id => {
              const w = state.weeks[id];
              const label = `${w?.anchor.opponent || '(no opp)'} · ${spFormatDate(w?.anchor.date) || ''}`;
              return <option key={id} value={id}>{label}</option>;
            })}
          </SPSelect>
        ) : null}
        <SPButton variant="primary" onClick={() => dispatch({ type: 'CREATE_WEEK' })}
                  style={{ marginLeft: 'auto' }}>
          + New week
        </SPButton>
      </nav>

      {view === 'weekly' && (
        <SPWeeklyView
          state={state} dispatch={dispatch}
          onOpenSession={openSession} onOpenTemplates={openTemplates}
        />
      )}
      {view === 'session' && (
        <SPSessionView
          session={state.sessions[activeSessionId]}
          dispatch={dispatch} onBack={backToWeek}
        />
      )}
      {view === 'templates' && (
        <SPTemplatesView
          state={state} dispatch={dispatch}
          onBack={backToWeek} onOpenSession={openSession}
        />
      )}
    </div>
  );
}
