import { useEffect, useState } from "react";
import type { Assignment, ScenarioMode } from "@shared/types";
import { getTemplates, putAssignment, testCall } from "../lib/api";

type SaveState = "idle" | "saving" | "saved" | "error";
type TestState = "idle" | "calling" | "ringing" | "error";

// The form starts blank — fields fill in only once a template card is clicked.
const EMPTY_ASSIGNMENT: Assignment = {
  mode: "mission",
  title: "",
  characterName: "",
  characterRole: "",
  bookTitle: "",
  persona: "",
  context: "",
  studentMission: "",
  studentRole: "",
  openingLine: "",
  languageLevel: "",
  learningGoals: [],
  language: "",
};

// Preset choices for the two language dropdowns. The level strings double as the
// prompt instruction the agent receives, so they read as guidance.
const LANGUAGE_LEVELS = [
  "Elementary school — very simple words, very short sentences",
  "Middle school — plain words, short sentences",
  "High school — can handle richer vocabulary, clear sentences",
  "Advanced — natural, adult language",
];
// Language (BCP-47) picker is hidden for now — kept here to re-enable later.
// const LANGUAGES: { value: string; label: string }[] = [
//   { value: "", label: "Auto-detect" },
//   { value: "en-US", label: "English (US)" },
//   { value: "en-GB", label: "English (UK)" },
//   { value: "he-IL", label: "Hebrew" },
//   { value: "ar", label: "Arabic" },
//   { value: "es-ES", label: "Spanish" },
//   { value: "fr-FR", label: "French" },
// ];

// Deterministic gradient avatar from the template title, so each card has its
// own stable colour without hand-assigning one.
function avatarGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return `radial-gradient(circle at 30% 30%, hsl(${h} 75% 70%), hsl(${(h + 40) % 360} 70% 45%))`;
}

