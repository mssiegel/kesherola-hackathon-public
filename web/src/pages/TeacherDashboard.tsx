import { useState } from "react";
import type { Session, SessionStatus } from "@shared/types";
import { assessSession } from "../lib/api";
import { useLiveSessions } from "../lib/useLiveSessions";

const STATUS_LABEL: Record<SessionStatus, string> = {
  calling: "Calling…",
  completed: "Call ended",
  transcribed: "Transcript ready",
  assessed: "Assessed",
  "no-answer": "No answer",
  failed: "Failed",
};

function StatusBadge({ status }: { status: SessionStatus }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status] ?? status}</span>;
}

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

type Turn = { who: "agent" | "student"; text: string };

/** Group transcript lines into speaker turns; lines without a prefix attach to
 *  the current speaker (so a wrapped utterance stays one bubble). */
function toTurns(text: string): Turn[] {
  const turns: Turn[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const agent = /^agent:\s*/i.test(line);
    const user = /^user:\s*/i.test(line);
    const body = line.replace(/^(agent|user):\s*/i, "");
    if (agent || user) {
      turns.push({ who: agent ? "agent" : "student", text: body });
    } else if (turns.length) {
      turns[turns.length - 1].text += " " + body;
    } else {
      turns.push({ who: "agent", text: body });
    }
  }
  return turns;
}

function Transcript({ text }: { text: string }) {
  const turns = toTurns(text);
  return (
    <div className="transcript">
      {turns.map((t, i) => (
        <div key={i} className={`bubble ${t.who}`}>
          <span className="who">{t.who === "agent" ? "🧙 Character" : "🎓 Student"}</span>
          {t.text}
        </div>
      ))}
    </div>
  );
}

function AssessmentCard({ session, onAssess }: { session: Session; onAssess: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const a = session.assessment;

  if (!a) {
    const ready = (session.status === "transcribed" || session.status === "completed") && !!session.transcript;
    return (
      <div className="assess-empty">
        {ready ? (
          <>
            <p className="muted">No AI assessment yet.</p>
            <button
              className="btn primary sm"
              disabled={busy}
              onClick={async () => {
                setErr(""); setBusy(true);
                try { await onAssess(); } catch (e) { setErr((e as Error).message); }
                finally { setBusy(false); }
              }}
            >
              {busy ? "Assessing…" : "Assess with AI"}
            </button>
            {err && <div className="error sm">{err}</div>}
          </>
        ) : (
          <p className="muted">Assessment appears once the call ends and a transcript is ready.</p>
        )}
      </div>
    );
  }

  // Mission mode: show the no-fail outcome, the objective checklist, and a
  // suggested follow-up instead of the quiz-style understood/gaps columns.
  if (a.outcome || a.objectiveResults) {
    return (
      <div className="assessment">
        <div className="score-row">
          <div className={`outcome outcome-${a.outcome ?? "supported"}`}>{a.suggestedGrade}</div>
          <div className="score"><span className="score-num">{a.score}</span><span className="score-den">/100</span></div>
        </div>
        <p className="summary">{a.summary}</p>
        {a.objectiveResults && a.objectiveResults.length > 0 && (
          <ul className="checklist">
            {a.objectiveResults.map((r, i) => (
              <li key={i} className={r.met ? "met" : "unmet"}>
                <span className="check">{r.met ? "✓" : "—"}</span> {r.objective}
              </li>
            ))}
          </ul>
        )}
        <p className="engagement"><strong>Engagement:</strong> {a.engagement}</p>
        {a.followUpQuestion && (
          <p className="followup"><strong>Suggested follow-up:</strong> {a.followUpQuestion}</p>
        )}
      </div>
    );
  }

  return (
    <div className="assessment">
      <div className="score-row">
        <div className="score"><span className="score-num">{a.score}</span><span className="score-den">/100</span></div>
        <div className="grade">{a.suggestedGrade}</div>
      </div>
      <p className="summary">{a.summary}</p>
      <div className="goal-cols">
        <div>
          <h4>Understood</h4>
          <ul className="good">{a.understood.map((g, i) => <li key={i}>{g}</li>)}</ul>
        </div>
        <div>
          <h4>Gaps</h4>
          <ul className="bad">{a.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
        </div>
      </div>
      <p className="engagement"><strong>Engagement:</strong> {a.engagement}</p>
    </div>
  );
}

export default function TeacherDashboard() {
  const { sessions, connected } = useLiveSessions();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = sessions.find((s) => s.callId === selectedId) ?? null;

  return (
    <div className="card">
      <div className="dash-head">
        <h1>Teacher dashboard</h1>
        <span className={`dot ${connected ? "live" : "off"}`}>{connected ? "live" : "offline"}</span>
      </div>

      {sessions.length === 0 ? (
        <p className="muted">No calls yet. When a student enrolls, their call appears here.</p>
      ) : (
        <table className="sessions">
          <thead>
            <tr><th>Student</th><th>Phone</th><th>Status</th><th>Score</th><th>When</th></tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr
                key={s.callId}
                className={s.callId === selectedId ? "row selected" : "row"}
                onClick={() => setSelectedId(s.callId)}
              >
                <td>{s.name}</td>
                <td className="mono">{s.phone}</td>
                <td><StatusBadge status={s.status} /></td>
                <td>{s.assessment ? `${s.assessment.score} (${s.assessment.suggestedGrade})` : "—"}</td>
                <td className="muted">{timeAgo(s.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selected && (
        <div className="detail">
          <div className="detail-head">
            <h2>{selected.name}</h2>
            <StatusBadge status={selected.status} />
            {selected.durationSeconds != null && <span className="muted">· {selected.durationSeconds}s call</span>}
          </div>

          <AssessmentCard session={selected} onAssess={() => assessSession(selected.callId).then(() => {})} />

          <h3>Transcript</h3>
          {selected.transcript ? <Transcript text={selected.transcript} /> : <p className="muted">No transcript captured.</p>}
        </div>
      )}
    </div>
  );
}
