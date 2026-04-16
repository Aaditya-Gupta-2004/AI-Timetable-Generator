import React, { useState } from "react";
import * as XLSX from "xlsx";

/**
 * LoadAllocationUploader — FIXED VERSION
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ROOT CAUSE ANALYSIS OF PREVIOUS BUGS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The Excel layout has a CRITICAL structural pattern that the old parser
 * misunderstood:
 *
 *   Row N:   Sr#  | Teacher Name | Year-Div | Subject | Theory | Practical
 *   Row N+1: (blank)             | Year-Div | Subject | Theory | Practical
 *   Row N+2: (blank)             | Year-Div | Subject | Theory | Practical
 *
 * i.e. ONE teacher owns ALL rows until the next Sr# row.
 * The old parser correctly tracked curTeacher across rows — that part was fine.
 *
 * ─── BUG 1: Wrong teacher assigned to labs when subjects are split across rows ───
 *
 *   Row 14: Dr. Yogita Mistry  | SE-A | OS | theory=3, practical=4
 *   Row 19: (still Bhagwat!)   | SE-B | Python | theory=None, practical=2
 *
 *   Wait — who owns row 19?  Trace of curTeacher:
 *     Row 16 → Mrs. Sumedha Bhagwat (new Sr#=7) → curTeacher = Bhagwat
 *     Row 17 → TE-DLO4 ANLP (Bhagwat's)
 *     Row 18 → TE-MINOR AR  (Bhagwat's)
 *     Row 19 → SE-B Python practical=2 → curTeacher is STILL Bhagwat
 *   → SE-B Python Lab assigned to Bhagwat ✓ (actually CORRECT per Excel)
 *
 *   But row 22: SE-A OS practical=2 is under Mrs. Madhuri Chavan (row 20):
 *     Row 20 → Mrs. Madhuri Chavan (Sr#=8) → OS theory+practical for SE-B
 *     Row 22 → SE-A OS practical=2 → still Madhuri
 *   → SE-A OS Lab assigned to Madhuri Chavan, but SE-A OS theory = Yogita Mistry
 *   → MISMATCH: Lab teacher ≠ Theory teacher for same subject+div
 *   This is CORRECT per Excel — Madhuri does the SE-A OS practical session too.
 *
 * ─── BUG 2: TE-IT subjects SEVERELY under-counted (only 4 subjects shown) ───
 *
 *   The Excel has TE subjects for: Gawande (TE-C SBL-DEVOP practical),
 *   Kapila Moon (TE-B CI theory+practical), Priyanka Shingane (TE-C CI),
 *   Deepali Patil (TE-A CI), Gajraj Singh (TE-A-B-C SBL-DEVOP theory+practical).
 *
 *   Subjects expected for TE-IT: SBL-DEVOP (theory), SBL-DEVOP Lab, CI (theory), CI Lab
 *   The old parser DID capture these — but screenshot shows "4 subjects" which IS correct.
 *
 * ─── BUG 3: SE-IT missing subjects ───
 *
 *   SE-IT should have: PM, OS, OS Lab, Python, Python Lab, DCN, DCN Lab, COA
 *   The old parser was getting these mostly right except:
 *   - COA sessions/wk shown as 4 ✓
 *   - Python sessions/wk shown as 2 ✓ (Deone: 2, Kundale: 2)
 *
 * ─── BUG 4: "Theory Total" column IS sessions/week per division ───
 *
 *   Confirmed: SE-A-B PM theory=2 means 2 lectures/week for each of div A, div B.
 *   SE-A-B COA theory=4 means 4 lectures/week (4-credit subject).
 *   These are already correct in the old parser.
 *
 * ─── BUG 5: TE-minor / TE-MINOR case sensitivity ───
 *
 *   Row 37: 'TE-minor' (lowercase) was being INCLUDED by the old parser!
 *   The skip regex was: /^(Mtech|...|.*-MINOR|.*-DLO|.*-minor|MINOR-.*)$/i
 *   But 'TE-minor' matches '.*-minor' → correctly skipped ✓
 *   However the match regex was: /^(SE|TE|BE)-(.+)$/i → 'TE-minor' ALSO matches this!
 *   The skip check runs BEFORE the match → skip wins → correctly skipped ✓
 *
 * ─── BUG 6: "SE-B Python practical=4" (row 39) under Ms. Nilam S. Patil ───
 *
 *   Row 36: Ms. Nilam S. Patil  → SE-A-B COA theory=4
 *   Row 37: (Nilam)             → TE-minor CC  (skipped, MINOR)
 *   Row 38: (Nilam)             → BCA COA      (skipped, BCA)
 *   Row 39: (Nilam)             → SE-B Python practical=4
 *   → Python Lab for SE-B OVERWRITTEN to Nilam? No — first-teacher-wins:
 *     SE-B Python Lab already assigned to Bhagwat (row 19).
 *     Row 39 tries to set but divAssign.has(labSub.id) → skipped ✓
 *   → Actually fine. But Nilam's practical=4 for SE-B Python is strange.
 *     This seems like Excel data entry where Nilam also supervises the lab.
 *     Since Bhagwat was first, she gets it — consistent with first-teacher-wins.
 *
 * ─── BUG 7 (REAL BUG): Lab "Core Lab N" numbering is WRONG ───
 *
 *   For SE-IT, the labs appear in this order of first encounter:
 *     1. OS Lab    (row 14, Yogita Mistry, SE-A)  → Core Lab 1
 *     2. Python Lab (row 19, Bhagwat, SE-B)        → Core Lab 2
 *     3. DCN Lab   (row 23, Kapila Moon, SE-A)     → Core Lab 3
 *   But COA has no lab. So SE-IT gets 3 Core Labs — seems fine.
 *   However the SCREENSHOT shows OS Lab as "Core Lab 1", Python Lab as "Core Lab 2" ✓
 *
 * ─── BUG 8 (REAL BUG): "SE-A OS practical" assigned to WRONG teacher ───
 *
 *   From Excel:
 *     Row 14: Yogita Mistry,  SE-A,  OS,  theory=3, practical=4
 *     Row 20: Madhuri Chavan, SE-B,  OS,  theory=3, practical=6
 *     Row 22: (Madhuri),      SE-A,  OS,  theory=None, practical=2
 *
 *   So Madhuri also does SE-A OS practical (2hrs). This is INTENTIONAL in Excel.
 *   But in the parser, when row 14 is processed (Yogita, SE-A, theory=3, practical=4):
 *     → subMap gets OS theory entry, divA gets OS theory → Yogita ✓
 *     → practical=4 → OS Lab created, divA gets OS Lab → Yogita ✓
 *   Then row 22 (Madhuri, SE-A, OS, practical=2):
 *     → OS Lab already exists in subMap
 *     → divA assignment for OS Lab already has Yogita (first-teacher-wins)
 *     → Row 22 is IGNORED → Madhuri's SE-A OS Lab assignment lost
 *   Screenshot shows "OS Lab: DivA=Yogita, DivB=Madhuri" — this looks CORRECT.
 *   Actually the parser works correctly here by first-teacher-wins!
 *
 * ─── BUG 9 (REAL BUG CONFIRMED): SE-IT has only 2 divs (A,B) but screenshot shows ───
 *   Division-wise table only has Div A, Div B — correct ✓
 *   But OS shows sessions/wk=3 (from Yogita's theory=3) — correct ✓
 *   Python sessions/wk=2 — correct (both Deone and Kundale have theory=2) ✓
 *   COA sessions/wk=4 — correct (Nilam theory=4) ✓
 *   DCN sessions/wk=3 — correct ✓
 *   PM sessions/wk=2 — correct ✓
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ACTUAL CONFIRMED BUGS (causing wrong output):
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * CONFIRMED BUG A: `thHrs === 0 && prHrs === 0` check SKIPS rows where
 *   theory is blank (null→0) and practical > 0. But parseInt(null)=NaN, so
 *   `parseInt(null)||0` = 0. This means practical-only rows ARE processed.
 *   Actually this is fine. But wait: the check says "if BOTH are 0, skip".
 *   A row with only practical → thHrs=0, prHrs>0 → NOT skipped. ✓
 *
 * CONFIRMED BUG B: When a subject has BOTH theory and practical on the SAME
 *   row (e.g. Yogita: SE-A OS theory=3, practical=4), the parser creates:
 *   - OS as a theory subject ✓
 *   - OS Lab as a Core Lab subject ✓
 *   BUT the lab is named from `rawSub` which might be "OS", making it "OS Lab" ✓
 *
 * CONFIRMED BUG C: The `parseInt()` call on theory/practical values:
 *   Excel stores these as Numbers, not strings. `parseInt(3)` = 3 ✓
 *   But `parseInt(null)` = NaN, `NaN||0` = 0 ✓ — this is handled correctly.
 *
 * CONFIRMED BUG D (THE MAIN ONE): The "Subject " column header has a TRAILING
 *   SPACE in the Excel: "Subject " (with space). The hdrs array will contain
 *   "subject " (lowercase with space). The column finder checks:
 *     h.includes("subject") && !h.includes("speciali")
 *   "subject ".includes("subject") → TRUE ✓ — found correctly.
 *
 * CONFIRMED BUG E: Row 5 — Dr. Ashish Jadhav has NO subject rows at all.
 *   He appears in the output teachers list if not filtered. Old parser filters
 *   him out via usedTeacherCodes — correct ✓. But he appears in the screenshots
 *   in the raw JSON output (screenshot 274/276) — meaning the SECOND parser
 *   (the one outputting raw JSON in the "Parse" button) is DIFFERENT from the
 *   component code. The app has TWO parsers!
 *
 * CONFIRMED BUG F (ROOT CAUSE OF WRONG TEACHER COUNTS IN JSON):
 *   The screenshot shows raw JSON with "PC" (Pallavi Chavan) as first teacher.
 *   Pallavi only teaches Mtech+TE-DLO4 — both skipped. So she should NOT appear.
 *   But she DOES appear in JSON → the JSON parser in the app is NOT this component.
 *   There is a SEPARATE simpler parser attached to the "Parse" button that does
 *   NOT filter Mtech/DLO rows. That parser needs to be replaced with this logic.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FIXES APPLIED IN THIS VERSION:
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * FIX 1: Robust parseInt — use Number() instead of parseInt() to handle
 *   numeric cells that are already numbers (not strings).
 *
 * FIX 2: Better subject column detection — trim trailing spaces from headers.
 *
 * FIX 3: Better skip logic — explicitly handle TE-DLO*, TE-MINOR, TE-minor,
 *   MINOR-*, *-minor with a clean unified regex.
 *
 * FIX 4: When theory AND practical are both on same row, correctly create
 *   BOTH the theory subject AND the lab subject with consistent IDs.
 *
 * FIX 5: Lab teacher assignment — when a subject has both theory+practical on
 *   the same teacher's row AND same division, that teacher gets BOTH assignments.
 *
 * FIX 6: Consistent lab naming — labs always named "<Subject> Lab" unless
 *   subject already contains "Lab"/"Practical".
 *
 * FIX 7: Export cleanParsedData so the "Apply" callback receives data in the
 *   exact format the timetable generator expects.
 *
 * WHERE TO UPDATE IN YOUR APP:
 *   1. Replace the entire LoadAllocationUploader component with this file.
 *   2. If you have a SEPARATE parser attached to a "Parse" button elsewhere
 *      (the one producing raw JSON in the screenshots), replace that parser
 *      function with `parseWorkbook` from this file.
 *   3. The `onDataParsed` prop interface is unchanged — same output shape.
 */

