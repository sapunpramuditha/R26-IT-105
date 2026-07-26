"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getMyAssessment, saveAssessmentAnswer, startAssessment, submitAssessment } from "@/lib/api";
import { AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2, Clock3, FileCheck2, FileText, Loader2, LockKeyhole, Save, Send, ShieldCheck } from "lucide-react";

type KeyEventRecord = { type: "keydown" | "keyup"; code: string; t: number; repeat?: boolean };
type AnswerState = { text: string; events: KeyEventRecord[]; startedAt: number; pasteCount: number; pastedCharacters: number; focusLost: number; deletions: number };

export default function WrittenAssessmentPage() {
  const { applicationId } = useParams<{ applicationId: string }>();
  const router = useRouter();
  const editorRef = useRef<HTMLElement>(null);
  const [attempt, setAttempt] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const answersRef = useRef(answers);
  const [active, setActive] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { answersRef.current = answers; }, [answers]);

  useEffect(() => {
    (async () => {
      try {
        const found = (await getMyAssessment(applicationId)).data.data;
        const started = found.status === "Assigned" ? (await startAssessment(found._id)).data.data : found;
        if (["Submitted", "Analyzed"].includes(started.status)) { setCompleted(true); setAttempt(started); return; }
        const initial: Record<string, AnswerState> = {};
        for (const q of started.paper_snapshot.questions) {
          const saved = started.answers?.find((a: any) => a.question_id === q._id);
          initial[q._id] = { text: saved?.answer_text || "", events: [], startedAt: Date.now(), pasteCount: saved?.integrity_events?.paste_count || 0, pastedCharacters: saved?.integrity_events?.pasted_character_count || 0, focusLost: saved?.integrity_events?.focus_lost_count || 0, deletions: saved?.integrity_events?.deletion_count || 0 };
        }
        setAnswers(initial); setAttempt(started);
        setRemaining(Math.max(0, Math.floor((new Date(started.expires_at).getTime() - Date.now()) / 1000)));
      } catch (e: any) { setError(e.response?.data?.error || "Unable to load this assessment."); }
      finally { setLoading(false); }
    })();
  }, [applicationId]);

  const submit = useCallback(async (force = false) => {
    if (!attempt || submitting) return;
    const unanswered = attempt.paper_snapshot.questions.filter((q: any) => !answersRef.current[q._id]?.text.trim()).length;
    if (!force && !window.confirm(unanswered ? `${unanswered} question(s) are unanswered. Submit anyway?` : "Submit your final answers? You cannot edit them afterward.")) return;
    setSubmitting(true); setError("");
    try {
      await submitAssessment(attempt._id, { answers: Object.entries(answersRef.current).map(([question_id, a]) => ({ question_id, answer_text: a.text, events: a.events, active_duration_ms: Date.now() - a.startedAt, integrity_events: { paste_count: a.pasteCount, pasted_character_count: a.pastedCharacters, focus_lost_count: a.focusLost, deletion_count: a.deletions } })) });
      setCompleted(true); window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e: any) { setError(e.response?.data?.error || "Submission failed. Your saved answers are still available."); }
    finally { setSubmitting(false); }
  }, [attempt, submitting]);

  useEffect(() => {
    if (!attempt || completed) return;
    const timer = window.setInterval(() => setRemaining((value) => { if (value <= 1) { window.clearInterval(timer); void submit(true); return 0; } return value - 1; }), 1000);
    return () => window.clearInterval(timer);
  }, [attempt, completed, submit]);

  useEffect(() => {
    if (!attempt || completed) return;
    const autosave = window.setInterval(async () => {
      setSaving(true);
      try {
        await Promise.all(Object.entries(answersRef.current).map(([id, a]) => saveAssessmentAnswer(attempt._id, id, { answer_text: a.text, active_duration_ms: Date.now() - a.startedAt, integrity_events: { paste_count: a.pasteCount, pasted_character_count: a.pastedCharacters, focus_lost_count: a.focusLost, deletion_count: a.deletions } })));
        setLastSaved(new Date());
      } catch { setError("Autosave could not connect. Keep this page open while we retry."); }
      finally { setSaving(false); }
    }, 10000);
    return () => window.clearInterval(autosave);
  }, [attempt, completed]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && attempt) {
        const q = attempt.paper_snapshot.questions[active];
        if (q) setAnswers((old) => ({ ...old, [q._id]: { ...old[q._id], focusLost: old[q._id].focusLost + 1 } }));
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [attempt, active]);

  const goTo = (index: number) => {
    setActive(index);
    requestAnimationFrame(() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  if (loading) return <ScreenState icon={<Loader2 className="h-9 w-9 animate-spin" />} title="Preparing your assessment" detail="Loading the paper and restoring saved answers…" />;
  if (error && !attempt) return <ScreenState icon={<AlertCircle className="h-9 w-9" />} title="Assessment unavailable" detail={error} danger />;
  if (completed) return <ScreenState icon={<CheckCircle2 className="h-10 w-10" />} title="Assessment submitted" detail="Your responses are secure and ready for the hiring team to review." action={() => router.push("/profile")} />;

  const questions = attempt.paper_snapshot.questions;
  const question = questions[active];
  const answer = answers[question._id];
  const wordCount = answer?.text.trim().split(/\s+/).filter(Boolean).length || 0;
  const answeredCount = questions.filter((q: any) => answers[q._id]?.text.trim()).length;
  const progress = Math.round((answeredCount / questions.length) * 100);
  const mins = Math.floor(remaining / 60), secs = remaining % 60;
  const timeDanger = remaining < 300;
  const record = (type: "keydown" | "keyup", e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(e.key)) return;
    setAnswers((old) => ({ ...old, [question._id]: { ...old[question._id], events: [...old[question._id].events, { type, code: e.code, t: performance.timeOrigin + performance.now(), repeat: e.repeat }], deletions: old[question._id].deletions + (type === "keydown" && ["Backspace", "Delete"].includes(e.key) ? 1 : 0) } }));
  };

  return <div className="min-h-screen bg-[#f5f7f7] pb-16 pt-24 text-slate-900">
    <div className="sticky top-16 z-30 border-y border-slate-200 bg-white/95 shadow-sm backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{attempt.paper_snapshot.title}</p><p className="text-xs text-slate-500">{answeredCount} of {questions.length} answered</p></div>
        <div className={`flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2 font-mono text-sm font-bold ${timeDanger ? "border-rose-200 bg-rose-50 text-rose-700" : "border-slate-200 bg-slate-50 text-slate-700"}`}><Clock3 className="h-4 w-4" />{mins}:{secs.toString().padStart(2, "0")}</div>
      </div>
      <div className="h-1 bg-slate-100"><div className="h-full bg-[#008558] transition-all duration-500" style={{ width: `${progress}%` }} /></div>
    </div>

    <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
      <div className="mb-7 flex flex-col justify-between gap-5 lg:flex-row lg:items-end"><div><div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-emerald-800"><FileCheck2 className="h-3.5 w-3.5" />Written assessment</div><h1 className="max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">Focus on clear thinking, not perfect wording.</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{attempt.paper_snapshot.instructions}</p></div><div className="flex items-center gap-2 text-xs text-slate-500"><LockKeyhole className="h-4 w-4 text-[#008558]" />Encrypted autosave is active</div></div>

      <div className="mb-7 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950 shadow-sm"><div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-700"/><div><p className="font-semibold">Fair-use monitoring</p><p className="mt-1 leading-6 text-sky-800">Typing rhythm, paste actions, and page changes are recorded as review signals only. They never make an automatic hiring decision.</p></div></div></div>

      <div className="grid items-start gap-7 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-36"><div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.06)]"><div className="border-b border-slate-100 p-5"><div className="flex items-center justify-between"><span className="text-sm font-semibold">Paper progress</span><span className="text-sm font-bold text-[#008558]">{progress}%</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#008558] transition-all duration-500" style={{width:`${progress}%`}}/></div></div><nav className="max-h-[55vh] space-y-1 overflow-y-auto p-2" aria-label="Assessment questions">{questions.map((q:any,i:number)=>{const done=Boolean(answers[q._id]?.text.trim());return <button key={q._id} onClick={()=>goTo(i)} className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-all ${i===active?"bg-slate-900 text-white shadow-md":"text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${i===active?"bg-white/15":done?"bg-emerald-100 text-emerald-700":"bg-slate-100 text-slate-500"}`}>{done?<Check className="h-4 w-4"/>:i+1}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">Question {i+1}</span><span className={`block text-xs ${i===active?"text-slate-300":"text-slate-400"}`}>{q.marks} marks</span></span></button>})}</nav></div></aside>

        <section ref={editorRef} className="scroll-mt-36 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="border-b border-slate-100 px-5 py-5 sm:px-8"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-[#008558]"><FileText className="h-4 w-4"/>Question {active+1} of {questions.length}</div><div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><span>{question.marks} marks</span><span className="h-1 w-1 rounded-full bg-slate-300"/><span>{question.minimum_words}–{question.maximum_words} words</span></div></div><h2 className="mt-5 text-xl font-semibold leading-8 text-slate-900 sm:text-2xl">{question.question_text}</h2></div>
          <div className="p-5 sm:p-8"><label htmlFor="assessment-answer" className="mb-2 block text-sm font-semibold text-slate-700">Your response</label><textarea id="assessment-answer" value={answer?.text || ""} onChange={(e)=>setAnswers((old)=>({...old,[question._id]:{...old[question._id],text:e.target.value}}))} onKeyDown={(e)=>record("keydown",e)} onKeyUp={(e)=>record("keyup",e)} onPaste={(e)=>{const n=e.clipboardData.getData("text").length;setAnswers((old)=>({...old,[question._id]:{...old[question._id],pasteCount:old[question._id].pasteCount+1,pastedCharacters:old[question._id].pastedCharacters+n}}))}} className="min-h-[360px] w-full resize-y rounded-xl border border-slate-300 bg-slate-50/50 p-5 text-[15px] leading-7 text-slate-800 outline-none transition focus:border-[#008558] focus:bg-white focus:ring-4 focus:ring-emerald-100" placeholder="Build your answer here. Explain your reasoning and include examples where useful…" maxLength={20000}/><div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs"><span className={wordCount>question.maximum_words?"font-semibold text-rose-600":wordCount>=question.minimum_words?"font-semibold text-emerald-700":"text-slate-500"}>{wordCount} words {wordCount<question.minimum_words&&`· ${question.minimum_words-wordCount} to recommended minimum`}</span><span className="flex items-center gap-1.5 text-slate-500">{saving?<Loader2 className="h-3.5 w-3.5 animate-spin"/>:<Save className="h-3.5 w-3.5"/>}{saving?"Saving…":lastSaved?`Saved ${lastSaved.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}`:"Autosaves every 10 seconds"}</span></div>
          {error&&<div className="mt-4 flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"><AlertCircle className="h-5 w-5 shrink-0"/>{error}</div>}</div>
          <div className="flex flex-col-reverse justify-between gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:flex-row sm:px-8"><button onClick={()=>goTo(Math.max(0,active-1))} disabled={active===0} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"><ArrowLeft className="h-4 w-4"/>Previous</button><div className="flex flex-col gap-3 sm:flex-row"><button onClick={()=>goTo(Math.min(questions.length-1,active+1))} disabled={active===questions.length-1} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 disabled:opacity-40">Next question<ArrowRight className="h-4 w-4"/></button><button onClick={()=>void submit(false)} disabled={submitting} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#008558] px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-900/15 transition hover:-translate-y-0.5 hover:bg-[#006f4a] disabled:opacity-60">{submitting?<Loader2 className="h-4 w-4 animate-spin"/>:<Send className="h-4 w-4"/>}Submit paper</button></div></div>
        </section>
      </div>
    </div>
  </div>;
}

function ScreenState({icon,title,detail,danger=false,action}:{icon:React.ReactNode;title:string;detail:string;danger?:boolean;action?:()=>void}){
  return <div className="flex min-h-[82vh] items-center justify-center bg-[#f5f7f7] px-5 pt-24"><div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-[0_24px_70px_rgba(15,23,42,0.1)]"><div className={`mx-auto flex h-20 w-20 items-center justify-center rounded-2xl ${danger?"bg-rose-50 text-rose-600":"bg-emerald-50 text-[#008558]"}`}>{icon}</div><h1 className="mt-6 text-3xl font-bold tracking-tight">{title}</h1><p className="mt-3 leading-7 text-slate-500">{detail}</p>{action&&<button onClick={action} className="mt-8 rounded-xl bg-[#008558] px-6 py-3 font-semibold text-white shadow-lg shadow-emerald-900/15 transition hover:bg-[#006f4a]">Return to profile</button>}</div></div>;
}
