import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import App                from "./App";
import Login              from "./components/Login";
import Signup             from "./components/signup";
import Dashboard          from "./components/dashboard";
import Generatetimetable  from "./components/GeneratetimeTable";
import Preview            from "./components/Preview";
import Settings           from "./components/Settings";

function PrivateRoute({ children }) {
  return localStorage.getItem("token") ? children : <Navigate to="/login" replace />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <Routes>
      {/* Landing page */}
      <Route path="/"       element={<App />} />

      {/* Auth */}
      <Route path="/login"  element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      {/* Protected */}
      <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
      <Route path="/generate"  element={<PrivateRoute><Generatetimetable /></PrivateRoute>} />
      <Route path="/preview"   element={<PrivateRoute><Preview /></PrivateRoute>} />
      <Route path="/settings"  element={<PrivateRoute><Settings /></PrivateRoute>} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </BrowserRouter>
);