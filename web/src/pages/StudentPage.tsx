import { useEffect, useState } from "react";
import type { Assignment } from "@shared/types";
import { enroll, getAssignment } from "../lib/api";

type Phase = "form" | "calling" | "ringing" | "error";

export default function StudentPage() {
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [error, setError] = useState("");

  useEffect(() => {
    getAssignment().then(setAssignment).catch(() => {});
  }, []);

  const character = assignment?.characterName ?? "Your character";
  const book = assignment?.bookTitle ?? "the book";
  const isMission = assignment?.mode === "mission";
  const isBookQuiz = !isMission && Boolean(assignment?.bookTitle?.trim());
  const role = assignment?.characterRole;
  const heroEmoji = isMission ? "📞" : isBookQuiz ? "🦉" : "🗣️";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const cleanPhone = phone.trim().replace(/[\s-]/g, "");
    if (!name.trim()) return setError("Please enter your name.");
    if (!/^\+[1-9]\d{1,14}$/.test(cleanPhone))
      return setError("Enter your number in international format, e.g. +14155551234.");

    setPhase("calling");
    try {
      const res = await enroll(name.trim(), cleanPhone);
      if (res.ok) setPhase("ringing");
      else {
        setError(res.detail || "Something went wrong placing the call.");
        setPhase("error");
      }
    } catch (err) {
      setError((err as Error).message);
      setPhase("error");
    }
  }

  if (phase === "ringing") {
    return (
      <div className="card hero center">
        <div className="big-emoji">📞✨</div>
        <h1>{character} is calling you now, {name}!</h1>
        <p className="muted">
          {isMission ? (
            <>Answer your phone — {character} is on the line. Speak naturally and make your
            {" "}case; it's a real conversation. When you're done, just say goodbye and hang up.</>
          ) : (
            <>Answer your phone and {isBookQuiz ? <>have a chat about <em>{book}</em></> : <>have a real learning conversation</>}. Speak naturally —
            {" "}it's a real conversation. When you're done, just say goodbye and hang up.</>
          )}
        </p>
        <button className="btn ghost" onClick={() => { setPhase("form"); setName(""); setPhone(""); }}>
          Enroll someone else
        </button>
      </div>
    );
  }

  return (
    <div className="card hero">
      <div className="big-emoji">{heroEmoji}</div>
      <h1>{character} wants to talk to you</h1>
      <p className="lead">
        {isMission ? (
          <>
            {role ? <>{role} </> : null}{character} needs to reach you urgently. Enter your name
            and phone number to get a real phone call — then step into the scene and make your case.
          </>
        ) : (
          <>
            {isBookQuiz ? <>about <strong>{book}</strong></> : <>for a speaking practice call</>}.
            {" "}Pop in your name and phone number, and you'll get a real phone call
            {isBookQuiz ? <> to chat about what you read.</> : <> to practice out loud.</>}
          </>
        )}
      </p>

      <form className="form" onSubmit={onSubmit}>
        <label>
          Your name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Moshe"
            autoComplete="given-name"
          />
        </label>
        <label>
          Your phone number
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 415 555 1234"
            inputMode="tel"
          />
          <span className="hint">International format, starting with “+”.</span>
        </label>

        {error && <div className="error">{error}</div>}

        <button className="btn primary" type="submit" disabled={phase === "calling"}>
          {phase === "calling" ? "Calling…" : `Call me as ${character.split(" ")[0]} →`}
        </button>
      </form>
    </div>
  );
}
