import { Routes, Route, NavLink } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import StudentPage from "./pages/StudentPage";
import TeacherDashboard from "./pages/TeacherDashboard";
import SetupPage from "./pages/SetupPage";

export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/" className="brand">
          <span className="brand-mark" aria-hidden>
            <img src="/brand/kesherola-logo.png" alt="" />
          </span>
          <span>Kesherola</span>
        </NavLink>
        <nav className="nav">
          <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
            Home
          </NavLink>
          <NavLink to="/student" className={({ isActive }) => (isActive ? "active" : "")}>
            Student
          </NavLink>
          <NavLink to="/teacher" className={({ isActive }) => (isActive ? "active" : "")}>
            Teacher
          </NavLink>
          <NavLink to="/setup" className={({ isActive }) => (isActive ? "active" : "")}>
            Setup
          </NavLink>
        </nav>
      </header>
      <main className="main">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/student" element={<StudentPage />} />
          <Route path="/teacher" element={<TeacherDashboard />} />
          <Route path="/setup" element={<SetupPage />} />
        </Routes>
      </main>
    </div>
  );
}
