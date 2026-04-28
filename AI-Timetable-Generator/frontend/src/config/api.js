const DEV_API_BASE = "https://ai-timetable-generator-j7qx.onrender.com";
const PROD_API_BASE = "https://ai-timetable-generator-j7qx.onrender.com";

export const API_BASE =
  process.env.REACT_APP_API_BASE_URL ||
  (process.env.NODE_ENV === "development" ? DEV_API_BASE : PROD_API_BASE);

export function apiUrl(path = "") {
  return `${API_BASE}${path}`;
}