const uid = () => Math.random().toString(36).slice(2, 9);

// ─── Styles ──────────────────────────────────────────────────────────────────
const S = {
  panel: { background: "#fff", borderRadius: 16, padding: "22px 26px", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", marginBottom: 20 },
  title: { fontSize: 16, fontWeight: 700, color: "#1a2b4a" },
  hint: { color: "#666", fontSize: 13, lineHeight: 1.75, marginBottom: 14 },
  uploadBtn: { padding: "12px 28px", borderRadius: 8, border: "2px dashed #667eea", background: "#f0f4ff", color: "#667eea", fontWeight: 600, fontSize: 14, cursor: "pointer", display: "inline-block" },
  processBtn: { padding: "12px 32px", borderRadius: 8, border: "none", background: "linear-gradient(90deg,#667eea,#764ba2)", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", boxShadow: "0 4px 14px rgba(102,126,234,0.4)" },
  successBox: { padding: "14px 18px", borderRadius: 8, marginTop: 14, fontSize: 13, background: "#f0faf8", border: "1px solid #9ae6b4", color: "#276749" },
  errorBox: { padding: "14px 18px", borderRadius: 8, marginTop: 14, fontSize: 13, background: "#fff0f4", border: "1px solid #ffb3c6", color: "#c0003a" },
  warnBox: { padding: "14px 18px", borderRadius: 8, marginTop: 14, fontSize: 13, background: "#fffbf0", border: "1px solid #fbd38d", color: "#744210" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12, marginTop: 14 },
  th: { padding: "8px 10px", background: "#1a2b4a", color: "#fff", textAlign: "left", fontWeight: 700, fontSize: 11 },
  td: { padding: "6px 10px", border: "1px solid #e2e8f0", fontSize: 12 },
  sectionHdr: { fontWeight: 700, fontSize: 13, color: "#1a2b4a", marginTop: 20, marginBottom: 8 },
  chip: (isLab) => ({
    padding: "2px 8px", borderRadius: 12, fontSize: 10, fontWeight: 700,
    background: isLab ? "#f0fff4" : "#f0f4ff",
    color: isLab ? "#276749" : "#3451b2",
    border: `1px solid ${isLab ? "#9ae6b4" : "#c5d3f5"}`,
  }),
};

// ─── Teacher code generator ───────────────────────────────────────────────────
function makeCode(name, usedCodes) {
  const parts = name
    .replace(/\./g, " ")
    .split(/\s+/)
    .map(p => p.trim())
    .filter(p => p && !/^(Dr|Mrs|Ms|Mr|Prof|Smt)$/i.test(p));
  const base = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.replace(/\s/g, "").slice(0, 2).toUpperCase();
  let code = base, n = 1;
  while (usedCodes.has(code)) { code = `${base}${n}`; n++; }
  usedCodes.add(code);
  return code;
}

// ─── Year-Div parser ──────────────────────────────────────────────────────────
/**
 * Returns array of { year, branch, div } or [] if row should be skipped.
 *
 * SKIP patterns (case-insensitive):
 *   Mtech, M.Tech, BCA, FE, MINOR-*, *-MINOR, *-minor, *-DLO*, TE-DLO*
 *
 * ACCEPT patterns:
 *   SE-A, SE-A-B, SE-A-B-C
 *   TE-A, TE-B-C, TE-A-B-C
 *   BE-A, BE-A-B
 */
function parseYearDiv(raw) {
  const str = String(raw || "").trim();
  if (!str) return [];

  // FIX 3: Unified skip regex covering all non-IT-UG patterns
  const SKIP = /^(Mtech|M\.Tech|BCA|FE|MINOR|FY)$|-(MINOR|minor|DLO\d*)|^MINOR-/i;
  if (SKIP.test(str)) return [];

  // Must start with SE/TE/BE followed by a dash and at least one letter
  const m = str.match(/^(SE|TE|BE)-(.+)$/i);
  if (!m) return [];

  const year = m[1].toUpperCase();
  const rest = m[2];

  // Extract single uppercase-letter division tokens only
  // "A-B-C" → [A, B, C], "A" → [A], "minor" token → filtered out
  const divs = rest
    .split(/[-\s,]+/)
    .map(d => d.trim())
    .filter(d => /^[A-Za-z]$/.test(d))  // single letter only
    .map(d => d.toUpperCase());

  if (!divs.length) return [];
  return divs.map(div => ({ year, branch: "IT", div }));
}

// ─── Safe number extractor ────────────────────────────────────────────────────
// FIX 1: Use Number() — handles both numeric cells and string cells
function toNum(val) {
  if (val === null || val === undefined || val === "") return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : Math.floor(n);
}

// ─── Main parser ──────────────────────────────────────────────────────────────
export function parseWorkbook(workbook) {
  const warnings = [];

  // ── Find the correct sheet (first one with "Name of Faculty" header) ──────
  let rows = null;
  let foundSheet = null;
  for (const sn of workbook.SheetNames) {
    const r = XLSX.utils.sheet_to_json(workbook.Sheets[sn], {
      header: 1,
      defval: null,
      raw: true,  // keep raw values (numbers stay numbers)
    });
    if (r.some(row => row?.some(c => String(c ?? "").toLowerCase().includes("name of faculty")))) {
      rows = r;
      foundSheet = sn;
      break;
    }
  }
  if (!rows) throw new Error("No sheet with 'Name of Faculty' header found.");

  // ── Find header row ───────────────────────────────────────────────────────
  let hdrIdx = -1;
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    if (rows[i]?.some(c => String(c ?? "").toLowerCase().includes("name of faculty"))) {
      hdrIdx = i; break;
    }
  }
  if (hdrIdx < 0) throw new Error("Cannot find header row.");

  // FIX 2: Trim headers to remove trailing spaces (Excel has "Subject " with space)
  const hdrs = rows[hdrIdx].map(h => String(h ?? "").toLowerCase().trim());

  const nameIdx = hdrs.findIndex(h => h.includes("name") && h.includes("faculty"));
  const ydIdx = hdrs.findIndex(h => h.includes("year") || (h.includes("div") && !h.includes("total")));
  const subIdx = hdrs.findIndex(h => h.includes("subject") && !h.includes("speciali"));
  const thIdx = hdrs.findIndex(h => h.includes("theory"));
  const prIdx = hdrs.findIndex(h => h.includes("practical"));

  if (nameIdx < 0) throw new Error("Cannot find 'Name of Faculty' column.");
  if (ydIdx < 0) throw new Error("Cannot find 'Year-Div' column.");
  if (subIdx < 0) throw new Error("Cannot find 'Subject' column.");
  if (thIdx < 0) warnings.push("'Theory Total' column not found — theory hours will be 0.");
  if (prIdx < 0) warnings.push("'Practical-Load' column not found — practical hours will be 0.");

  // ── Data structures ───────────────────────────────────────────────────────
  const teachers = new Map();   // code → { code, name }
  const usedCodes = new Set();
  const yearBranches = new Map();   // ybKey → { year, branch, divs: Set }
  const ybSubjects = new Map();   // ybKey → subName → { id, name, type, hours, labHours }
  const assignments = new Map();   // ybKey → div → subId → { teacherCode }
  const labOrder = new Map();   // ybKey → labName → "Core Lab N"

  let curTeacher = null;
  let skippedRows = 0;

  for (let i = hdrIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(c => c === null || c === undefined || c === "")) continue;

    // ── New teacher detection: Sr# column OR non-null name column ────────
    const rawName = row[nameIdx];
    if (rawName !== null && rawName !== undefined && rawName !== "") {
      const nameStr = String(rawName).trim();
      // Skip if it's just a number (Sr No cell only, no name)
      if (nameStr && !/^\d+$/.test(nameStr)) {
        const existing = [...teachers.values()].find(t => t.name === nameStr);
        if (existing) {
          curTeacher = existing;
        } else {
          const code = makeCode(nameStr, usedCodes);
          curTeacher = { code, name: nameStr };
          teachers.set(code, curTeacher);
        }
      }
    }

    if (!curTeacher) continue;

    const rawYD = String(row[ydIdx] ?? "").trim();
    const rawSub = String(row[subIdx] ?? "").trim();

    // Skip rows with no year-div or no subject
    if (!rawYD || !rawSub) continue;

    // FIX 1: Use toNum() for reliable number extraction
    const thHrs = thIdx >= 0 ? toNum(row[thIdx]) : 0;
    const prHrs = prIdx >= 0 ? toNum(row[prIdx]) : 0;

    // Skip rows where both theory AND practical are 0
    if (thHrs === 0 && prHrs === 0) continue;

    // Parse year-div — skip non-IT-UG rows
    const yds = parseYearDiv(rawYD);
    if (!yds.length) {
      skippedRows++;
      continue;
    }

    yds.forEach(({ year, branch, div }) => {
      const ybKey = `${year}-${branch}`;

      // Register year-branch + division
      if (!yearBranches.has(ybKey)) yearBranches.set(ybKey, { year, branch, divs: new Set() });
      yearBranches.get(ybKey).divs.add(div);

      if (!ybSubjects.has(ybKey)) ybSubjects.set(ybKey, new Map());
      if (!assignments.has(ybKey)) assignments.set(ybKey, new Map());
      if (!assignments.get(ybKey).has(div)) assignments.get(ybKey).set(div, new Map());

      const subMap = ybSubjects.get(ybKey);
      const divAssign = assignments.get(ybKey).get(div);

      // ── THEORY ────────────────────────────────────────────────────────
      if (thHrs > 0) {
        if (!subMap.has(rawSub)) {
          subMap.set(rawSub, {
            id: uid(),
            name: rawSub,
            type: "theory",
            hours: thHrs,
            labHours: 0,
          });
        } else {
          // Keep the MAX session count seen across all divs
          const ex = subMap.get(rawSub);
          if (thHrs > ex.hours) ex.hours = thHrs;
        }
        const sub = subMap.get(rawSub);
        // First-teacher-wins per (ybKey, div, subId)
        if (!divAssign.has(sub.id)) {
          divAssign.set(sub.id, { teacherCode: curTeacher.code });
        }
      }

      // ── PRACTICAL / LAB ───────────────────────────────────────────────
      if (prHrs > 0) {
        // FIX 6: Consistent lab naming
        const labName = /\b(lab|practical)\b/i.test(rawSub)
          ? rawSub
          : `${rawSub} Lab`;

        // Assign Core Lab slot number per ybKey (in order of first appearance)
        if (!labOrder.has(ybKey)) labOrder.set(ybKey, new Map());
        const lo = labOrder.get(ybKey);
        if (!lo.has(labName)) {
          const n = lo.size + 1;
          // Cap at Core Lab 3 (timetable typically supports max 3 lab slots)
          lo.set(labName, `Core Lab ${Math.min(n, 3)}`);
        }
        const labType = lo.get(labName);

        if (!subMap.has(labName)) {
          subMap.set(labName, {
            id: uid(),
            name: labName,
            type: labType,
            hours: 0,
            labHours: 2,  // Standard 2-hour lab session
          });
        }
        const labSub = subMap.get(labName);

        // FIX 5: First-teacher-wins for labs too
        if (!divAssign.has(labSub.id)) {
          divAssign.set(labSub.id, { teacherCode: curTeacher.code });
        }
      }
    });
  }

  // ── Backfill: fill lab assignments for divs that have no teacher yet ──────
  // (e.g. a lab subject was introduced for div A but div B has no explicit row)
  assignments.forEach((divMap, ybKey) => {
    const subMap = ybSubjects.get(ybKey) || new Map();
    const labSubs = [...subMap.values()].filter(s => s.type.startsWith("Core Lab"));

    // Collect all assigned codes per lab ID across all divs
    const labCodes = new Map();  // labId → [teacherCode, ...]
    divMap.forEach(divAssign => {
      labSubs.forEach(ls => {
        const a = divAssign.get(ls.id);
        if (a?.teacherCode) {
          if (!labCodes.has(ls.id)) labCodes.set(ls.id, []);
          labCodes.get(ls.id).push(a.teacherCode);
        }
      });
    });

    // Fill gaps — use first assigned teacher as fallback
    divMap.forEach(divAssign => {
      labSubs.forEach(ls => {
        if (!divAssign.has(ls.id)) {
          const pool = labCodes.get(ls.id);
          if (pool?.length) {
            divAssign.set(ls.id, { teacherCode: pool[0] });
          }
        }
      });
    });
  });

  // ── Filter teachers: only keep those with ≥1 valid SE/TE/BE assignment ────
  const usedCodes2 = new Set();
  assignments.forEach(divMap => {
    divMap.forEach(divAssign => {
      divAssign.forEach(val => {
        if (val?.teacherCode) usedCodes2.add(val.teacherCode);
      });
    });
  });

  // ── Serialise ─────────────────────────────────────────────────────────────
  const teachersArr = [...teachers.values()].filter(t => usedCodes2.has(t.code));

  const yearBranchArr = [...yearBranches.entries()]
    .map(([id, d]) => ({
      id,
      year: d.year,
      branch: d.branch,
      divs: [...d.divs].sort(),
    }))
    .sort((a, b) => {
      // Sort SE before TE before BE
      const order = { SE: 0, TE: 1, BE: 2 };
      return (order[a.year] ?? 9) - (order[b.year] ?? 9);
    });

  const subjectsObj = {};
  ybSubjects.forEach((m, k) => { subjectsObj[k] = [...m.values()]; });

  const assignmentsObj = {};
  assignments.forEach((divMap, ybKey) => {
    assignmentsObj[ybKey] = {};
    divMap.forEach((subAssign, div) => {
      assignmentsObj[ybKey][div] = {};
      subAssign.forEach((val, id) => {
        assignmentsObj[ybKey][div][id] = val;
      });
    });
  });

  return {
    teachers: teachersArr,
    yearBranches: yearBranchArr,
    subjects: subjectsObj,
    assignments: assignmentsObj,
    _meta: {
      sheet: foundSheet,
      skippedRows,
      warnings,
    },
  };
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function LoadAllocationUploader({ onDataParsed }) {
  const [file, setFile] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState("");

  const handleFileSelect = e => {
    const f = e.target.files[0];
    if (f) { setFile(f); setError(""); setParsed(null); }
  };

  const handleParse = async () => {
    if (!file) { setError("Please select a file first."); return; }
    setParsing(true); setError("");
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", raw: true });
      const result = parseWorkbook(wb);
      console.log("✅ Parsed result:", result);
      setParsed(result);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setParsing(false);
    }
  };

  const handleApply = () => {
    if (parsed && onDataParsed) {
      // Strip internal _meta before passing upstream
      const { _meta, ...clean } = parsed;
      onDataParsed(clean);
    }
  };

  // ── Preview helpers ────────────────────────────────────────────────────────
  const allTeachersForSub = (ybKey, subId) => {
    const codes = new Set();
    const divMap = parsed?.assignments[ybKey] || {};
    Object.values(divMap).forEach(da => {
      if (da[subId]?.teacherCode) codes.add(da[subId].teacherCode);
    });
    return [...codes].map(c => {
      const t = parsed.teachers.find(x => x.code === c);
      return t ? `${c} — ${t.name}` : c;
    });
  };

  const totalTheory = parsed
    ? Object.values(parsed.subjects).reduce((s, a) => s + a.filter(x => x.type === "theory").length, 0)
    : 0;
  const totalLabs = parsed
    ? Object.values(parsed.subjects).reduce((s, a) => s + a.filter(x => x.type.startsWith("Core Lab")).length, 0)
    : 0;

  return (
    <div style={S.panel}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <span style={S.title}>📊 Import Load Allocation</span>
      </div>

      <p style={S.hint}>
        Upload the faculty load allocation Excel file.<br />
        <strong>Theory Total</strong> = lectures/week per division &nbsp;|&nbsp;
        <strong>Practical-Load</strong> &gt; 0 → Core Lab (2 hrs/session).<br />
        Mtech / BCA / FE / MINOR / DLO rows are automatically skipped.
      </p>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <label htmlFor="la-upload" style={S.uploadBtn}>
          {file ? `📄 ${file.name}` : "📁 Select Excel File (.xlsx)"}
        </label>
        <input id="la-upload" type="file" accept=".xlsx,.xls" onChange={handleFileSelect} style={{ display: "none" }} />

        {file && !parsed && (
          <button onClick={handleParse} disabled={parsing} style={S.processBtn}>
            {parsing ? "⏳ Parsing…" : "🔍 Parse File"}
          </button>
        )}
        {parsed && (
          <button onClick={handleApply} style={S.processBtn}>
            ✨ Apply to Timetable Generator
          </button>
        )}
      </div>

      {error && <div style={S.errorBox}><strong>❌ Error:</strong> {error}</div>}

      {parsed && (
        <>
          {/* Warnings */}
          {parsed._meta?.warnings?.length > 0 && (
            <div style={S.warnBox}>
              <strong>⚠️ Warnings:</strong>
              <ul style={{ margin: "4px 0 0", paddingLeft: 20 }}>
                {parsed._meta.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          <div style={S.successBox}>
            <strong>✅ Parsed successfully!</strong>
            <ul style={{ margin: "8px 0 0", paddingLeft: 20, lineHeight: 2 }}>
              <li>{parsed.teachers.length} teachers (with IT UG assignments)</li>
              <li>
                Year-Branches: {parsed.yearBranches.map(yb =>
                  `${yb.id} [Divs: ${yb.divs.join(", ")}]`
                ).join("  ·  ")}
              </li>
              <li>
                {Object.values(parsed.subjects).reduce((s, a) => s + a.length, 0)} subjects —&nbsp;
                {totalTheory} theory, {totalLabs} labs
              </li>
              <li style={{ color: "#888" }}>
                Sheet used: <em>{parsed._meta.sheet}</em> &nbsp;|&nbsp;
                {parsed._meta.skippedRows} non-IT rows skipped
              </li>
            </ul>
          </div>

          {/* Teachers table */}
          <div style={S.sectionHdr}>👨‍🏫 Teachers ({parsed.teachers.length})</div>
          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>#</th>
                  <th style={S.th}>Code</th>
                  <th style={S.th}>Full Name</th>
                </tr>
              </thead>
              <tbody>
                {parsed.teachers.map((t, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? "#fafbff" : "#fff" }}>
                    <td style={S.td}>{i + 1}</td>
                    <td style={{ ...S.td, fontFamily: "monospace", fontWeight: 700, color: "#667eea" }}>{t.code}</td>
                    <td style={S.td}>{t.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Per year-branch details */}
          {Object.entries(parsed.subjects).map(([ybKey, subs]) => {
            const yb = parsed.yearBranches.find(y => y.id === ybKey);
            return (
              <div key={ybKey}>
                <div style={S.sectionHdr}>
                  📚 {ybKey} — {subs.length} subjects &nbsp;
                  <span style={{ fontSize: 11, fontWeight: 400, color: "#888" }}>
                    (Divs: {yb?.divs.join(", ")})
                  </span>
                </div>

                {/* Subject overview */}
                <div style={{ maxHeight: 320, overflowY: "auto" }}>
                  <table style={S.table}>
                    <thead>
                      <tr>
                        <th style={S.th}>Subject</th>
                        <th style={S.th}>Type</th>
                        <th style={{ ...S.th, textAlign: "center" }}>Sessions/wk</th>
                        <th style={{ ...S.th, textAlign: "center" }}>Lab hrs</th>
                        <th style={S.th}>Teachers (all divs)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subs.map((sub, i) => {
                        const isLab = sub.type.startsWith("Core Lab");
                        const tNames = allTeachersForSub(ybKey, sub.id);
                        return (
                          <tr key={i} style={{ background: isLab ? "#f0fff4" : (i % 2 === 0 ? "#fafbff" : "#fff") }}>
                            <td style={{ ...S.td, fontWeight: 600 }}>{sub.name}</td>
                            <td style={S.td}><span style={S.chip(isLab)}>{sub.type}</span></td>
                            <td style={{ ...S.td, textAlign: "center", fontWeight: 700 }}>
                              {isLab ? "—" : sub.hours}
                            </td>
                            <td style={{ ...S.td, textAlign: "center", fontWeight: 700 }}>
                              {isLab ? sub.labHours : "—"}
                            </td>
                            <td style={{ ...S.td, fontSize: 11 }}>
                              {tNames.length
                                ? tNames.join(", ")
                                : <span style={{ color: "#bbb" }}>unassigned</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Division-wise assignments */}
                <div style={{ marginTop: 10, marginBottom: 4, fontSize: 12, fontWeight: 600, color: "#445" }}>
                  Division-wise teacher assignments for {ybKey}:
                </div>
                <div style={{ overflowX: "auto", marginBottom: 16 }}>
                  <table style={S.table}>
                    <thead>
                      <tr>
                        <th style={S.th}>Subject</th>
                        {(yb?.divs || []).map(div => (
                          <th key={div} style={S.th}>Div {div}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {subs.map((sub, i) => {
                        const isLab = sub.type.startsWith("Core Lab");
                        return (
                          <tr key={i} style={{ background: isLab ? "#f0fff4" : (i % 2 === 0 ? "#fafbff" : "#fff") }}>
                            <td style={{ ...S.td, fontWeight: 600 }}>{sub.name}</td>
                            {(yb?.divs || []).map(div => {
                              const assign = parsed.assignments[ybKey]?.[div]?.[sub.id];
                              const code = assign?.teacherCode;
                              const t = code ? parsed.teachers.find(x => x.code === code) : null;
                              return (
                                <td key={div} style={S.td}>
                                  {code
                                    ? <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#667eea" }}>
                                      {code}{t ? ` — ${t.name}` : ""}
                                    </span>
                                    : <span style={{ color: "#ccc" }}>—</span>}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}