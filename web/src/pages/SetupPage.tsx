import { useEffect, useState } from "react";
import type { Assignment } from "@shared/types";
import { getAssignment, putAssignment } from "../lib/api";

type SaveState = "idle" | "saving" | "saved" | "error";

export default function SetupPage() {
  const [a, setA] = useState<Assignment | null>(null);
  const [save, setSave] = useState<SaveState>("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    getAssignment().then(setA).catch((e) => setError((e as Error).message));
  }, []);

  if (error && !a) return <div className="card"><p className="error">{error}</p></div>;
  if (!a) return <div className="card"><p className="muted">Loading assignment…</p></div>;

  function set<K extends keyof Assignment>(key: K, value: Assignment[K]) {
    setA((cur) => (cur ? { ...cur, [key]: value } : cur));
    setSave("idle");
  }
  function setGoal(i: number, value: string) {
    set("learningGoals", a!.learningGoals.map((g, idx) => (idx === i ? value : g)));
  }
  function addGoal() { set("learningGoals", [...a!.learningGoals, ""]); }
  function removeGoal(i: number) { set("learningGoals", a!.learningGoals.filter((_, idx) => idx !== i)); }

  async function onSave() {
    setSave("saving"); setError("");
    try {
      const cleaned: Assignment = { ...a!, learningGoals: a!.learningGoals.map((g) => g.trim()).filter(Boolean) };
      const saved = await putAssignment(cleaned);
      setA(saved);
      setSave("saved");
    } catch (e) {
      setError((e as Error).message);
      setSave("error");
    }
  }

  return (
    <div className="card setup">
      <h1>Assignment setup</h1>
      <p className="muted">Edit the character and what the call should cover. Changes apply to the next call — no code needed.</p>

      <div className="grid-2">
        <label>Character name
          <input value={a.characterName} onChange={(e) => set("characterName", e.target.value)} />
        </label>
        <label>Book title
          <input value={a.bookTitle} onChange={(e) => set("bookTitle", e.target.value)} />
        </label>
      </div>

      <label>Persona — how the character speaks and behaves on the call
        <textarea rows={4} value={a.persona} onChange={(e) => set("persona", e.target.value)} />
      </label>

      <label>Book context — facts the character can use to probe the student
        <textarea rows={6} value={a.context} onChange={(e) => set("context", e.target.value)} />
      </label>

      <div className="goals-edit">
        <div className="goals-head">
          <span>Learning goals — what a student should demonstrate</span>
          <button type="button" className="btn ghost xs" onClick={addGoal}>+ Add goal</button>
        </div>
        {a.learningGoals.map((g, i) => (
          <div className="goal-row" key={i}>
            <input value={g} onChange={(e) => setGoal(i, e.target.value)} placeholder="e.g. Explains the main characters’ motivations" />
            <button type="button" className="icon-btn" title="Remove" onClick={() => removeGoal(i)}>✕</button>
          </div>
        ))}
      </div>

      <label className="lang">Language (BCP-47)
        <input value={a.language ?? ""} onChange={(e) => set("language", e.target.value || undefined)} placeholder="en-US" />
      </label>

      {error && <div className="error">{error}</div>}

      <div className="save-row">
        <button className="btn primary" onClick={onSave} disabled={save === "saving"}>
          {save === "saving" ? "Saving…" : "Save assignment"}
        </button>
        {save === "saved" && <span className="saved-note">Saved ✓ — applies to the next call</span>}
      </div>
    </div>
  );
}
