// ================================================================
// FILE: GenerateTimetable_changes.jsx
//
// This file shows ONLY the new/changed sections to add to your
// existing GenerateTimetable.jsx. Each section is clearly marked.
// ================================================================


// ────────────────────────────────────────────────────────────────
// SECTION A — Add this import at the top of GenerateTimetable.jsx
//             (after the existing imports)
// ────────────────────────────────────────────────────────────────

import PersonalTimetableTab from "./PersonalTimetableTab";


// ────────────────────────────────────────────────────────────────
// SECTION B — Replace the TABS constant (search for "const TABS")
// ────────────────────────────────────────────────────────────────

const TABS = [
  "① Setup",
  "② Subjects",
  "③ Rooms",
  "④ Teachers",
  "⑤ Personal TT",   // ← NEW
  "⑥ Details",       // was ⑤
  "⑦ Generate",      // was ⑥
];


// ────────────────────────────────────────────────────────────────
// SECTION C — Add these two state variables inside the
//             GenerateTimetable component, near the other useState
//             calls (around line 200 in your current file).
// ────────────────────────────────────────────────────────────────

const [teacherLoads,         setTeacherLoads]         = useState({});
// shape: { [teacherCode]: { maxTheory: number|null, maxPractical: number|null } }

const [personalTimetables,   setPersonalTimetables]   = useState({});
// shape: { [teacherCode]: { [day]: { [slot]: { subject, room, ybKey, div } } } }


// ────────────────────────────────────────────────────────────────
// SECTION D — Inside the existing useEffect that loads teachers,
//             rooms, and year-branches from the API, ADD these two
//             fetch calls at the end of the Promise.all .then block:
// ────────────────────────────────────────────────────────────────

//   apiGet("/teacher-loads").then(rows => {
//     const lm = {};
//     rows.forEach(r => {
//       lm[r.teacher_code] = { maxTheory: r.max_theory, maxPractical: r.max_practical };
//     });
//     setTeacherLoads(lm);
//   }).catch(() => {});
//
//   apiGet("/personal-timetables").then(pts => {
//     setPersonalTimetables(pts || {});
//   }).catch(() => {});


// ────────────────────────────────────────────────────────────────
// SECTION E — Replace the existing generateTimetable function
//             (the one starting with "function generateTimetable")
//             with this enhanced version that respects load limits
//             and personal timetable pins.
// ────────────────────────────────────────────────────────────────

