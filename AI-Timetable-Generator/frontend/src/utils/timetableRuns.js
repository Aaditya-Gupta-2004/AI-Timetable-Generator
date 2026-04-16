import { API_BASE } from "../config/api";
import {
  buildClassroomTTs,
  buildLabRoomTTs,
  buildTeacherTTs,
} from "../components/timetableHelpers";

export const SELECTED_RUN_STORAGE_KEY = "selectedTimetableRunId";

function authHeaders() {
  const token = localStorage.getItem("token");
  if (!token) {
    throw new Error("Not logged in");
  }
  return { Authorization: `Bearer ${token}` };
}

async function parseJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || data.message || `Request failed (${response.status})`);
  }
  return data;
}

export function getStoredRunId() {
  const value = localStorage.getItem(SELECTED_RUN_STORAGE_KEY);
  return value ? Number(value) : null;
}

export function setStoredRunId(runId) {
  if (runId == null) {
    localStorage.removeItem(SELECTED_RUN_STORAGE_KEY);
    return;
  }
  localStorage.setItem(SELECTED_RUN_STORAGE_KEY, String(runId));
}

export function formatRunDate(createdAt) {
  if (!createdAt) return "Unknown date";
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return createdAt;
  return date.toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function fetchTimetableRuns() {
  const response = await fetch(`${API_BASE}/timetable-runs`, { headers: authHeaders() });
  return parseJson(response);
}

export async function fetchTimetableRun(runId) {
  const response = await fetch(`${API_BASE}/timetable-runs/${runId}`, { headers: authHeaders() });
  return parseJson(response);
}

export async function saveTimetableRun(allTimetables) {
  const response = await fetch(`${API_BASE}/timetable-runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ all_timetables: allTimetables }),
  });
  return parseJson(response);
}

export async function deleteTimetableRun(runId) {
  const response = await fetch(`${API_BASE}/timetable-runs/${runId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return parseJson(response);
}

export function buildRunViews(allTimetables, teachers, rooms) {
  return {
    teacherTTs: buildTeacherTTs(allTimetables || {}, teachers || []),
    labRoomTTs: buildLabRoomTTs(allTimetables || {}),
    classroomTTs: buildClassroomTTs(allTimetables || {}, rooms || []),
  };
}

export function getRunDivisions(allTimetables) {
  const divisions = [];
  Object.entries(allTimetables || {}).forEach(([ybKey, divMap]) => {
    Object.keys(divMap || {}).forEach((division) => {
      divisions.push({ key: `${ybKey}-${division}`, ybKey, division });
    });
  });
  return divisions;
}
