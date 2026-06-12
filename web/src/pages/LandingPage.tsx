import { Link } from "react-router-dom";

const VALUES = [
  {
    icon: "📞",
    title: "Voice-first homework",
    body: "Students complete the assignment by talking through ideas on a real phone call with an AI character or mission guide.",
  },
  {
    icon: "🚀",
    title: "Missions, not worksheets",
    body: "Literature, History, Science, and debate become goal-driven scenarios that feel active, social, and memorable.",
  },
  {
    icon: "✅",
    title: "Teacher-ready evidence",
    body: "Each call returns with a transcript, checklist, score, and suggested follow-up so teachers can review quickly.",
  },
  {
    icon: "⚡",
    title: "Launch in minutes",
    body: "Start from a subject template or write a scenario in plain language. No code, no complicated setup.",
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
        <div className="hero-copy">
          <span className="eyebrow">AI phone-call missions for schoolwork</span>
          <h1>Turn homework into phone-call missions students actually want to finish.</h1>
          <p className="lead">
            Kesherola helps teachers create fun, interactive AI voice assignments for Literature,
            History, Science, and more. Students speak with a character, expert, or mission guide,
            while teachers get clear evidence of understanding.
          </p>
          <div className="landing-cta">
            <Link to="/setup" className="btn primary">Create a mission</Link>
            <Link to="/teacher" className="btn ghost">See how it works</Link>
          </div>
        </div>
        <div className="mission-preview" aria-label="Example Kesherola missions">
          <div className="phone-orbit">
            <span className="call-dot dot-a" />
            <span className="call-dot dot-b" />
            <div className="phone-card">
              <span className="phone-icon"><img src="/brand/kesherola-logo.png" alt="" /></span>
              <strong>Kesherola Mission</strong>
              <span>Incoming AI call</span>
            </div>
          </div>
          <div className="subject-stack">
            <div className="subject-card literature"><span>Literature</span><strong>Talk to Jimmy</strong></div>
            <div className="subject-card history"><span>History</span><strong>Advise Golda</strong></div>
            <div className="subject-card science"><span>Science</span><strong>Save the rocketship</strong></div>
            <div className="subject-card debate"><span>Speak & Debate</span><strong>Use your voice</strong></div>
          </div>
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