function generateTimetable(
  subjects, assignments, roomPools, numBatches, div, globalLabSlots,
  teacherLoads     = {},   // { teacherCode: { maxTheory, maxPractical } }
  allPersonalTTs   = {},   // { teacherCode: { day: { slot: { subject, room, ybKey, div } } } }
  currentYbKey     = "",   // yb_key being generated right now e.g. "SE-IT"
) {
  const grid = buildEmptyGrid();

  // ── Step 0: Pre-populate pinned slots + build teacher busy map ──────────
  const teacherBusy = {};  // teacherBusy[tc][day][slot] = true

  Object.entries(allPersonalTTs).forEach(([tc, tcDays]) => {
    teacherBusy[tc] = {};
    DAYS.forEach(d => { teacherBusy[tc][d] = {}; });

    Object.entries(tcDays).forEach(([day, slots]) => {
      if (!DAYS.includes(day)) return;
      Object.entries(slots).forEach(([slot, info]) => {
        if (slot === BREAK_SLOT || !info?.subject) return;

        // Always mark teacher busy here regardless of which class it is for
        if (!teacherBusy[tc][day]) teacherBusy[tc][day] = {};
        teacherBusy[tc][day][slot] = true;

        // Only pre-fill the grid when pin belongs to THIS class
        if (info.ybKey === currentYbKey && info.div === div) {
          if (grid[day]?.[slot]?.subject === "") {
            grid[day][slot] = {
              subject:      info.subject,
              teacherCode:  tc,
              room:         info.room || "",
              batches:      null,
              electives:    null,
              isLocked:     true,  // cannot be overwritten
            };
          }
        }
      });
    });
  });

  // ── Step 1: Load tracker ────────────────────────────────────────────────
  const loadTracker = {};  // { tc: { theory: 0, practical: 0 } }
  const initLoad = tc => {
    if (tc && !loadTracker[tc]) loadTracker[tc] = { theory: 0, practical: 0 };
  };

  // Count already-locked (pinned) theory slots toward load
  DAYS.forEach(day => {
    ALLOC.forEach(slot => {
      const cell = grid[day]?.[slot];
      if (!cell?.isLocked || !cell.teacherCode) return;
      initLoad(cell.teacherCode);
      loadTracker[cell.teacherCode].theory++;
    });
  });

  const canTheory = tc => {
    if (!tc) return true;
    const lim = teacherLoads[tc]?.maxTheory;
    if (lim == null) return true;
    initLoad(tc);
    return loadTracker[tc].theory < lim;
  };

  const canPractical = tc => {
    if (!tc) return true;
    const lim = teacherLoads[tc]?.maxPractical;
    if (lim == null) return true;
    initLoad(tc);
    return loadTracker[tc].practical < lim;
  };

  const addTheory    = tc => { if (tc) { initLoad(tc); loadTracker[tc].theory++; } };
  const addPractical = tc => { if (tc) { initLoad(tc); loadTracker[tc].practical++; } };

  // Slot availability: not already filled, not locked, teacher not busy
  const isAvail = (day, slot, tc = null) => {
    const cell = grid[day]?.[slot];
    if (!cell || cell.subject !== "" || cell.isLocked) return false;
    if (tc && teacherBusy[tc]?.[day]?.[slot]) return false;
    return true;
  };

  // ── Step 2: Subject buckets ─────────────────────────────────────────────
  const labSubjects      = subjects.filter(s => isCoreLab(s.type));
  const theorySubjects   = subjects.filter(s => s.type === "theory");
  const electiveSubjects = subjects.filter(s => isElectiveType(s.type));
  const classroomPool    = roomPools.theory   || [];
  const electivePool     = roomPools.elective || [];
  const labPool          = roomPools.lab      || [];
  const cUsed = {}, eUsed = {};

  // ── Step 3: Core Lab rotation ───────────────────────────────────────────
  if (labSubjects.length) {
    const batches          = getBatches(div, numBatches);
    const labSz            = parseInt(labSubjects[0]?.labHours) || 2;
    const weeklyLabSessions= parseInt(labSubjects[0]?.weeklyLabs) || 1;
    const lUsed            = {};
    const shuffledDays     = [...DAYS].sort(() => Math.random() - 0.5);

    for (let sessionIdx = 0; sessionIdx < weeklyLabSessions; sessionIdx++) {
      const batchAssigns = batches.map((batch, bi) => {
        const subIdx = (bi + sessionIdx) % labSubjects.length;
        const sub    = labSubjects[subIdx];
        const a      = assignments?.[sub.id] || {};
        return {
          batch,
          teacherCode: a.teacherCode || "",
          room:        pickRoom(labPool.length ? labPool : [], lUsed),
          subjectName: sub.name,
          subType:     sub.type,
        };
      });

      // Check practical load for ALL batch teachers before placing
      const loadOk = batchAssigns.every(b => !b.teacherCode || canPractical(b.teacherCode));
      if (!loadOk) continue;  // skip session — limit reached

      const cellData = {
        subject:      `LAB SESSION ${sessionIdx + 1}`,
        teacherCode:  batchAssigns.map(b => b.teacherCode).filter(Boolean).join(", "),
        room:         batchAssigns.map(b => b.room).filter(Boolean).join(", "),
        batches:      batchAssigns,
        electives:    null,
        isLabRotation:true,
      };

      // Try to place the lab block respecting teacher busy maps
      const tryPlaceRespecting = (day, sz) => {
        for (const si of validLabStarts(sz)) {
          const cands = ALLOC.slice(si, si + sz);
          const allFree = cands.every(s => {
            if (!isAvail(day, s)) return false;
            // Each batch teacher must be free for every slot in the block
            return batchAssigns.every(b =>
              !b.teacherCode || !teacherBusy[b.teacherCode]?.[day]?.[s]
            );
          });
          if (!allFree) continue;
          const slotKey = `${si}_${sz}`;
          if (globalLabSlots?.[day]?.[slotKey]) continue;
          cands.forEach(s => { grid[day][s] = { ...cellData }; });
          if (globalLabSlots) {
            if (!globalLabSlots[day]) globalLabSlots[day] = {};
            globalLabSlots[day][slotKey] = true;
          }
          return true;
        }
        return false;
      };

      let placed = false;
      const daysByLoad = [...shuffledDays].sort((a, b) =>
        labSessionsOnDay(grid, a, labSz) - labSessionsOnDay(grid, b, labSz)
      );
      for (const day of daysByLoad) {
        if (labSessionsOnDay(grid, day, labSz) >= 2) continue;
        if (tryPlaceRespecting(day, labSz)) { placed = true; break; }
      }
      if (!placed) {
        for (const day of DAYS) {
          if (tryPlaceRespecting(day, labSz)) { placed = true; break; }
        }
      }
      if (placed) {
        batchAssigns.forEach(b => { if (b.teacherCode) addPractical(b.teacherCode); });
      }
    }
  }

  // ── Step 4: Elective groups ─────────────────────────────────────────────
  const placedGroups  = new Set();
  const electiveGroups= {};
  electiveSubjects.forEach(sub => {
    if (!electiveGroups[sub.type]) electiveGroups[sub.type] = [];
    electiveGroups[sub.type].push(sub);
  });

  electiveSubjects.forEach(sub => {
    if (placedGroups.has(sub.type)) return;
    placedGroups.add(sub.type);
    const groupSubs = electiveGroups[sub.type] || [];
    const sessions  = parseInt(groupSubs[0]?.hours) || 1;
    const days      = [...DAYS].sort(() => Math.random() - 0.5);
    let rem         = sessions;

    const tryPlace = (day, slot) => {
      if (!isAvail(day, slot)) return false;
      const groupTCs = groupSubs.map(gs => assignments?.[gs.id]?.teacherCode || "").filter(Boolean);
      if (groupTCs.some(tc => teacherBusy[tc]?.[day]?.[slot])) return false;
      if (groupSubs.some(gs => {
        const tc = assignments?.[gs.id]?.teacherCode;
        return tc && !canTheory(tc);
      })) return false;
      const eRoom    = pickRoom(electivePool.length ? electivePool : classroomPool, eUsed);
      const electives= groupSubs.map(gs => {
        const ga = assignments?.[gs.id] || {};
        return { name: gs.name, teacherCode: ga.teacherCode || "", room: eRoom };
      });
      grid[day][slot] = {
        subject:     sub.type,
        teacherCode: electives.map(e => e.teacherCode).filter(Boolean).join(", "),
        room:        eRoom, batches: null, electives,
      };
      groupSubs.forEach(gs => { const tc = assignments?.[gs.id]?.teacherCode; if (tc) addTheory(tc); });
      return true;
    };

    for (let p = 0; p < Math.ceil(sessions / DAYS.length) && rem > 0; p++) {
      for (const day of days) {
        if (!rem) break;
        for (const slot of ALLOC) { if (tryPlace(day, slot)) { rem--; break; } }
      }
    }
    let att = 0;
    while (rem > 0 && att < 300) {
      att++;
      const d  = DAYS[Math.floor(Math.random() * DAYS.length)];
      const sl = ALLOC[Math.floor(Math.random() * ALLOC.length)];
      if (tryPlace(d, sl)) rem--;
    }
  });

  // ── Step 5: Theory subjects ─────────────────────────────────────────────
  theorySubjects.forEach(({ id, name, hours }) => {
    const a        = assignments?.[id] || {};
    const tCode    = a.teacherCode || "";
    const room     = pickRoom(classroomPool, cUsed);
    const sessions = parseInt(hours) || 1;
    const days     = [...DAYS].sort(() => Math.random() - 0.5);
    let rem        = sessions;

    const tryPlace = (day, slot) => {
      if (!isAvail(day, slot, tCode)) return false;
      if (!canTheory(tCode)) return false;
      grid[day][slot] = { subject: name, teacherCode: tCode, room, batches: null, electives: null };
      addTheory(tCode);
      return true;
    };

    for (let p = 0; p < Math.ceil(sessions / DAYS.length) && rem > 0; p++) {
      for (const day of days) {
        if (!rem) break;
        for (const slot of ALLOC) { if (tryPlace(day, slot)) { rem--; break; } }
      }
    }
    let att = 0;
    while (rem > 0 && att < 300) {
      att++;
      const d  = DAYS[Math.floor(Math.random() * DAYS.length)];
      const sl = ALLOC[Math.floor(Math.random() * ALLOC.length)];
      if (tryPlace(d, sl)) rem--;
    }
  });

  return grid;
}