export default function SetupPage() {
  const [a, setA] = useState<Assignment>(EMPTY_ASSIGNMENT);
  const [templates, setTemplates] = useState<Assignment[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>("idle");
  const [error, setError] = useState("");
  const [testName, setTestName] = useState("");
  const [testPhone, setTestPhone] = useState("");
  const [test, setTest] = useState<TestState>("idle");
  const [testError, setTestError] = useState("");

  useEffect(() => {
    getTemplates().then(setTemplates).catch(() => { /* templates are optional */ });
  }, []);

  const mode: ScenarioMode = a.mode ?? "quiz";
  const visibleTemplates = templates.filter((t) => (t.mode ?? "quiz") === mode);

  function set<K extends keyof Assignment>(key: K, value: Assignment[K]) {
    setA((cur) => (cur ? { ...cur, [key]: value } : cur));
    setSave("idle");
  }
  function setGoal(i: number, value: string) {
    set("learningGoals", a!.learningGoals.map((g, idx) => (idx === i ? value : g)));
  }
  function addGoal() { set("learningGoals", [...a!.learningGoals, ""]); }
  function removeGoal(i: number) { set("learningGoals", a!.learningGoals.filter((_, idx) => idx !== i)); }

  function loadTemplate(title: string) {
    const t = templates.find((x) => x.title === title);
    if (t) { setA({ ...t }); setSelectedTemplate(title); setSave("idle"); }
  }

  // Every editable field (blanks clear opposite-mode fields on the server).
  function currentPayload(): Assignment {
    return {
      mode,
      title: a.title ?? "",
      characterName: a.characterName,
      characterRole: a.characterRole ?? "",
      bookTitle: a.bookTitle ?? "",
      persona: a.persona,
      context: a.context,
      studentMission: a.studentMission ?? "",
      studentRole: a.studentRole ?? "",
      openingLine: a.openingLine ?? "",
      languageLevel: a.languageLevel ?? "",
      learningGoals: a.learningGoals.map((g) => g.trim()).filter(Boolean),
      outcomeLabels: a.outcomeLabels, // travels with the template; preserved on save
      notes: a.notes ?? "",
      voiceGender: a.voiceGender,
      language: a.language ?? "",
    };
  }

  async function onSave() {
    setSave("saving"); setError("");
    try {
      const saved = await putAssignment(currentPayload());
      setA(saved);
      setSave("saved");
    } catch (e) {
      setError((e as Error).message);
      setSave("error");
    }
  }

  async function onTest() {
    setTestError(""); setTest("calling");
    const phone = testPhone.trim().replace(/[\s-]/g, "");
    if (!testName.trim()) { setTestError("Enter your name."); setTest("error"); return; }
    if (!/^\+[1-9]\d{1,14}$/.test(phone)) {
      setTestError("Enter your number in international format, e.g. +14155551234."); setTest("error"); return;
    }
    try {
      const res = await testCall(currentPayload(), testName.trim(), phone);
      if (res.ok) { setTest("ringing"); }
      else { setTestError(res.detail || "Could not place the test call."); setTest("error"); }
    } catch (e) {
      setTestError((e as Error).message); setTest("error");
    }
  }

  const isMission = mode === "mission";
  const goalsLabel = isMission
    ? "Success checklist — what a student should show on the call"
    : "Learning goals — what a student should demonstrate";
  const goalsHint = isMission
    ? "One thing a successful student should say or do"
    : "One thing the student should be able to explain";

  return (
    <div className="card setup">
      <h1>Scenario setup</h1>
      <p className="muted">Choose a scenario type and fill in a few fields. Changes apply to the next call — no code needed.</p>

      <label>Scenario type
        <select
          value={mode}
          onChange={(e) => {
            // Switching type starts fresh — clear the form so old text doesn't carry over.
            setA({ ...EMPTY_ASSIGNMENT, mode: e.target.value as ScenarioMode });
            setSelectedTemplate(null);
            setSave("idle");
          }}
        >
          <option value="quiz">Quiz — a character checks understanding</option>
          <option value="mission">Mission — role play the student must accomplish</option>
        </select>
      </label>

      {visibleTemplates.length > 0 && (
        <div className="template-picker">
          <span className="tpl-head">Start from a template</span>
          <div className="template-cards">
            {visibleTemplates.map((t) => (
              <button
                type="button"
                key={t.title}
                className={`template-card${selectedTemplate === t.title ? " selected" : ""}`}
                onClick={() => loadTemplate(t.title ?? "")}
              >
                <span className="tpl-avatar" style={{ background: avatarGradient(t.title ?? t.characterName) }} aria-hidden />
                <span className="tpl-text">
                  <span className="tpl-name">{t.characterName}</span>
                  <span className="tpl-desc">{t.tagline ?? t.title}</span>
                </span>
                {selectedTemplate === t.title && <span className="tpl-check" aria-hidden>✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      <label>Assignment name
        <input value={a.title ?? ""} onChange={(e) => set("title", e.target.value)} placeholder={isMission ? "Give the mission a short, dramatic title" : "Give the assignment a short title"} />
      </label>

      <div className="grid-2">
        <label>Character name
          <input value={a.characterName} onChange={(e) => set("characterName", e.target.value)} placeholder="Who the student will talk to" />
        </label>
        {isMission ? (
          <label>Character role
            <input value={a.characterRole ?? ""} onChange={(e) => set("characterRole", e.target.value)} placeholder="Their title or role in the scene" />
          </label>
        ) : (
          <label>Book title
            <input value={a.bookTitle ?? ""} onChange={(e) => set("bookTitle", e.target.value)} placeholder="The book or text this covers" />
          </label>
        )}
      </div>

      <label>Persona — how the character speaks and behaves on the call
        <textarea rows={4} value={a.persona} onChange={(e) => set("persona", e.target.value)} placeholder="Describe their voice, attitude, and what drives them — enough for the AI to stay in character." />
      </label>

      <div className="voice-field">
        <span className="voice-label">Voice</span>
        <label className="radio-row">
          <input type="radio" name="voiceGender" checked={a.voiceGender === "female"} onChange={() => set("voiceGender", "female")} />
          Female
        </label>
        <label className="radio-row">
          <input type="radio" name="voiceGender" checked={a.voiceGender === "male"} onChange={() => set("voiceGender", "male")} />
          Male
        </label>
      </div>

      <label>{isMission ? "Setting — the situation and what the character knows" : "Book context — facts the character can use to probe the student"}
        <textarea rows={6} value={a.context} onChange={(e) => set("context", e.target.value)} placeholder={isMission ? "Lay out the situation and the key facts the character knows — enough for them to react, push back, and guide the student." : "List the key facts from the text the character can use to check the student really understood it."} />
      </label>

      {isMission && (
        <>
          <label>Student role — who the student plays in the scene
            <input value={a.studentRole ?? ""} onChange={(e) => set("studentRole", e.target.value)} placeholder="Who the student is, and why they're in this conversation" />
          </label>
          <label>Opening line — the character's scripted first line
            <textarea rows={2} value={a.openingLine ?? ""} onChange={(e) => set("openingLine", e.target.value)} placeholder="The character's first words — set the scene and pull the student in." />
          </label>
          <label>Student mission — what the student must achieve on the call
            <textarea rows={2} value={a.studentMission ?? ""} onChange={(e) => set("studentMission", e.target.value)} placeholder="What the student needs to accomplish to succeed on the call." />
          </label>
        </>
      )}

      <div className="goals-edit">
        <div className="goals-head">
          <span>{goalsLabel}</span>
          <button type="button" className="btn ghost xs" onClick={addGoal}>+ Add</button>
        </div>
        {a.learningGoals.map((g, i) => (
          <div className="goal-row" key={i}>
            <input value={g} onChange={(e) => setGoal(i, e.target.value)} placeholder={goalsHint} />
            <button type="button" className="icon-btn" title="Remove" onClick={() => removeGoal(i)}>✕</button>
          </div>
        ))}
      </div>

      {isMission && (
        <label>Language level — how simple the character's words should be
          <select value={a.languageLevel ?? ""} onChange={(e) => set("languageLevel", e.target.value || undefined)}>
            <option value="">Choose a level…</option>
            {a.languageLevel && !LANGUAGE_LEVELS.includes(a.languageLevel) && (
              <option value={a.languageLevel}>{a.languageLevel}</option>
            )}
            {LANGUAGE_LEVELS.map((lvl) => <option key={lvl} value={lvl}>{lvl}</option>)}
          </select>
        </label>
      )}

      {/* Language (BCP-47) picker hidden for now — re-enable when needed.
      <label className="lang">Language
        <select value={a.language ?? ""} onChange={(e) => set("language", e.target.value || undefined)}>
          {a.language && !LANGUAGES.some((l) => l.value === a.language) && (
            <option value={a.language}>{a.language}</option>
          )}
          {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
      </label>
      */}

      <div className="test-box">
        <h3>Test it before saving</h3>
        <p className="muted">Call your own phone to hear the agent with the settings above. Nothing is saved.</p>
        <div className="test-row">
          <input value={testName} onChange={(e) => { setTestName(e.target.value); setTest("idle"); }} placeholder="Your name" autoComplete="given-name" />
          <input value={testPhone} onChange={(e) => { setTestPhone(e.target.value); setTest("idle"); }} placeholder="+1 415 555 1234" inputMode="tel" />
          <button type="button" className="btn primary sm" onClick={onTest} disabled={test === "calling"}>
            {test === "calling" ? "Calling…" : "Call me to test"}
          </button>
        </div>
        {test === "ringing" && <p className="saved-note">Calling {testName.trim()} now — pick up your phone ☎️</p>}
        {test === "error" && <div className="error sm">{testError}</div>}
      </div>

      {error && <div className="error">{error}</div>}

      <div className="save-row">
        <button className="btn primary" onClick={onSave} disabled={save === "saving"}>
          {save === "saving" ? "Saving…" : "Save scenario"}
        </button>
        {save === "saved" && <span className="saved-note">Saved ✓ — applies to the next call</span>}
      </div>
    </div>
  );
}
