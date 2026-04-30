import React, { useState } from "react";
import * as XLSX from "xlsx";

/**
 * LoadAllocationUploader — v3 (Elective-aware + Load-capped)
 *
 * KEY CHANGES FROM v2:
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. ELECTIVE SUBJECTS NOW EXTRACTED (was wrongly skipped before)
 *    - TE-DLO1 … TE-DLO6  → elective type "Elective-DLO1" … "Elective-DLO6"
 *    - TE-MINOR / TE-minor → elective type "Elective-MINOR" for TE year
 *    - MINOR-SE            → elective type "Elective-MINOR" for SE year
 *    - Electives are shared across ALL divs of their year (A, B, C …)
 *      so they are stored once per ybKey with ALL divs assigned.
 *    - Each DLO group is independent — students pick one DLO.
 *    - In the timetable these map to the "electives" cell type already
 *      supported by the generator (cell.electives array).
 *
 * 2. TEACHER TOTAL LOAD ENFORCED
 *    - The "Total Load" column is read per teacher (Sr# row).
 *    - Each subject row that is processed adds its hours to a running
 *      tally for that teacher.
 *    - Once the tally reaches (or would exceed) the declared total,
 *      remaining rows for that teacher are still parsed for subject/
 *      assignment data but flagged — and the timetable generator
 *      should respect the cap when scheduling.
 *    - The parsed teacher object now carries { code, name, totalLoad,
 *      assignedLoad } so the UI can show a warning when load is exceeded.
 *
 * 3. SKIP LOGIC TIGHTENED
 *    - Only these patterns are skipped: BCA, FE, Mtech / M.Tech
 *    - Everything else (SE, TE, MINOR-SE, TE-DLO*, TE-MINOR) is processed.
 *
 * 4. ELECTIVE ASSIGNMENT SHAPE
 *    - assignments[ybKey][div][subId] = { teacherCode }
 *      same shape as theory/lab — the generator already handles electives
 *      in the Step4Teachers assignment table.
 *
 * OUTPUT SHAPE (unchanged prop interface):
 *   onDataParsed({
 *     teachers:     [{ code, name, totalLoad, assignedLoad }],
 *     yearBranches: [{ id, year, branch, divs }],
 *     subjects:     { [ybKey]: [{ id, name, type, hours, labHours }] },
 *     assignments:  { [ybKey]: { [div]: { [subId]: { teacherCode } } } },
 *   })
 */

const uid = () => Math.random().toString(36).slice(2, 9);