// ────────────────────────────────────────────────────────────────
// SECTION F — Inside handleGenerate, update the generateTimetable
//             call to pass the two new parameters.
//
//             FIND this line (inside the yearBranches.forEach):
//               newAllTT[yb.id][div] = generateTimetable(...)
//
//             REPLACE it with:
// ────────────────────────────────────────────────────────────────

//   newAllTT[yb.id][div] = generateTimetable(
//     subs, divAssign, roomPools, numBatches, div, globalLabSlots,
//     teacherLoads,       // NEW ← load limits map
//     personalTimetables, // NEW ← pinned slots map
//     yb.id,              // NEW ← current yb_key for pin matching
//   );


// ────────────────────────────────────────────────────────────────
// SECTION G — Inside handleGenerate, ADD these two saves
//             AFTER the existing "await apiPost('/rooms/bulk', ...)"
//             call and BEFORE setApiSuccess(...)
// ────────────────────────────────────────────────────────────────

//   // Save teacher load limits
//   const loadsToSave = teachers
//     .filter(t => teacherLoads[t.code]?.maxTheory != null || teacherLoads[t.code]?.maxPractical != null)
//     .map(t => ({
//       teacher_code:  t.code,
//       max_theory:    teacherLoads[t.code]?.maxTheory    ?? null,
//       max_practical: teacherLoads[t.code]?.maxPractical ?? null,
//     }));
//   if (loadsToSave.length) await apiPost("/teacher-loads/bulk", loadsToSave);
//
//   // Save personal timetables
//   for (const [tc, slots] of Object.entries(personalTimetables)) {
//     if (Object.keys(slots).length > 0) {
//       await apiPost("/personal-timetable", { teacher_code: tc, slots });
//     }
//   }


