import React, { useState } from "react";
import * as XLSX from "xlsx";

/**
 * LoadAllocationUploader — v5
 *
 * KEY CHANGES FROM v4:
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. MINOR LAB FOR ALL YEARS
 *    - classifyYD now recognises BE-MINOR, TE-MINOR, SE-MINOR (and their
 *      lab rows) and maps them to the correct year's elective group "MINOR".
 *    - Previously only TE-MINOR and MINOR-SE were handled; BE-MINOR was
 *      silently dropped.
 *
 * 2. CONSISTENT ELECTIVE-LAB TYPE
 *    - All MINOR/DLO lab subjects get type "Elective-MINOR-Lab" /
 *      "Elective-DLO1-Lab" etc. — matching isElectiveLab() in
 *      timetableHelpers.js exactly.
 */

const uid = () => Math.random().toString(36).slice(2, 9);
const DEFAULT_BATCHES_PER_DIV = 3;

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
    if (type === "theory")               return { padding: "2px 8px", borderRadius: 12, fontSize: 10, fontWeight: 700, background: "#f0f4ff", color: "#3451b2", border: "1px solid #c5d3f5" };
    if (type.startsWith("Core"))         return { padding: "2px 8px", borderRadius: 12, fontSize: 10, fontWeight: 700, background: "#f0fff4", color: "#276749", border: "1px solid #9ae6b4" };
    if (/-Lab$/.test(type))              return { padding: "2px 8px", borderRadius: 12, fontSize: 10, fontWeight: 700, background: "#f0f0ff", color: "#3730a3", border: "1px solid #c7d2fe" };
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

function getBatchesForDiv(div, count = DEFAULT_BATCHES_PER_DIV) {
  return Array.from({ length: count }, (_, i) => `${div}${i + 1}`);
}

function getLabBatchCount(prHrs, warnings, contextLabel) {
  if (prHrs <= 0) return 0;
  if (prHrs % 2 !== 0) {
    warnings.push(`${contextLabel}: practical load ${prHrs}h is not divisible by 2, so batch coverage was rounded down.`);
  }
  return Math.floor(prHrs / 2);
}

// ─── Row classifier ───────────────────────────────────────────────────────────
/**
 * Classify a Year-Div cell value.
 *
 * Returns one of:
 *   { kind: "skip" }
 *   { kind: "regular", targets: [{year, branch, div}] }
 *   { kind: "elective", year, branch, electiveGroup }
 *
 * MINOR is now supported for SE, TE, and BE.
 * DLO1–DLO6 remain TE-only (as per curriculum).
 */