// ─── Styles ──────────────────────────────────────────────────────────────────
const S = {
  panel:      { background: "#fff", borderRadius: 16, padding: "22px 26px", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", marginBottom: 20 },
  title:      { fontSize: 16, fontWeight: 700, color: "#1a2b4a" },
  hint:       { color: "#666", fontSize: 13, lineHeight: 1.75, marginBottom: 14 },
  uploadBtn:  { padding: "12px 28px", borderRadius: 8, border: "2px dashed #667eea", background: "#f0f4ff", color: "#667eea", fontWeight: 600, fontSize: 14, cursor: "pointer", display: "inline-block" },
  processBtn: { padding: "12px 32px", borderRadius: 8, border: "none", background: "linear-gradient(90deg,#667eea,#764ba2)", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", boxShadow: "0 4px 14px rgba(102,126,234,0.4)" },
  successBox: { padding: "14px 18px", borderRadius: 8, marginTop: 14, fontSize: 13, background: "#f0faf8", border: "1px solid #9ae6b4", color: "#276749" },
  errorBox:   { padding: "14px 18px", borderRadius: 8, marginTop: 14, fontSize: 13, background: "#fff0f4", border: "1px solid #ffb3c6", color: "#c0003a" },
  warnBox:    { padding: "14px 18px", borderRadius: 8, marginTop: 14, fontSize: 13, background: "#fffbf0", border: "1px solid #fbd38d", color: "#744210" },
  table:      { width: "100%", borderCollapse: "collapse", fontSize: 12, marginTop: 14 },
  th:         { padding: "8px 10px", background: "#1a2b4a", color: "#fff", textAlign: "left", fontWeight: 700, fontSize: 11 },
  td:         { padding: "6px 10px", border: "1px solid #e2e8f0", fontSize: 12 },
  sectionHdr: { fontWeight: 700, fontSize: 13, color: "#1a2b4a", marginTop: 20, marginBottom: 8 },
  chip: (type) => {
    if (type === "theory")        return { padding: "2px 8px", borderRadius: 12, fontSize: 10, fontWeight: 700, background: "#f0f4ff", color: "#3451b2", border: "1px solid #c5d3f5" };
    if (type.startsWith("Core")) return { padding: "2px 8px", borderRadius: 12, fontSize: 10, fontWeight: 700, background: "#f0fff4", color: "#276749", border: "1px solid #9ae6b4" };
    // elective
    return { padding: "2px 8px", borderRadius: 12, fontSize: 10, fontWeight: 700, background: "#fff8f0", color: "#9c4221", border: "1px solid #fbd38d" };
  },
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

// ─── Safe number extractor ────────────────────────────────────────────────────
function toNum(val) {
  if (val === null || val === undefined || val === "") return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : Math.floor(Math.abs(n));
}

// ─── Row classifier ───────────────────────────────────────────────────────────
/**
 * Classify a Year-Div cell value.
 *
 * Returns one of:
 *   { kind: "skip" }                                    — BCA / FE / Mtech
 *   { kind: "theory", targets: [{year,branch,div}] }   — SE-A, TE-B-C, etc.
 *   { kind: "lab",    targets: [{year,branch,div}] }   — same, practical-only
 *   { kind: "elective", year, branch, electiveGroup }  — TE-DLO1, TE-MINOR, MINOR-SE
 *
 * (theory/lab distinction is done later based on thHrs/prHrs)
 */
function classifyYD(raw) {
  const str = String(raw || "").trim();
  if (!str) return { kind: "skip" };

  // Hard skip — non-IT-UG courses
  if (/^(BCA|FE|Mtech|M\.Tech)$/i.test(str)) return { kind: "skip" };

  // ── DLO electives: TE-DLO1 … TE-DLO6 ──
  const dloMatch = str.match(/^TE-(DLO\d+)$/i);
  if (dloMatch) {
    return { kind: "elective", year: "TE", branch: "IT", electiveGroup: dloMatch[1].toUpperCase() };
  }

  // ── MINOR electives for TE ──
  if (/^TE-MINOR$/i.test(str) || /^TE-minor$/i.test(str)) {
    return { kind: "elective", year: "TE", branch: "IT", electiveGroup: "MINOR" };
  }

  // ── MINOR electives for SE ──
  if (/^MINOR-SE$/i.test(str)) {
    return { kind: "elective", year: "SE", branch: "IT", electiveGroup: "MINOR" };
  }

  // ── Regular SE / TE / BE theory/lab rows ──
  const m = str.match(/^(SE|TE|BE)-(.+)$/i);
  if (!m) return { kind: "skip" };

  const year = m[1].toUpperCase();
  const rest = m[2];

  // Extract single-letter division tokens
  const divs = rest
    .split(/[-\s,]+/)
    .map(d => d.trim())
    .filter(d => /^[A-Za-z]$/.test(d))
    .map(d => d.toUpperCase());

  if (!divs.length) return { kind: "skip" };

  return {
    kind: "regular",
    targets: divs.map(div => ({ year, branch: "IT", div })),
  };
}

// ─── Main parser ──────────────────────────────────────────────────────────────
export function parseWorkbook(workbook) {
  const warnings = [];

  // ── Find correct sheet ────────────────────────────────────────────────────
  let rows = null, foundSheet = null;
  for (const sn of workbook.SheetNames) {
    const r = XLSX.utils.sheet_to_json(workbook.Sheets[sn], {
      header: 1, defval: null, raw: true,
    });
    if (r.some(row => row?.some(c => String(c ?? "").toLowerCase().includes("name of faculty")))) {
      rows = r; foundSheet = sn; break;
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

  const hdrs = rows[hdrIdx].map(h => String(h ?? "").toLowerCase().trim());

  const nameIdx  = hdrs.findIndex(h => h.includes("name") && h.includes("faculty"));
  const ydIdx    = hdrs.findIndex(h => h.includes("year") || (h.includes("div") && !h.includes("total")));
  const subIdx   = hdrs.findIndex(h => h.includes("subject") && !h.includes("speciali"));
  const thIdx    = hdrs.findIndex(h => h.includes("theory") && !h.includes("total load"));
  const prIdx    = hdrs.findIndex(h => h.includes("practical"));
  const loadIdx  = hdrs.findIndex(h => h.includes("total") && h.includes("load"));

  if (nameIdx < 0) throw new Error("Cannot find 'Name of Faculty' column.");
  if (ydIdx   < 0) throw new Error("Cannot find 'Year-Div' column.");
  if (subIdx  < 0) throw new Error("Cannot find 'Subject' column.");
  if (thIdx   < 0) warnings.push("'Theory Total' column not found.");
  if (prIdx   < 0) warnings.push("'Practical-Load' column not found.");
  if (loadIdx < 0) warnings.push("'Total Load' column not found — load cap won't be enforced.");

  // ── Data structures ───────────────────────────────────────────────────────
  const teachers    = new Map();   // code → { code, name, totalLoad, usedLoad }
  const usedCodes   = new Set();
  const yearBranches = new Map();  // ybKey → { year, branch, divs: Set }
  const ybSubjects  = new Map();   // ybKey → Map<subName, subObj>
  const assignments = new Map();   // ybKey → Map<div, Map<subId, {teacherCode}>>
  const labOrder    = new Map();   // ybKey → Map<labName, "Core Lab N">

  // Elective registries (keyed by ybKey + electiveGroup)
  // electiveKey = `${ybKey}::${electiveGroup}`
  const electiveSubjects = new Map(); // electiveKey → Map<subName, subObj>
  const electiveAssign   = new Map(); // electiveKey → Map<subId, {teacherCode}>

  let curTeacher  = null;
  let skippedRows = 0;

  const ensureYB = (ybKey, year, branch) => {
    if (!yearBranches.has(ybKey)) yearBranches.set(ybKey, { year, branch, divs: new Set() });
    if (!ybSubjects.has(ybKey))   ybSubjects.set(ybKey, new Map());
    if (!assignments.has(ybKey))  assignments.set(ybKey, new Map());
    if (!labOrder.has(ybKey))     labOrder.set(ybKey, new Map());
  };

  const ensureDiv = (ybKey, div) => {
    yearBranches.get(ybKey).divs.add(div);
    if (!assignments.get(ybKey).has(div)) assignments.get(ybKey).set(div, new Map());
  };

  // ── Row scan ──────────────────────────────────────────────────────────────
  for (let i = hdrIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(c => c === null || c === undefined || c === "")) continue;

    // ── Teacher detection ─────────────────────────────────────────────────
    const rawName = row[nameIdx];
    if (rawName !== null && rawName !== undefined && rawName !== "") {
      const nameStr = String(rawName).trim();
      if (nameStr && !/^\d+$/.test(nameStr)) {
        const existing = [...teachers.values()].find(t => t.name === nameStr);
        if (existing) {
          curTeacher = existing;
        } else {
          const code      = makeCode(nameStr, usedCodes);
          const totalLoad = loadIdx >= 0 ? toNum(row[loadIdx]) : 0;
          curTeacher = { code, name: nameStr, totalLoad, usedLoad: 0 };
          teachers.set(code, curTeacher);
        }
      }
    }

    if (!curTeacher) continue;

    const rawYD  = String(row[ydIdx]  ?? "").trim();
    const rawSub = String(row[subIdx] ?? "").trim();
    if (!rawYD || !rawSub) continue;

    const thHrs = thIdx >= 0 ? toNum(row[thIdx]) : 0;
    const prHrs = prIdx >= 0 ? toNum(row[prIdx]) : 0;
    if (thHrs === 0 && prHrs === 0) continue;

    const cls = classifyYD(rawYD);

    // ── SKIP ─────────────────────────────────────────────────────────────
    if (cls.kind === "skip") {
      skippedRows++;
      continue;
    }

    // ── ELECTIVE (DLO / MINOR) ────────────────────────────────────────────
    if (cls.kind === "elective") {
      const { year, branch, electiveGroup } = cls;
      const ybKey       = `${year}-${branch}`;
      const electiveKey = `${ybKey}::${electiveGroup}`;

      // Ensure the YB exists (divs populated later from regular rows,
      // or we add a placeholder that gets merged)
      ensureYB(ybKey, year, branch);

      if (!electiveSubjects.has(electiveKey)) electiveSubjects.set(electiveKey, new Map());
      if (!electiveAssign.has(electiveKey))   electiveAssign.set(electiveKey, new Map());

      const eSubMap  = electiveSubjects.get(electiveKey);
      const eAssign  = electiveAssign.get(electiveKey);
      const subLabel = rawSub; // e.g. "ANLP", "BI", "Game Development"

      // Full key includes group to namespace identical names across groups
      const fullName = `[${electiveGroup}] ${subLabel}`;

      if (!eSubMap.has(fullName)) {
        eSubMap.set(fullName, {
          id:       uid(),
          name:     fullName,
          type:     `Elective-${electiveGroup}`,
          hours:    thHrs,
          labHours: prHrs > 0 ? 2 : 0,
          electiveGroup,
        });
      } else {
        const ex = eSubMap.get(fullName);
        if (thHrs > ex.hours)   ex.hours   = thHrs;
        if (prHrs > 0)          ex.labHours = 2;
      }

      const eSub = eSubMap.get(fullName);
      // First-teacher-wins for this elective subject
      if (!eAssign.has(eSub.id)) {
        eAssign.set(eSub.id, { teacherCode: curTeacher.code });
      }

      // Track load contribution
      const hrs = thHrs + (prHrs > 0 ? 2 : 0);
      curTeacher.usedLoad += hrs;
      continue;
    }

    // ── REGULAR (theory / lab) ─────────────────────────────────────────────
    if (cls.kind === "regular") {
      const { targets } = cls;

      targets.forEach(({ year, branch, div }) => {
        const ybKey = `${year}-${branch}`;
        ensureYB(ybKey, year, branch);
        ensureDiv(ybKey, div);

        const subMap   = ybSubjects.get(ybKey);
        const divAssign = assignments.get(ybKey).get(div);

        // Theory
        if (thHrs > 0) {
          if (!subMap.has(rawSub)) {
            subMap.set(rawSub, { id: uid(), name: rawSub, type: "theory", hours: thHrs, labHours: 0 });
          } else {
            const ex = subMap.get(rawSub);
            if (thHrs > ex.hours) ex.hours = thHrs;
          }
          const sub = subMap.get(rawSub);
          if (!divAssign.has(sub.id)) divAssign.set(sub.id, { teacherCode: curTeacher.code });
        }

        // Lab
        if (prHrs > 0) {
          const labName = /\b(lab|practical)\b/i.test(rawSub) ? rawSub : `${rawSub} Lab`;
          const lo = labOrder.get(ybKey);
          if (!lo.has(labName)) {
            lo.set(labName, `Core Lab ${Math.min(lo.size + 1, 3)}`);
          }
          const labType = lo.get(labName);

          if (!subMap.has(labName)) {
            subMap.set(labName, { id: uid(), name: labName, type: labType, hours: 0, labHours: 2 });
          }
          const labSub = subMap.get(labName);
          if (!divAssign.has(labSub.id)) divAssign.set(labSub.id, { teacherCode: curTeacher.code });
        }
      });

      // Track load
      const hrs = thHrs + (prHrs > 0 ? prHrs : 0);
      curTeacher.usedLoad += hrs;
    }
  }

  // ── Merge electives into ybSubjects + assignments ─────────────────────────
  // Elective subjects are added to the ybKey they belong to,
  // and assigned to ALL divs of that year (since electives are for whole year).
  electiveSubjects.forEach((eSubMap, electiveKey) => {
    const [ybKey] = electiveKey.split("::");
    const eAssign  = electiveAssign.get(electiveKey) || new Map();

    ensureYB(ybKey, ...ybKey.split("-"));  // year, branch
    const subMap = ybSubjects.get(ybKey);
    const ybInfo = yearBranches.get(ybKey);

    eSubMap.forEach((sub, name) => {
      if (!subMap.has(name)) subMap.set(name, sub);
    });

    // Assign elective to all known divs (use first-assigned teacher)
    const divMap = assignments.get(ybKey);
    if (divMap && ybInfo) {
      ybInfo.divs.forEach(div => {
        if (!divMap.has(div)) divMap.set(div, new Map());
        const divAssign = divMap.get(div);
        eSubMap.forEach((sub) => {
          const assignVal = eAssign.get(sub.id);
          if (assignVal && !divAssign.has(sub.id)) {
            divAssign.set(sub.id, assignVal);
          }
        });
      });
    }
  });

  // ── Backfill lab assignments across divs ──────────────────────────────────
  assignments.forEach((divMap, ybKey) => {
    const subMap  = ybSubjects.get(ybKey) || new Map();
    const labSubs = [...subMap.values()].filter(s => s.type.startsWith("Core Lab"));
    const labCodes = new Map();
    divMap.forEach(divAssign => {
      labSubs.forEach(ls => {
        const a = divAssign.get(ls.id);
        if (a?.teacherCode) {
          if (!labCodes.has(ls.id)) labCodes.set(ls.id, []);
          labCodes.get(ls.id).push(a.teacherCode);
        }
      });
    });
    divMap.forEach(divAssign => {
      labSubs.forEach(ls => {
        if (!divAssign.has(ls.id)) {
          const pool = labCodes.get(ls.id);
          if (pool?.length) divAssign.set(ls.id, { teacherCode: pool[0] });
        }
      });
    });
  });

  // ── Load cap warnings ─────────────────────────────────────────────────────
  teachers.forEach(t => {
    if (t.totalLoad > 0 && t.usedLoad > t.totalLoad) {
      warnings.push(
        `⚠️ ${t.name} (${t.code}): declared load ${t.totalLoad}h but assigned ${t.usedLoad}h — excess ${t.usedLoad - t.totalLoad}h.`
      );
    }
  });

  // ── Filter teachers to only those with IT-UG assignments ─────────────────
  const usedCodes2 = new Set();
  assignments.forEach(divMap => divMap.forEach(da => da.forEach(v => { if (v?.teacherCode) usedCodes2.add(v.teacherCode); })));
  // Also include teachers assigned to electives
  electiveAssign.forEach(eAssign => eAssign.forEach(v => { if (v?.teacherCode) usedCodes2.add(v.teacherCode); }));

  // ── MERGE ELECTIVES INTO REGULAR SUBJECTS AND ASSIGNMENTS ─────────────────
  // Electives are stored separately but must be merged into ybSubjects/assignments
  // before serialization so they're included in the output
  electiveSubjects.forEach((eSubMap, electiveKey) => {
    const [ybKey, electiveGroup] = electiveKey.split("::");
    
    // Ensure this yb exists in ybSubjects and assignments
    if (!ybSubjects.has(ybKey)) {
      ybSubjects.set(ybKey, new Map());
    }
    if (!assignments.has(ybKey)) {
      assignments.set(ybKey, new Map());
    }
    
    const ybSubMap = ybSubjects.get(ybKey);
    const ybAssign = assignments.get(ybKey);
    
    // Merge elective subjects into ybSubjects[ybKey]
    eSubMap.forEach((eSub, fullName) => {
      if (!ybSubMap.has(fullName)) {
        ybSubMap.set(fullName, { ...eSub }); // eSub already has id, name, type, hours, labHours
      }
    });
    
    // Get the assignments for this elective group
    const eAssign = electiveAssign.get(electiveKey) || new Map();
    
    // Electives are shared across ALL divisions of the year-branch
    // so we need to add them to every division's assignments
    const ybEntry = yearBranches.get(ybKey);
    if (ybEntry && ybEntry.divs.size > 0) {
      ybEntry.divs.forEach(div => {
        if (!ybAssign.has(div)) {
          ybAssign.set(div, new Map());
        }
        const divAssign = ybAssign.get(div);
        
        // Add all elective subject assignments to this division
        eSubMap.forEach((eSub, fullName) => {
          // Use the assignment from electiveAssign if available, otherwise no teacher
          const eAssignVal = eAssign.get(eSub.id);
          if (eAssignVal) {
            divAssign.set(eSub.id, { ...eAssignVal });
          }
        });
      });
    }
  });

  // ── Serialise ─────────────────────────────────────────────────────────────
  const teachersArr = [...teachers.values()]
    .filter(t => usedCodes2.has(t.code))
    .map(({ code, name, totalLoad, usedLoad }) => ({ code, name, totalLoad, usedLoad }));

  const yearBranchArr = [...yearBranches.entries()]
    .map(([id, d]) => ({ id, year: d.year, branch: d.branch, divs: [...d.divs].sort() }))
    .filter(yb => yb.divs.length > 0)   // skip year-branches with no actual divs
    .sort((a, b) => {
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
      subAssign.forEach((val, id) => { assignmentsObj[ybKey][div][id] = val; });
    });
  });

  return {
    teachers:     teachersArr,
    yearBranches: yearBranchArr,
    subjects:     subjectsObj,
    assignments:  assignmentsObj,
    _meta:        { sheet: foundSheet, skippedRows, warnings },
  };
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function LoadAllocationUploader({ onDataParsed }) {
  const [file,    setFile]    = useState(null);
  const [parsing, setParsing] = useState(false);
  const [parsed,  setParsed]  = useState(null);
  const [error,   setError]   = useState("");

  const handleFileSelect = e => {
    const f = e.target.files[0];
    if (f) { setFile(f); setError(""); setParsed(null); }
  };

  const handleParse = async () => {
    if (!file) { setError("Please select a file first."); return; }
    setParsing(true); setError("");
    try {
      const buf = await file.arrayBuffer();
      const wb  = XLSX.read(buf, { type: "array", raw: true });
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
      const { _meta, ...clean } = parsed;
      // Strip internal load fields from teachers before passing upstream
      clean.teachers = clean.teachers.map(({ code, name }) => ({ code, name }));
      onDataParsed(clean);
    }
  };

  // ── Preview helpers ───────────────────────────────────────────────────────
  const allTeachersForSub = (ybKey, subId) => {
    const codes   = new Set();
    const divMap  = parsed?.assignments[ybKey] || {};
    Object.values(divMap).forEach(da => { if (da[subId]?.teacherCode) codes.add(da[subId].teacherCode); });
    return [...codes].map(c => {
      const t = parsed.teachers.find(x => x.code === c);
      return t ? `${c} — ${t.name}` : c;
    });
  };

  const totalTheory    = parsed ? Object.values(parsed.subjects).reduce((s, a) => s + a.filter(x => x.type === "theory").length,              0) : 0;
  const totalLabs      = parsed ? Object.values(parsed.subjects).reduce((s, a) => s + a.filter(x => x.type.startsWith("Core Lab")).length,     0) : 0;
  const totalElectives = parsed ? Object.values(parsed.subjects).reduce((s, a) => s + a.filter(x => x.type.startsWith("Elective-")).length,    0) : 0;

  // Group elective subjects by their electiveGroup for display
  const electiveGroups = parsed
    ? Object.entries(parsed.subjects).flatMap(([ybKey, subs]) =>
        [...new Set(subs.filter(s => s.type.startsWith("Elective-")).map(s => s.electiveGroup))]
          .map(g => ({ ybKey, group: g, subs: subs.filter(s => s.electiveGroup === g) }))
      )
    : [];

  // Load overrun teachers
  const overloadedTeachers = parsed
    ? parsed.teachers.filter(t => t.totalLoad > 0 && t.usedLoad > t.totalLoad)
    : [];

  return (
    <div style={S.panel}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <span style={S.title}>📊 Import Load Allocation</span>
      </div>

      <p style={S.hint}>
        Upload the faculty load allocation Excel file.<br />
        <strong>Theory Total</strong> = lectures/week &nbsp;|&nbsp;
        <strong>Practical-Load</strong> &gt; 0 → Core Lab (2 hrs/session).<br />
        <strong>DLO1–DLO6 &amp; MINOR</strong> subjects are extracted as <em>Elective</em> subjects.<br />
        BCA / FE / Mtech rows are automatically skipped.
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

          {/* Load overrun alert */}
          {overloadedTeachers.length > 0 && (
            <div style={{ ...S.warnBox, marginTop: 8 }}>
              <strong>🔴 Load Exceeded:</strong>
              <ul style={{ margin: "4px 0 0", paddingLeft: 20 }}>
                {overloadedTeachers.map((t, i) => (
                  <li key={i}>
                    {t.name} ({t.code}): declared <strong>{t.totalLoad}h</strong>,
                    assigned <strong>{t.usedLoad}h</strong> → excess {t.usedLoad - t.totalLoad}h
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div style={S.successBox}>
            <strong>✅ Parsed successfully!</strong>
            <ul style={{ margin: "8px 0 0", paddingLeft: 20, lineHeight: 2 }}>
              <li>{parsed.teachers.length} teachers (with IT UG assignments)</li>
              <li>
                Year-Branches:&nbsp;
                {parsed.yearBranches.map(yb => `${yb.id} [Divs: ${yb.divs.join(", ")}]`).join("  ·  ")}
              </li>
              <li>
                {Object.values(parsed.subjects).reduce((s, a) => s + a.length, 0)} subjects —&nbsp;
                {totalTheory} theory &nbsp;|&nbsp; {totalLabs} labs &nbsp;|&nbsp; {totalElectives} electives
              </li>
              {electiveGroups.length > 0 && (
                <li>
                  Elective groups:&nbsp;
                  {electiveGroups.map(eg => `${eg.ybKey}·${eg.group} (${eg.subs.length} options)`).join("  ·  ")}
                </li>
              )}
              <li style={{ color: "#888" }}>
                Sheet: <em>{parsed._meta.sheet}</em> &nbsp;|&nbsp;
                {parsed._meta.skippedRows} non-IT rows skipped
              </li>
            </ul>
          </div>

          {/* Teachers table with load */}
          <div style={S.sectionHdr}>👨‍🏫 Teachers ({parsed.teachers.length})</div>
          <div style={{ maxHeight: 260, overflowY: "auto" }}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>#</th>
                  <th style={S.th}>Code</th>
                  <th style={S.th}>Full Name</th>
                  <th style={{ ...S.th, textAlign: "center" }}>Declared Load</th>
                  <th style={{ ...S.th, textAlign: "center" }}>Assigned Load</th>
                  <th style={{ ...S.th, textAlign: "center" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {parsed.teachers.map((t, i) => {
                  const over = t.totalLoad > 0 && t.usedLoad > t.totalLoad;
                  return (
                    <tr key={i} style={{ background: over ? "#fff5f5" : (i % 2 === 0 ? "#fafbff" : "#fff") }}>
                      <td style={S.td}>{i + 1}</td>
                      <td style={{ ...S.td, fontFamily: "monospace", fontWeight: 700, color: "#667eea" }}>{t.code}</td>
                      <td style={S.td}>{t.name}</td>
                      <td style={{ ...S.td, textAlign: "center" }}>{t.totalLoad || "—"}</td>
                      <td style={{ ...S.td, textAlign: "center", fontWeight: 700 }}>{t.usedLoad || "—"}</td>
                      <td style={{ ...S.td, textAlign: "center" }}>
                        {t.totalLoad > 0
                          ? (over
                              ? <span style={{ color: "#c0003a", fontWeight: 700 }}>🔴 Over by {t.usedLoad - t.totalLoad}h</span>
                              : <span style={{ color: "#276749" }}>✅ OK</span>)
                          : <span style={{ color: "#aaa" }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Per year-branch subject details */}
          {Object.entries(parsed.subjects).map(([ybKey, subs]) => {
            const yb       = parsed.yearBranches.find(y => y.id === ybKey);
            const regular  = subs.filter(s => !s.type.startsWith("Elective-"));
            const elective = subs.filter(s =>  s.type.startsWith("Elective-"));

            return (
              <div key={ybKey}>
                <div style={S.sectionHdr}>
                  📚 {ybKey} — {subs.length} subjects &nbsp;
                  <span style={{ fontSize: 11, fontWeight: 400, color: "#888" }}>
                    (Divs: {yb?.divs.join(", ") || "none"})
                  </span>
                </div>

                {/* Regular subjects */}
                {regular.length > 0 && (
                  <div style={{ maxHeight: 300, overflowY: "auto", marginBottom: 10 }}>
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
                        {regular.map((sub, i) => {
                          const isLab  = sub.type.startsWith("Core Lab");
                          const tNames = allTeachersForSub(ybKey, sub.id);
                          return (
                            <tr key={i} style={{ background: isLab ? "#f0fff4" : (i % 2 === 0 ? "#fafbff" : "#fff") }}>
                              <td style={{ ...S.td, fontWeight: 600 }}>{sub.name}</td>
                              <td style={S.td}><span style={S.chip(sub.type)}>{sub.type}</span></td>
                              <td style={{ ...S.td, textAlign: "center", fontWeight: 700 }}>{isLab ? "—" : sub.hours}</td>
                              <td style={{ ...S.td, textAlign: "center", fontWeight: 700 }}>{isLab ? sub.labHours : "—"}</td>
                              <td style={{ ...S.td, fontSize: 11 }}>
                                {tNames.length ? tNames.join(", ") : <span style={{ color: "#bbb" }}>unassigned</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Elective subjects grouped by DLO/MINOR */}
                {elective.length > 0 && (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#9c4221", marginBottom: 6 }}>
                      🎓 Elective Subjects ({elective.length})
                    </div>
                    <div style={{ maxHeight: 260, overflowY: "auto", marginBottom: 10 }}>
                      <table style={S.table}>
                        <thead>
                          <tr>
                            <th style={S.th}>Subject</th>
                            <th style={S.th}>Group</th>
                            <th style={{ ...S.th, textAlign: "center" }}>Sessions/wk</th>
                            <th style={{ ...S.th, textAlign: "center" }}>Lab hrs</th>
                            <th style={S.th}>Teacher</th>
                          </tr>
                        </thead>
                        <tbody>
                          {elective.map((sub, i) => {
                            const tNames = allTeachersForSub(ybKey, sub.id);
                            return (
                              <tr key={i} style={{ background: i % 2 === 0 ? "#fffdf5" : "#fff" }}>
                                <td style={{ ...S.td, fontWeight: 600 }}>{sub.name}</td>
                                <td style={S.td}><span style={S.chip(sub.type)}>{sub.electiveGroup}</span></td>
                                <td style={{ ...S.td, textAlign: "center", fontWeight: 700 }}>{sub.hours || "—"}</td>
                                <td style={{ ...S.td, textAlign: "center", fontWeight: 700 }}>{sub.labHours > 0 ? sub.labHours : "—"}</td>
                                <td style={{ ...S.td, fontSize: 11 }}>
                                  {tNames.length ? tNames.join(", ") : <span style={{ color: "#bbb" }}>unassigned</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {/* Division-wise assignment table */}
                <div style={{ marginTop: 6, marginBottom: 4, fontSize: 12, fontWeight: 600, color: "#445" }}>
                  Division-wise teacher assignments for {ybKey}:
                </div>
                <div style={{ overflowX: "auto", marginBottom: 20 }}>
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
                        const isLab      = sub.type.startsWith("Core Lab");
                        const isElective = sub.type.startsWith("Elective-");
                        return (
                          <tr key={i} style={{
                            background: isElective ? "#fffdf5" : isLab ? "#f0fff4" : (i % 2 === 0 ? "#fafbff" : "#fff"),
                          }}>
                            <td style={{ ...S.td, fontWeight: 600 }}>
                              {isElective && <span style={{ fontSize: 9, color: "#9c4221", fontWeight: 700, marginRight: 4 }}>[{sub.electiveGroup}]</span>}
                              {sub.name}
                            </td>
                            {(yb?.divs || []).map(div => {
                              const assign = parsed.assignments[ybKey]?.[div]?.[sub.id];
                              const code   = assign?.teacherCode;
                              const t      = code ? parsed.teachers.find(x => x.code === code) : null;
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