// ────────────────────────────────────────────────────────────────
// SECTION H — Load Management UI block.
//             PASTE this inside the Teachers tab render (TAB 3),
//             AFTER the closing </div> of the "Assign Teachers to
//             Subjects" panel and BEFORE the navigation buttons.
// ────────────────────────────────────────────────────────────────

const LoadManagementSection = (
  <div className="panel" style={{ marginBottom: 20 }}>
    <div className="panel-header">
      <span className="panel-title">📊 Load Management</span>
    </div>
    <p style={S.hint}>
      Set the maximum number of <strong>theory</strong> and <strong>practical</strong> sessions per
      teacher per week. Leave blank for no limit. The AI will never exceed these totals when
      generating the timetable — matching exactly how the load allocation sheet works.
    </p>

    {teachers.length > 0 ? (
      <div style={{ overflowX: "auto" }}>
        <table style={{ ...S.table, marginTop: 0 }}>
          <thead>
            <tr>
              {["Code", "Name", "Max Theory / Week", "Max Practical / Week", "Total Max Load"].map(h => (
                <th key={h} style={S.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teachers.map((t, i) => {
              const load  = teacherLoads[t.code] || {};
              const total = (load.maxTheory || 0) + (load.maxPractical || 0);
              return (
                <tr key={t.id} style={{ background: i % 2 === 0 ? "#fafbff" : "#fff" }}>
                  <td style={{ ...S.td, fontFamily: "monospace", fontWeight: 700, color: "#667eea" }}>
                    {t.code}
                  </td>
                  <td style={S.td}>{t.name}</td>
                  <td style={{ ...S.td }}>
                    <input
                      type="number" min={0} max={40}
                      value={load.maxTheory ?? ""}
                      placeholder="No limit"
                      onChange={e => setTeacherLoads(prev => ({
                        ...prev,
                        [t.code]: {
                          ...(prev[t.code] || {}),
                          maxTheory: e.target.value === "" ? null : parseInt(e.target.value),
                        },
                      }))}
                      style={{
                        ...S.input, width: 100, textAlign: "center",
                        borderColor: "#c5d3f5", background: "#f0f5ff",
                      }}
                    />
                  </td>
                  <td style={{ ...S.td }}>
                    <input
                      type="number" min={0} max={40}
                      value={load.maxPractical ?? ""}
                      placeholder="No limit"
                      onChange={e => setTeacherLoads(prev => ({
                        ...prev,
                        [t.code]: {
                          ...(prev[t.code] || {}),
                          maxPractical: e.target.value === "" ? null : parseInt(e.target.value),
                        },
                      }))}
                      style={{
                        ...S.input, width: 100, textAlign: "center",
                        borderColor: "#9ae6b4", background: "#f0fff4",
                      }}
                    />
                  </td>
                  <td style={{
                    ...S.td, fontWeight: 700,
                    color: total > 0 ? "#667eea" : "#ccc",
                    fontSize: 15,
                  }}>
                    {total > 0 ? total : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    ) : (
      <div style={S.emptyBox}>Add teachers above first.</div>
    )}

    {teachers.length > 0 && (
      <div style={{ marginTop: 14 }}>
        <button
          className="card-btn btn-teal"
          style={{ fontSize: 13, padding: "8px 20px" }}
          onClick={async () => {
            try {
              const loadsToSave = teachers
                .filter(t => teacherLoads[t.code]?.maxTheory != null || teacherLoads[t.code]?.maxPractical != null)
                .map(t => ({
                  teacher_code:  t.code,
                  max_theory:    teacherLoads[t.code]?.maxTheory    ?? null,
                  max_practical: teacherLoads[t.code]?.maxPractical ?? null,
                }));
              await apiPost("/teacher-loads/bulk", loadsToSave);
              setApiSuccess("✅ Load limits saved!");
            } catch (e) {
              setApiError(`Save failed: ${e.message}`);
            }
          }}
        >
          💾 Save Load Limits
        </button>
      </div>
    )}
  </div>
);


// ────────────────────────────────────────────────────────────────
// SECTION I — New tab render block for Personal TT (tab index 4).
//
//             FIND the block that starts with:
//               {activeTab === 4 && (   // (currently the Details tab)
//
//             SHIFT all existing tab numbers UP by 1:
//               Old tab 4 (Details)  → activeTab === 5
//               Old tab 5 (Generate) → activeTab === 6
//
//             Then ADD this new block for activeTab === 4:
// ────────────────────────────────────────────────────────────────

//   {activeTab === 4 && (
//     <PersonalTimetableTab
//       teachers={teachers}
//       yearBranches={yearBranches}
//       personalTimetables={personalTimetables}
//       setPersonalTimetables={setPersonalTimetables}
//       activeTab={activeTab}
//       setActiveTab={setActiveTab}
//     />
//   )}
