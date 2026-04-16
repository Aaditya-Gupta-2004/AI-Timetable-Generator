export const API_BASE =
  process.env.REACT_APP_API_BASE_URL || "https://ai-timetable-generator-j7qx.onrender.com";

export function apiUrl(path = "") {
  return `${API_BASE}${path}`;
}
