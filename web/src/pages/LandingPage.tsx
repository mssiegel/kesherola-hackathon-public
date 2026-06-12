import { Link } from "react-router-dom";

const VALUES = [
  {
    icon: "🎭",
    title: "Impossible to fake",
    body: "It's a live, spoken roleplay — not a worksheet. No copy-paste, no AI shortcuts. Students have to actually think on their feet.",
  },
  {
    icon: "🪜",
    title: "Every student finishes",
    body: "Adaptive difficulty and a no-fail rescue ladder carry strugglers to the end, while stronger students get harder pushback.",
  },
  {
    icon: "✅",
    title: "Grades itself",
    body: "Each call comes back with a transcript, a per-objective checklist, and an outcome — ready for you to review in seconds.",
  },
  {
    icon: "⚡",
    title: "Ready in minutes",
    body: "Start from a template or write your own scenario in plain language. No code, no setup headaches.",
  },
];

const STEPS = [
  { n: 1, title: "Pick or build a scenario", body: "Choose a ready-made template or describe your own character and goals." },
  { n: 2, title: "Your student gets a call", body: "Kesherola phones them and runs a real, in-character conversation." },
  { n: 3, title: "Review the results", body: "See each student's transcript, objectives, and outcome on your dashboard." },
];

export default function LandingPage() {
  return (
    <div className="landing">
      <section className="card landing-hero">
        <span className="eyebrow">For teachers</span>
        <h1>Your lesson, as a phone call students actually pick up.</h1>
        <p className="lead">
          Kesherola calls each student as a character — a book's hero, a historical leader, a spy
          recruiter — and has a real, adaptive conversation. AI grades the transcript, so you
          instantly see who understood the material and who needs help.
        </p>
        <div className="landing-cta">
          <Link to="/setup" className="btn primary">Set up your first call →</Link>
          <Link to="/teacher" className="btn ghost">See the teacher dashboard</Link>
        </div>
      </section>

      <section className="value-grid">
        {VALUES.map((v) => (
          <div className="value-card" key={v.title}>
            <span className="value-icon" aria-hidden>{v.icon}</span>
            <h3>{v.title}</h3>
            <p>{v.body}</p>
          </div>
        ))}
      </section>

      <section className="card steps-section">
        <h2>How it works</h2>
        <div className="steps">
          {STEPS.map((s) => (
            <div className="step" key={s.n}>
              <span className="step-num">{s.n}</span>
              <div>
                <h4>{s.title}</h4>
                <p>{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-foot">
        <h2>Ready to try it?</h2>
        <p className="muted">Set up a scenario and place your first call in under five minutes.</p>
        <Link to="/setup" className="btn primary">Set up your first call →</Link>
      </section>
    </div>
  );
}