function classifyYD(raw) {
  const str = String(raw || "").trim();
  if (!str) return { kind: "skip" };

  // Hard skip — non-IT-UG courses
  if (/^(BCA|FE|Mtech|M\.Tech)$/i.test(str)) return { kind: "skip" };

  // ── DLO electives: TE-DLO1 … TE-DLO6 ──
  const dloMatch = str.match(/^TE-(DLO\d+)(?:[-\s].*)?$/i);
  if (dloMatch) {
    return { kind: "elective", year: "TE", branch: "IT", electiveGroup: dloMatch[1].toUpperCase() };
  }

  // ── MINOR electives — all years: TE-MINOR, SE-MINOR, BE-MINOR ──
  // Also handles legacy patterns: MINOR-SE, MINOR-TE, MINOR-BE
  const minorMatch =
    str.match(/^(SE|TE|BE)-MINOR(?:[-\s].*)?$/i) ||   // SE-MINOR, TE-MINOR, BE-MINOR
    str.match(/^MINOR-(SE|TE|BE)(?:[-\s].*)?$/i);     // MINOR-SE, MINOR-TE, MINOR-BE

  if (minorMatch) {
    // minorMatch[1] is the year in both patterns
    const year = minorMatch[1].toUpperCase();
    return { kind: "elective", year, branch: "IT", electiveGroup: "MINOR" };
  }

  // ── Regular SE / TE / BE theory/lab rows ──
  const m = str.match(/^(SE|TE|BE)-(.+)$/i);
  if (!m) return { kind: "skip" };

  const year = m[1].toUpperCase();
  const rest = m[2];

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
  const teachers     = new Map();
  const usedCodes    = new Set();
  const yearBranches = new Map();
  const ybSubjects   = new Map();
  const assignments  = new Map();
  const labOrder     = new Map();

  const electiveSubjects = new Map();
  const electiveAssign   = new Map();

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

    // ── ELECTIVE (DLO / MINOR — all years) ───────────────────────────────
    if (cls.kind === "elective") {
      const { year, branch, electiveGroup } = cls;
      const ybKey       = `${year}-${branch}`;
      const electiveKey = `${ybKey}::${electiveGroup}`;

      ensureYB(ybKey, year, branch);

      if (!electiveSubjects.has(electiveKey)) electiveSubjects.set(electiveKey, new Map());
      if (!electiveAssign.has(electiveKey))   electiveAssign.set(electiveKey, new Map());

      const eSubMap = electiveSubjects.get(electiveKey);
      const eAssign = electiveAssign.get(electiveKey);
      const subLabel = rawSub;

      // ── Theory elective subject ──────────────────────────────────────────
      if (thHrs > 0) {
        const fullName = `[${electiveGroup}] ${subLabel}`;

        if (!eSubMap.has(fullName)) {
          eSubMap.set(fullName, {
            id:           uid(),
            name:         fullName,
            type:         `Elective-${electiveGroup}`,
            hours:        thHrs,
            labHours:     0,
            electiveGroup,
          });
        } else {
          const ex = eSubMap.get(fullName);
          if (thHrs > ex.hours) ex.hours = thHrs;
        }

        const eSub = eSubMap.get(fullName);
        if (!eAssign.has(eSub.id)) {
          eAssign.set(eSub.id, { teacherCode: curTeacher.code });
        }
      }

      // ── Elective LAB subject ─────────────────────────────────────────────
      // Type pattern "Elective-{GROUP}-Lab" matches isElectiveLab() in timetableHelpers.js
      if (prHrs > 0) {
        const labFullName = `[${electiveGroup}] ${subLabel} Lab`;
        const labType     = `Elective-${electiveGroup}-Lab`;

        if (!eSubMap.has(labFullName)) {
          eSubMap.set(labFullName, {
            id:            uid(),
            name:          labFullName,
            type:          labType,
            hours:         0,
            labHours:      2,
            electiveGroup,
            isElectiveLab: true,
          });
        } else {
          const ex = eSubMap.get(labFullName);
          ex.labHours = 2;
        }

        const eLabSub = eSubMap.get(labFullName);
        if (!eAssign.has(eLabSub.id)) {
          eAssign.set(eLabSub.id, { teacherCode: curTeacher.code });
        }
      }

      const hrs = thHrs + (prHrs > 0 ? prHrs : 0);
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

        const subMap    = ybSubjects.get(ybKey);
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
          const existing = divAssign.get(labSub.id) || { teacherCode: "", batchAssigns: [] };
          const batchAssigns = Array.isArray(existing.batchAssigns) ? [...existing.batchAssigns] : [];
          const allBatches = getBatchesForDiv(div);
          const batchSlots = getLabBatchCount(prHrs, warnings, `${rawYD} / ${rawSub} / ${curTeacher.name}`);

          let assignedHere = 0;
          for (const batch of allBatches) {
            if (assignedHere >= batchSlots) break;
            if (batchAssigns.some(b => b.batch === batch)) continue;
            batchAssigns.push({ batch, teacherCode: curTeacher.code, room: "" });
            assignedHere++;
          }

          if (assignedHere < batchSlots) {
            warnings.push(
              `${rawYD} / ${rawSub}: ${curTeacher.name} has ${prHrs}h practical load, but only ${assignedHere} batch slot(s) were available in Div ${div}.`
            );
          }

          const uniqueCodes = [...new Set(batchAssigns.map(b => b.teacherCode).filter(Boolean))];
          divAssign.set(labSub.id, {
            teacherCode: uniqueCodes.length === 1 ? uniqueCodes[0] : "",
            batchAssigns,
          });
        }
      });

      curTeacher.usedLoad += thHrs + (prHrs > 0 ? prHrs : 0);
    }
  }

  // ── Merge electives into ybSubjects + assignments ─────────────────────────
  electiveSubjects.forEach((eSubMap, electiveKey) => {
    const [ybKey] = electiveKey.split("::");
    const eAssign = electiveAssign.get(electiveKey) || new Map();

    if (!ybSubjects.has(ybKey))  ybSubjects.set(ybKey, new Map());
    if (!assignments.has(ybKey)) assignments.set(ybKey, new Map());

    const subMap = ybSubjects.get(ybKey);
    const ybInfo = yearBranches.get(ybKey);

    eSubMap.forEach((sub, name) => {
      if (!subMap.has(name)) subMap.set(name, sub);
    });

    const divMap = assignments.get(ybKey);
    if (divMap && ybInfo) {
      ybInfo.divs.forEach(div => {
        if (!divMap.has(div)) divMap.set(div, new Map());
        const divAssign = divMap.get(div);
        eSubMap.forEach((sub) => {
          const assignVal = eAssign.get(sub.id);
          if (assignVal && !divAssign.has(sub.id)) {
            divAssign.set(sub.id, { ...assignVal });
          }
        });
      });
    }
  });

  // ── Backfill core lab assignments across divs ─────────────────────────────
  assignments.forEach((divMap, ybKey) => {
    const subMap  = ybSubjects.get(ybKey) || new Map();
    const labSubs = [...subMap.values()].filter(s => s.type.startsWith("Core Lab"));
    const labAssignPools = new Map();

    divMap.forEach(divAssign => {
      labSubs.forEach(ls => {
        const a = divAssign.get(ls.id);
        if (a?.batchAssigns?.length) {
          if (!labAssignPools.has(ls.id)) labAssignPools.set(ls.id, []);
          labAssignPools.get(ls.id).push(...a.batchAssigns);
        } else if (a?.teacherCode) {
          if (!labAssignPools.has(ls.id)) labAssignPools.set(ls.id, []);
          labAssignPools.get(ls.id).push({ batch: "", teacherCode: a.teacherCode, room: "" });
        }
      });
    });

    divMap.forEach((divAssign, div) => {
      labSubs.forEach(ls => {
        if (!divAssign.has(ls.id)) {
          const pool = labAssignPools.get(ls.id);
          if (pool?.length) {
            const exactBatches = pool.filter(p => p.batch);
            const remappedBatchAssigns = exactBatches.length
              ? getBatchesForDiv(div).slice(0, exactBatches.length).map((batch, idx) => ({
                  batch,
                  teacherCode: exactBatches[idx]?.teacherCode || "",
                  room:        exactBatches[idx]?.room || "",
                }))
              : [];
            divAssign.set(ls.id, {
              teacherCode: remappedBatchAssigns.length ? "" : (pool[0]?.teacherCode || ""),
              batchAssigns: remappedBatchAssigns,
            });
          }
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
  assignments.forEach(divMap => divMap.forEach(da => da.forEach(v => {
    if (v?.teacherCode) usedCodes2.add(v.teacherCode);
    if (v?.batchAssigns?.length) v.batchAssigns.forEach(b => { if (b?.teacherCode) usedCodes2.add(b.teacherCode); });
  })));
  electiveAssign.forEach(eAssign => eAssign.forEach(v => { if (v?.teacherCode) usedCodes2.add(v.teacherCode); }));

  // ── Serialise ─────────────────────────────────────────────────────────────
  const teachersArr = [...teachers.values()]
    .filter(t => usedCodes2.has(t.code))
    .map(({ code, name, totalLoad, usedLoad }) => ({ code, name, totalLoad, usedLoad }));

  const yearBranchArr = [...yearBranches.entries()]
    .map(([id, d]) => ({ id, year: d.year, branch: d.branch, divs: [...d.divs].sort() }))
    .filter(yb => yb.divs.length > 0)
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
      clean.teachers = clean.teachers.map(({ code, name }) => ({ code, name }));
      onDataParsed(clean);
    }
  };

  // ── Preview helpers ───────────────────────────────────────────────────────
  const allTeachersForSub = (ybKey, subId) => {
    const codes   = new Set();
    const divMap  = parsed?.assignments[ybKey] || {};
    Object.values(divMap).forEach(da => {
      const assign = da[subId];
      if (assign?.teacherCode) codes.add(assign.teacherCode);
      if (assign?.batchAssigns?.length) assign.batchAssigns.forEach(b => { if (b?.teacherCode) codes.add(b.teacherCode); });
    });
    return [...codes].map(c => {
      const t = parsed.teachers.find(x => x.code === c);
      return t ? `${c} — ${t.name}` : c;
    });
  };

  const assignmentLabel = (assign, isLab) => {
    if (!assign) return null;
    if (isLab && assign.batchAssigns?.length) {
      return assign.batchAssigns.map(b => {
        const t = parsed.teachers.find(x => x.code === b.teacherCode);
        return `${b.batch}: ${b.teacherCode}${t ? ` — ${t.name}` : ""}`;
      });
    }
    if (!assign.teacherCode) return null;
    const t = parsed.teachers.find(x => x.code === assign.teacherCode);
    return [`${assign.teacherCode}${t ? ` — ${t.name}` : ""}`];
  };

  const totalTheory       = parsed ? Object.values(parsed.subjects).reduce((s, a) => s + a.filter(x => x.type === "theory").length, 0) : 0;
  const totalLabs         = parsed ? Object.values(parsed.subjects).reduce((s, a) => s + a.filter(x => x.type.startsWith("Core Lab")).length, 0) : 0;
  const totalElectives    = parsed ? Object.values(parsed.subjects).reduce((s, a) => s + a.filter(x => /^Elective-/.test(x.type) && !/-Lab$/.test(x.type)).length, 0) : 0;
  const totalElectiveLabs = parsed ? Object.values(parsed.subjects).reduce((s, a) => s + a.filter(x => /-Lab$/.test(x.type)).length, 0) : 0;

  const electiveGroups = parsed
    ? Object.entries(parsed.subjects).flatMap(([ybKey, subs]) =>
        [...new Set(subs.filter(s => /^Elective-/.test(s.type)).map(s => s.electiveGroup))].map(g => ({
          ybKey,
          group: g,
          theorySubs: subs.filter(s => s.electiveGroup === g && !/-Lab$/.test(s.type)),
          labSubs:    subs.filter(s => s.electiveGroup === g && /-Lab$/.test(s.type)),
        }))
      )
    : [];

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
        <strong>DLO1–DLO6</strong> (TE) &amp; <strong>MINOR</strong> (SE/TE/BE) theory → <em>Elective-theory</em>;<br />
        <strong>DLO1–DLO6</strong> (TE) &amp; <strong>MINOR</strong> (SE/TE/BE) practical → <em>Elective-Lab</em> (2-hr block).<br />
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
          {parsed._meta?.warnings?.length > 0 && (
            <div style={S.warnBox}>
              <strong>⚠️ Warnings:</strong>
              <ul style={{ margin: "4px 0 0", paddingLeft: 20 }}>
                {parsed._meta.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

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
                {totalTheory} theory &nbsp;|&nbsp; {totalLabs} core labs &nbsp;|&nbsp;
                {totalElectives} elective theory &nbsp;|&nbsp; {totalElectiveLabs} elective labs
              </li>
              {electiveGroups.length > 0 && (
                <li>
                  Elective groups:&nbsp;
                  {electiveGroups.map(eg =>
                    `${eg.ybKey}·${eg.group} (${eg.theorySubs.length} theory${eg.labSubs.length ? ` + ${eg.labSubs.length} lab` : ""})`
                  ).join("  ·  ")}
                </li>
              )}
              <li style={{ color: "#888" }}>
                Sheet: <em>{parsed._meta.sheet}</em> &nbsp;|&nbsp;
                {parsed._meta.skippedRows} non-IT rows skipped
              </li>
            </ul>
          </div>

          {/* Teachers table */}
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
            const yb             = parsed.yearBranches.find(y => y.id === ybKey);
            const regular        = subs.filter(s => !s.type.startsWith("Elective-"));
            const electiveTheory = subs.filter(s => /^Elective-/.test(s.type) && !/-Lab$/.test(s.type));
            const electiveLabs   = subs.filter(s => /-Lab$/.test(s.type));

            return (
              <div key={ybKey}>
                <div style={S.sectionHdr}>
                  📚 {ybKey} — {subs.length} subjects &nbsp;
                  <span style={{ fontSize: 11, fontWeight: 400, color: "#888" }}>
                    (Divs: {yb?.divs.join(", ") || "none"})
                  </span>
                </div>

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

                {electiveTheory.length > 0 && (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#9c4221", marginBottom: 6 }}>
                      🎓 Elective Theory Subjects ({electiveTheory.length})
                    </div>
                    <div style={{ maxHeight: 260, overflowY: "auto", marginBottom: 10 }}>
                      <table style={S.table}>
                        <thead>
                          <tr>
                            <th style={S.th}>Subject</th>
                            <th style={S.th}>Group</th>
                            <th style={{ ...S.th, textAlign: "center" }}>Sessions/wk</th>
                            <th style={S.th}>Teacher</th>
                          </tr>
                        </thead>
                        <tbody>
                          {electiveTheory.map((sub, i) => {
                            const tNames = allTeachersForSub(ybKey, sub.id);
                            return (
                              <tr key={i} style={{ background: i % 2 === 0 ? "#fffdf5" : "#fff" }}>
                                <td style={{ ...S.td, fontWeight: 600 }}>{sub.name}</td>
                                <td style={S.td}><span style={S.chip(sub.type)}>{sub.electiveGroup}</span></td>
                                <td style={{ ...S.td, textAlign: "center", fontWeight: 700 }}>{sub.hours || "—"}</td>
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

                {electiveLabs.length > 0 && (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#3730a3", marginBottom: 6 }}>
                      🔬 Elective Lab Subjects ({electiveLabs.length})
                    </div>
                    <div style={{ maxHeight: 260, overflowY: "auto", marginBottom: 10 }}>
                      <table style={S.table}>
                        <thead>
                          <tr>
                            <th style={S.th}>Subject</th>
                            <th style={S.th}>Group</th>
                            <th style={{ ...S.th, textAlign: "center" }}>Lab hrs</th>
                            <th style={S.th}>Teacher</th>
                          </tr>
                        </thead>
                        <tbody>
                          {electiveLabs.map((sub, i) => {
                            const tNames = allTeachersForSub(ybKey, sub.id);
                            return (
                              <tr key={i} style={{ background: i % 2 === 0 ? "#f5f5ff" : "#fff" }}>
                                <td style={{ ...S.td, fontWeight: 600 }}>{sub.name}</td>
                                <td style={S.td}><span style={S.chip(sub.type)}>{sub.electiveGroup} Lab</span></td>
                                <td style={{ ...S.td, textAlign: "center", fontWeight: 700 }}>{sub.labHours || 2}</td>
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
                        const isElective = /^Elective-/.test(sub.type) && !/-Lab$/.test(sub.type);
                        const isELab     = /-Lab$/.test(sub.type);
                        const rowBg = isELab
                          ? (i % 2 === 0 ? "#f5f5ff" : "#f0f0ff")
                          : isElective
                            ? (i % 2 === 0 ? "#fffdf5" : "#fffbf0")
                            : isLab
                              ? "#f0fff4"
                              : (i % 2 === 0 ? "#fafbff" : "#fff");
                        return (
                          <tr key={i} style={{ background: rowBg }}>
                            <td style={{ ...S.td, fontWeight: 600 }}>
                              {(isElective || isELab) && (
                                <span style={{ fontSize: 9, color: isELab ? "#3730a3" : "#9c4221", fontWeight: 700, marginRight: 4 }}>
                                  [{sub.electiveGroup}{isELab ? " Lab" : ""}]
                                </span>
                              )}
                              {sub.name}
                            </td>
                            {(yb?.divs || []).map(div => {
                              const assign = parsed.assignments[ybKey]?.[div]?.[sub.id];
                              const labels = assignmentLabel(assign, isLab);
                              return (
                                <td key={div} style={S.td}>
                                  {labels?.length
                                    ? <div style={{ display: "grid", gap: 4 }}>
                                        {labels.map((label, idx) => (
                                          <span key={idx} style={{ fontFamily: "monospace", fontWeight: 700, color: "#667eea", fontSize: 11 }}>
                                            {label}
                                          </span>
                                        ))}
                                      </div>
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