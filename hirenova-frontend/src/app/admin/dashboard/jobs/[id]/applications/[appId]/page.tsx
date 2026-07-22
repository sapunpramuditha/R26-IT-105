"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getApplicationById } from "@/lib/api";
import { Loader2, ArrowLeft, Star, FileText, CheckCircle, Headphones, Mail, User, Mic, Code, Target, AlertCircle, Briefcase, ChevronRight, TrendingUp, TrendingDown, Check, Calculator, ChevronDown, ShieldAlert, Award, GitFork, Sparkles, XCircle, Video, Eye, Download, Clock, BarChart3, Activity, ShieldCheck, Flag, Play, FileJson, Info } from "lucide-react";
import Link from "next/link";
import Swal from "sweetalert2";

// The 4 emotions the audio model actually outputs, with display colors.
const EMOTIONS = [
  { key: "confident_pct", label: "Confidence",  color: "#10b981" },
  { key: "hesitant_pct",  label: "Hesitation",  color: "#f59e0b" },
  { key: "anxiety_pct",   label: "Anxiety",     color: "#f43f5e" },
  { key: "nervous_pct",   label: "Nervousness", color: "#a78bfa" },
];

// Radial (≈270°) gauge, styled for the dark "speech metrics" panel.
function EmotionGauge({ value, label, color }: { value: number; label: string; color: string }) {
  const r = 42;
  const C = 2 * Math.PI * r;
  const track = 0.75 * C; // 270° visible arc
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  const filled = (pct / 100) * track;
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-24 h-24">
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <circle cx="50" cy="50" r={r} fill="none" strokeWidth="9" strokeLinecap="round"
            className="stroke-slate-700/50" strokeDasharray={`${track} ${C}`} transform="rotate(135 50 50)" />
          <circle cx="50" cy="50" r={r} fill="none" strokeWidth="9" strokeLinecap="round"
            stroke={color} strokeDasharray={`${filled} ${C}`} transform="rotate(135 50 50)" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold text-white">{Math.round(pct)}%</span>
        </div>
      </div>
      <span className="text-[11px] font-semibold uppercase tracking-wide mt-1" style={{ color }}>{label}</span>
    </div>
  );
}

// Average the 4 emotion percentages across all answered questions that carry metrics.
function averageEmotions(answers: any[]) {
  const withMetrics = (answers || []).filter((a) => a?.audio_analysis);
  if (!withMetrics.length) return null;
  const avg: Record<string, number> = {};
  EMOTIONS.forEach((e) => {
    avg[e.key] = withMetrics.reduce((s, a) => s + (Number(a.audio_analysis[e.key]) || 0), 0) / withMetrics.length;
  });
  const dominant = EMOTIONS.reduce((best, e) => (avg[e.key] > avg[best.key] ? e : best), EMOTIONS[0]);
  return { avg, count: withMetrics.length, dominant };
}

export default function ApplicationDetailsPage() {
  const { id, appId } = useParams();
  const [application, setApplication] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [activeTab, setActiveTab] = useState<"cv" | "voice" | "behavior">("cv");
  const [selectedVideoAnswerIndex, setSelectedVideoAnswerIndex] = useState<number>(0);

  const downloadJSON = (data: any, filename = "behavioural_log.json") => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    const fetchApp = async () => {
      try {
        const res = await getApplicationById(appId as string);
        setApplication(res.data.data);
      } catch (error) {
        console.error(error);
        Swal.fire("Error", "Failed to fetch application details", "error");
      } finally {
        setLoading(false);
      }
    };
    fetchApp();
  }, [appId]);

  if (loading) return <div className="flex justify-center mt-20"><Loader2 className="w-8 h-8 animate-spin text-[#008558]" /></div>;
  if (!application) return <div className="text-center mt-20 text-slate-500">Application not found.</div>;

  const { resume_data, ai_analysis, interview_answers } = application;
  const baseUrl = "http://localhost:5001"; // Backend URL for files

  // --- Derived scoring helpers (all data already present in ai_analysis) ---
  const signals = ai_analysis?.signal_scores;
  const modifiers = ai_analysis?.modifiers ?? [];
  const modifierTotal = modifiers.reduce((sum: number, m: any) => sum + (Number(m.value) || 0), 0);
  const githubBreakdown = signals?.github?.breakdown ?? {};
  const githubAnalyzed = ai_analysis?.pipeline_meta?.github_analyzed === true;
  const githubFake = githubAnalyzed && githubBreakdown?.suspected_fake === true;
  const consistency = ai_analysis?.evidence?.cross_platform_consistency;

  const scoreRows = [
    { key: "resume", label: "Resume Score", bar: "bg-[#008558]" },
    { key: "github", label: "GitHub Score", bar: "bg-slate-800" },
    { key: "graph",  label: "Graph Score",  bar: "bg-purple-500" },
    { key: "consistency", label: "CV–GitHub Consistency", bar: "bg-indigo-500" },
  ];

  const emotionSummary = averageEmotions(interview_answers);
  const answerCount = interview_answers?.length || 0;

  const tabs = [
    { key: "cv" as const,       label: "CV & Evaluation",        icon: FileText },
    { key: "voice" as const,    label: "Voice & Speech Emotion", icon: Headphones, count: answerCount },
    { key: "behavior" as const, label: "Facial & Gaze Behaviour", icon: Video,     count: (interview_answers || []).filter((a: any) => a?.video_analysis).length },
  ];

  return (
    <div className="max-w-6xl mx-auto pb-12">
      <Link href={`/admin/dashboard/jobs/${id}/applications`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-[#008558] mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Candidates
      </Link>

      {/* Header Section */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 mb-6 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-outfit font-semibold text-slate-800 mb-2">{application.candidate_name}</h1>
          <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
            <span className="flex items-center gap-1"><Mail className="w-4 h-4" /> {application.user_id?.email || 'N/A'}</span>
            <span className="flex items-center gap-1"><User className="w-4 h-4" /> {application.github_username || 'N/A'}</span>
            <span>Applied: {new Date(application.appliedAt).toLocaleDateString()}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {application.written_assessment_id && (
            <Link href={`/admin/dashboard/jobs/${id}/applications/${appId}/assessment`} className="px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 text-white">
              Written assessment
            </Link>
          )}
          {application.selection_status === 'Selected' && (
            <span className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-amber-100 text-amber-700">
              Top 10 · Rank #{application.rank}
            </span>
          )}
          {ai_analysis?.seniority && (
            <span className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-slate-100 text-slate-700 capitalize">
              {ai_analysis.seniority}
            </span>
          )}
          <span className={`px-4 py-1.5 rounded-lg text-sm font-semibold ${application.status === 'Completed' ? 'bg-emerald-100 text-[#008558]' : 'bg-blue-100 text-blue-700'}`}>
            {application.status}
          </span>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex gap-1 border-b border-slate-200 mb-8">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                active ? "border-[#008558] text-[#008558]" : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon className="w-4 h-4" /> {tab.label}
              {"count" in tab && tab.count! > 0 && (
                <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${active ? "bg-emerald-100 text-[#008558]" : "bg-slate-100 text-slate-500"}`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ══════════════════ TAB 1: CV & EVALUATION ══════════════════ */}
      {activeTab === "cv" && (
        <>
          {/* Fraud / authenticity warning — surfaced from GitHub quality flags */}
          {githubFake && (
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 mb-8 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-rose-700 text-sm">Suspected inflated GitHub activity</p>
                <p className="text-sm text-rose-600/90 mt-0.5">
                  The GitHub analyzer flagged this profile as potentially inflated (e.g. mass-created repos or low real contribution). A <b>−1.5</b> penalty was applied to the final score. Review the candidate's repositories manually before deciding.
                </p>
              </div>
            </div>
          )}

          <div className="grid lg:grid-cols-3 gap-8 mb-8">

            {/* Left Column: AI Analysis */}
            <div className="lg:col-span-1">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 h-full">
                <div className="flex items-center gap-2 mb-4 text-[#008558]">
                  <Star className="w-5 h-5 fill-current" />
                  <h4 className="font-semibold text-sm uppercase tracking-wide">AI Evaluation</h4>
                </div>

                {ai_analysis?.final_score !== undefined && (
                  <div className="mb-6 flex items-center justify-between bg-white border border-slate-200 p-4 rounded-lg shadow-sm">
                    <div>
                      <p className="text-xs text-slate-500 font-semibold uppercase mb-1">Final Score</p>
                      <p className="text-3xl font-bold text-slate-800 font-outfit">{ai_analysis.final_score.toFixed(1)}<span className="text-base text-slate-400 font-medium">/10</span></p>
                    </div>
                    {ai_analysis.grade && (
                      <div className="text-right">
                        <p className="text-xs text-slate-500 font-semibold uppercase mb-1">Grade</p>
                        <p className="text-2xl font-bold text-[#008558] font-outfit">{ai_analysis.grade}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Show How the Score Was Calculated ── */}
                {signals && (
                  <div className="mb-6">
                    <button
                      onClick={() => setShowBreakdown((v) => !v)}
                      className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg border border-slate-200 bg-white hover:border-[#008558]/40 hover:bg-emerald-50/40 transition-colors text-sm font-semibold text-slate-700"
                    >
                      <span className="flex items-center gap-2">
                        <Calculator className="w-4 h-4 text-[#008558]" /> Show How the Score Was Calculated
                      </span>
                      <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showBreakdown ? "rotate-180" : ""}`} />
                    </button>

                    {showBreakdown && (
                      <div className="mt-3 bg-white border border-slate-200 rounded-lg p-4 space-y-4">
                        {scoreRows.map((row) => {
                          const s = signals[row.key];
                          if (!s) return null;
                          const notCounted = s.weight === 0;
                          return (
                            <div key={row.key}>
                              <div className="flex items-center justify-between text-sm mb-1">
                                <span className="text-slate-600 font-medium">{row.label}</span>
                                <span className="text-slate-500 tabular-nums">
                                  {s.score == null ? 'N/A' : Number(s.score).toFixed(2)} <span className="text-slate-300">×</span> {Number(s.weight).toFixed(2)} <span className="text-slate-300">=</span>{" "}
                                  <span className="font-bold text-slate-800">{Number(s.contribution).toFixed(2)}</span>
                                </span>
                              </div>
                              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                                <div className={`h-full ${row.bar} rounded-full`} style={{ width: `${Math.min(100, Number(s.score) * 10)}%` }} />
                              </div>
                              {notCounted && (
                                <p className="text-[11px] text-amber-600 mt-1">Not counted — weight redistributed (signal missing/neutral).</p>
                              )}
                            </div>
                          );
                        })}

                        {/* Bonuses / penalties */}
                        <div className="flex items-center justify-between text-sm border-t border-slate-100 pt-3">
                          <span className="text-slate-600 font-medium">Bonuses / Penalties</span>
                          <span className={`font-bold tabular-nums ${modifierTotal >= 0 ? "text-[#008558]" : "text-rose-600"}`}>
                            {modifierTotal >= 0 ? "+" : ""}{modifierTotal.toFixed(2)}
                          </span>
                        </div>

                        {/* Final */}
                        <div className="flex items-center justify-between border-t border-slate-200 pt-3">
                          <span className="text-slate-800 font-bold">Final Score</span>
                          <span className="text-slate-800 font-bold tabular-nums">
                            {Number(ai_analysis.final_score).toFixed(2)} / 10
                            {ai_analysis.grade && <span className="text-[#008558]"> · {ai_analysis.grade}</span>}
                          </span>
                        </div>

                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          Weighted sum of each signal's contribution, adjusted by bonuses and penalties, then clamped to 0–10.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {consistency && (
                  <div className="mb-6 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
                    <p className="text-xs font-semibold uppercase text-indigo-700">Cross-platform consistency</p>
                    {consistency.available ? (
                      <>
                        <div className="flex items-end justify-between mt-2">
                          <p className="text-3xl font-bold text-indigo-900">{consistency.percentage}%</p>
                          <p className="text-xs text-indigo-700">{consistency.matched_count}/{consistency.total_cv_skills} CV skills verified</p>
                        </div>
                        {consistency.matched_skills?.length > 0 && (
                          <div className="mt-3">
                            <p className="text-[11px] font-semibold uppercase text-emerald-700">Supported by GitHub</p>
                            <p className="text-xs text-slate-700 mt-1">{consistency.matched_skills.join(', ')}</p>
                          </div>
                        )}
                        {consistency.missing_skills?.length > 0 && (
                          <div className="mt-3">
                            <p className="text-[11px] font-semibold uppercase text-amber-700">Not found in public repositories</p>
                            <p className="text-xs text-slate-700 mt-1">{consistency.missing_skills.join(', ')}</p>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-indigo-800 mt-2">{consistency.reason}</p>
                    )}
                  </div>
                )}

                {ai_analysis?.strengths && ai_analysis.strengths.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs text-slate-500 font-semibold mb-2 uppercase flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-[#008558]" /> Strengths
                    </p>
                    <ul className="space-y-1.5">
                      {ai_analysis.strengths.map((s: string, i: number) => (
                        <li key={i} className="text-sm text-slate-700 flex items-start gap-2">
                          <TrendingUp className="w-4 h-4 text-[#008558] mt-0.5 shrink-0" /> {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {ai_analysis?.weaknesses && ai_analysis.weaknesses.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs text-slate-500 font-semibold mb-2 uppercase flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 text-rose-500" /> Weaknesses
                    </p>
                    <ul className="space-y-1.5">
                      {ai_analysis.weaknesses.map((w: string, i: number) => (
                        <li key={i} className="text-sm text-slate-700 flex items-start gap-2">
                          <TrendingDown className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" /> {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {ai_analysis?.evidence?.skills_confirmed && ai_analysis.evidence.skills_confirmed.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-500 font-semibold mb-2 uppercase">Confirmed Skills (from resume)</p>
                    <div className="flex flex-wrap gap-2">
                      {ai_analysis.evidence.skills_confirmed.map((skill: string) => (
                        <span key={skill} className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {ai_analysis?.job_match && (
                  <div className="mt-6 pt-6 border-t border-slate-200">
                    <div className="flex items-center gap-2 mb-4 text-blue-600">
                      <Target className="w-5 h-5" />
                      <h4 className="font-semibold text-sm uppercase tracking-wide">Job Match</h4>
                    </div>

                    <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100 mb-4">
                      <p className="text-xs text-blue-600 font-semibold mb-1 uppercase">Recommendation</p>
                      <p className="font-semibold text-slate-800">{ai_analysis.job_match.recommendation}</p>
                      <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                        <b>Job Fit</b> measures match against <i>this role's</i> requirements. It is separate from the
                        <b> Overall Competency</b> score/grade above, which rates the candidate in absolute terms — so a strong fit can still carry a low grade.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="bg-white p-3 rounded-lg border border-slate-200">
                        <p className="text-xs text-slate-500 font-medium mb-1">Match Score</p>
                        <p className="font-bold text-lg text-slate-800">{ai_analysis.job_match.match_score_pct}%</p>
                      </div>
                      <div className="bg-white p-3 rounded-lg border border-slate-200">
                        <p className="text-xs text-slate-500 font-medium mb-1">Experience Met</p>
                        <p className={`font-bold text-lg ${ai_analysis.job_match.experience_met ? 'text-[#008558]' : 'text-rose-500'}`}>
                          {ai_analysis.job_match.experience_met ? 'Yes' : 'No'}
                        </p>
                      </div>
                    </div>

                    {ai_analysis.job_match.required_skills_met && ai_analysis.job_match.required_skills_met.length > 0 && (
                      <div className="mb-4">
                        <p className="text-xs text-slate-500 font-semibold mb-2 uppercase text-[#008558]">Required Skills Matched</p>
                        <div className="flex flex-wrap gap-2">
                          {ai_analysis.job_match.required_skills_met.map((s: string) => (
                            <span key={s} className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded-md text-xs font-medium border border-emerald-100 flex items-center gap-1">
                              <Check className="w-3 h-3" /> {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {ai_analysis.job_match.preferred_skills_met && ai_analysis.job_match.preferred_skills_met.length > 0 && (
                      <div className="mb-4">
                        <p className="text-xs text-slate-500 font-semibold mb-2 uppercase">Preferred Skills Matched</p>
                        <div className="flex flex-wrap gap-2">
                          {ai_analysis.job_match.preferred_skills_met.map((s: string) => (
                            <span key={s} className="bg-blue-50 text-blue-700 px-2 py-1 rounded-md text-xs font-medium border border-blue-100 flex items-center gap-1">
                              <Star className="w-3 h-3" /> {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {ai_analysis.job_match.required_skills_missing && ai_analysis.job_match.required_skills_missing.length > 0 && (
                      <div className="mb-4">
                        <p className="text-xs text-slate-500 font-semibold mb-2 uppercase text-rose-500">Missing Required Skills</p>
                        <div className="flex flex-wrap gap-2">
                          {ai_analysis.job_match.required_skills_missing.map((s: string) => (
                            <span key={s} className="bg-rose-50 text-rose-600 px-2 py-1 rounded-md text-xs font-medium border border-rose-100">
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-xs text-slate-500 font-medium">Domain Match:</span>
                      {ai_analysis.job_match.domain_matched ? (
                        <span className="flex items-center gap-1 text-[#008558] font-semibold"><Check className="w-4 h-4" /> Matched</span>
                      ) : (
                        <span className="flex items-center gap-1 text-rose-500 font-semibold"><XCircle className="w-4 h-4" /> Not matched</span>
                      )}
                    </div>
                  </div>
                )}

                {ai_analysis?.evidence && (
                  <div className="mt-6 pt-6 border-t border-slate-200">
                    <div className="flex items-center gap-2 mb-4 text-purple-600">
                      <Briefcase className="w-5 h-5" />
                      <h4 className="font-semibold text-sm uppercase tracking-wide">Candidate Evidence</h4>
                    </div>

                    <div className="space-y-4">
                      {ai_analysis.evidence.domains && ai_analysis.evidence.domains.length > 0 && (
                        <div>
                          <p className="text-xs text-slate-500 font-medium mb-1">Domains</p>
                          <div className="flex flex-wrap gap-1">
                            {ai_analysis.evidence.domains.map((d: string) => (
                              <span key={d} className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs">{d}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {ai_analysis.evidence.skills_inferred && ai_analysis.evidence.skills_inferred.length > 0 && (
                        <div>
                          <p className="text-xs text-slate-500 font-medium mb-1">Inferred Skills</p>
                          <div className="flex flex-wrap gap-1">
                            {ai_analysis.evidence.skills_inferred.map((s: string) => (
                              <span key={s} className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded text-xs border border-purple-100">{s}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {ai_analysis?.evidence?.github_activity !== undefined && (
                  <div className="mt-6 pt-6 border-t border-slate-200">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2 text-slate-800">
                        <Code className="w-5 h-5" />
                        <h4 className="font-semibold text-sm uppercase tracking-wide">GitHub Analytics</h4>
                      </div>
                      {ai_analysis.pipeline_meta?.github_analyzed ? (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-[#008558] bg-emerald-50 px-2 py-1 rounded uppercase tracking-wider"><Check className="w-3 h-3" /> Analyzed</span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded uppercase tracking-wider"><AlertCircle className="w-3 h-3" /> No Data</span>
                      )}
                    </div>

                    <div className="bg-slate-900 rounded-lg p-4 text-white">
                      <div className="flex justify-between items-end mb-4">
                        <div>
                          <p className="text-xs text-slate-400 font-medium uppercase mb-1">Activity Score</p>
                          {githubAnalyzed ? (
                            <p className="text-2xl font-outfit font-bold">{ai_analysis.evidence.github_activity?.toFixed(1)} <span className="text-sm font-medium text-slate-400">/ 10</span></p>
                          ) : (
                            <p className="text-sm font-medium text-slate-400">Not analyzed — no reachable GitHub profile</p>
                          )}
                        </div>
                        {githubFake && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-rose-300 bg-rose-500/20 px-2 py-1 rounded uppercase tracking-wider">
                            <ShieldAlert className="w-3 h-3" /> Flagged
                          </span>
                        )}
                      </div>

                      {githubAnalyzed && (
                        <div className="grid grid-cols-2 gap-3 mb-4">
                          <div className="bg-slate-800/60 rounded-lg p-2.5 flex items-center gap-2">
                            <Star className="w-4 h-4 text-amber-400" />
                            <div>
                              <p className="text-[10px] text-slate-400 uppercase">Stars</p>
                              <p className="text-sm font-bold">{githubBreakdown.total_stars ?? 0}</p>
                            </div>
                          </div>
                          <div className="bg-slate-800/60 rounded-lg p-2.5 flex items-center gap-2">
                            <GitFork className="w-4 h-4 text-slate-300" />
                            <div>
                              <p className="text-[10px] text-slate-400 uppercase">Original Repos</p>
                              <p className="text-sm font-bold">{githubBreakdown.original_repos ?? 0}</p>
                            </div>
                          </div>
                          <div className="bg-slate-800/60 rounded-lg p-2.5 flex items-center gap-2">
                            <Code className="w-4 h-4 text-emerald-400" />
                            <div>
                              <p className="text-[10px] text-slate-400 uppercase">Active Days (90d)</p>
                              <p className="text-sm font-bold">{githubBreakdown.contribution_days ?? 0}</p>
                            </div>
                          </div>
                          <div className="bg-slate-800/60 rounded-lg p-2.5 flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-blue-400" />
                            <div>
                              <p className="text-[10px] text-slate-400 uppercase">Last Active</p>
                              <p className="text-sm font-bold">{githubBreakdown.last_active_days_ago ?? "—"}{githubBreakdown.last_active_days_ago != null ? "d ago" : ""}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {githubAnalyzed && ai_analysis.evidence.github_languages && ai_analysis.evidence.github_languages.length > 0 && (
                        <div>
                          <p className="text-xs text-slate-400 font-medium uppercase mb-2">Top Languages</p>
                          <div className="flex flex-wrap gap-2">
                            {ai_analysis.evidence.github_languages.map((l: string) => (
                              <span key={l} className="bg-slate-800 px-2 py-1 rounded text-xs text-slate-300 border border-slate-700">{l}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {ai_analysis?.modifiers && ai_analysis.modifiers.length > 0 && (
                  <div className="mt-6 pt-6 border-t border-slate-200">
                    <div className="flex items-center gap-2 mb-4 text-slate-600">
                      <AlertCircle className="w-5 h-5" />
                      <h4 className="font-semibold text-sm uppercase tracking-wide">Score Modifiers</h4>
                    </div>

                    <div className="space-y-2">
                      {ai_analysis.modifiers.map((mod: any, idx: number) => (
                        <div key={idx} className={`flex items-start justify-between p-3 rounded-lg border ${mod.type === 'penalty' ? 'bg-rose-50/50 border-rose-100' : 'bg-emerald-50/50 border-emerald-100'}`}>
                          <div className="flex items-start gap-2">
                            {mod.type === 'penalty' ? <TrendingDown className="w-4 h-4 text-rose-500 mt-0.5" /> : <TrendingUp className="w-4 h-4 text-[#008558] mt-0.5" />}
                            <p className="text-sm text-slate-700">{mod.reason}</p>
                          </div>
                          <span className={`font-semibold text-sm ${mod.type === 'penalty' ? 'text-rose-600' : 'text-[#008558]'}`}>
                            {mod.value > 0 ? `+${mod.value}` : mod.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Extracted Resume Info */}
            <div className="lg:col-span-2">
              {resume_data ? (
                <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm h-full">
                  <div className="flex items-center gap-2 mb-6 pb-4 border-b border-slate-100 text-slate-700">
                    <FileText className="w-6 h-6 text-[#008558]" />
                    <h3 className="text-xl font-semibold font-outfit">Extracted Resume Info</h3>
                    {application.original_cv_url && (
                      <a
                        href={`${baseUrl}${application.original_cv_url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold text-[#008558] hover:underline"
                      >
                        <FileText className="w-4 h-4" /> View original CV
                      </a>
                    )}
                  </div>

                  <div className="grid md:grid-cols-2 gap-x-8 gap-y-6">

                    {/* Column 1: Core Info & Experience */}
                    <div className="space-y-6">
                      {resume_data.summary && (
                        <div>
                          <p className="text-xs text-slate-400 font-semibold mb-1 uppercase">Summary</p>
                          <p className="text-sm text-slate-700 leading-relaxed">{resume_data.summary}</p>
                        </div>
                      )}

                      {resume_data.total_experience_years !== undefined && (
                        <div>
                          <p className="text-xs text-slate-400 font-semibold mb-1 uppercase">Total Experience</p>
                          <p className="text-sm font-semibold text-[#008558]">{resume_data.total_experience_years} Years</p>
                        </div>
                      )}

                      {resume_data.experience && resume_data.experience.length > 0 && (
                        <div>
                          <p className="text-xs text-slate-400 font-semibold mb-3 uppercase">Experience</p>
                          <div className="space-y-4">
                            {resume_data.experience.map((exp: any, i: number) => {
                              if (!exp.job_title && !exp.company && !exp.title) return null;
                              return (
                                <div key={i} className="relative pl-4 border-l-2 border-slate-200">
                                  <p className="text-sm font-semibold text-slate-800">{exp.job_title || exp.title || 'Role'} <span className="font-normal text-slate-500">at {exp.company || 'Company'}</span></p>
                                  <p className="text-xs text-slate-500 mb-1">
                                    {exp.start_date || ''} {exp.end_date ? `- ${exp.end_date}` : ''} {exp.date_range || exp.dates || ''}
                                  </p>
                                  {exp.description && <p className="text-xs text-slate-600 leading-relaxed mt-1">{exp.description}</p>}
                                  {exp.responsibilities && Array.isArray(exp.responsibilities) && (
                                    <ul className="list-disc list-inside text-xs text-slate-600 space-y-1 mt-2">
                                      {exp.responsibilities.map((resp: string, rIdx: number) => (
                                        <li key={rIdx}>{resp}</li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {resume_data.education && resume_data.education.length > 0 && (
                        <div>
                          <p className="text-xs text-slate-400 font-semibold mb-3 uppercase">Education</p>
                          <div className="space-y-4">
                            {resume_data.education.map((edu: any, i: number) => (
                              <div key={i} className="relative pl-4 border-l-2 border-slate-200">
                                <p className="text-sm font-semibold text-slate-800">{edu.degree || edu.degree_name || 'Degree'}</p>
                                <p className="text-sm text-slate-600">{edu.institution || edu.school_name || 'Institution'}</p>
                                {edu.field && <p className="text-xs text-slate-500 mt-0.5">Field of Study: {edu.field}</p>}
                                <p className="text-xs text-slate-400 mt-0.5">{edu.year || edu.date_range || edu.dates || ''}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Column 2: Projects, Skills, Certs, Achievements */}
                    <div className="space-y-6">
                      {resume_data.projects && resume_data.projects.length > 0 && (
                        <div>
                          <p className="text-xs text-slate-400 font-semibold mb-3 uppercase">Projects</p>
                          <ul className="space-y-2">
                            {resume_data.projects.map((proj: any, i: number) => (
                              <li key={i} className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3 border border-slate-100">
                                {typeof proj === 'string' ? (
                                  <span className="font-semibold text-slate-800">{proj}</span>
                                ) : (
                                  <>
                                    <span className="font-semibold text-slate-800 block mb-1">{proj.name || proj.title || 'Project'}</span>
                                    {proj.description && <span className="text-xs text-slate-600">{proj.description}</span>}
                                  </>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {resume_data.skills && resume_data.skills.length > 0 && (
                        <div>
                          <p className="text-xs text-slate-400 font-semibold mb-3 uppercase">Skills</p>
                          <div className="flex flex-wrap gap-2">
                            {resume_data.skills.map((skill: string, i: number) => (
                              <span key={i} className="bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-1 rounded-md text-xs font-medium">{skill}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {resume_data.programming_languages && resume_data.programming_languages.length > 0 && (
                        <div>
                          <p className="text-xs text-slate-400 font-semibold mb-3 uppercase">Programming Languages</p>
                          <div className="flex flex-wrap gap-2">
                            {resume_data.programming_languages.map((lang: string, i: number) => (
                              <span key={i} className="bg-blue-50 text-blue-700 border border-blue-100 px-2.5 py-1 rounded-md text-xs font-medium">{lang}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {resume_data.certifications && resume_data.certifications.length > 0 && (
                        <div>
                          <p className="text-xs text-slate-400 font-semibold mb-3 uppercase">Certifications</p>
                          <ul className="space-y-1.5">
                            {resume_data.certifications.map((cert: any, i: number) => (
                              <li key={i} className="text-sm text-slate-700 flex items-start gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-[#008558] mt-1.5 shrink-0" />
                                {cert.name || cert.title || cert}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {resume_data.achievements && resume_data.achievements.length > 0 && (
                        <div>
                          <p className="text-xs text-slate-400 font-semibold mb-3 uppercase">Achievements</p>
                          <ul className="space-y-1.5">
                            {resume_data.achievements.map((ach: any, i: number) => (
                              <li key={i} className="text-sm text-slate-700 flex items-start gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                                {ach.description || ach.title || ach}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-lg p-12 shadow-sm text-center text-slate-500">
                  No resume data available.
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ══════════════════ TAB 2: VOICE & ANALYTICS ══════════════════ */}
      {activeTab === "voice" && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-6 pb-4 border-b border-slate-100 text-slate-800">
            <Headphones className="w-6 h-6 text-[#008558]" />
            <h3 className="text-xl font-semibold font-outfit">Interview Recordings & Analysis</h3>
          </div>

          {/* ── Average speech metrics across all answered questions ── */}
          {emotionSummary && (
            <div className="bg-slate-900 rounded-lg p-5 mb-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <Mic className="w-4 h-4 text-emerald-400" />
                  <h4 className="text-xs font-bold uppercase tracking-widest text-slate-300">Comprehensive Speech Metrics</h4>
                </div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Avg of {emotionSummary.count} answer{emotionSummary.count > 1 ? "s" : ""}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {EMOTIONS.map((e) => (
                  <EmotionGauge key={e.key} value={emotionSummary.avg[e.key]} label={e.label} color={e.color} />
                ))}
              </div>

              <div className="mt-5 pt-4 border-t border-slate-700/60 flex items-center justify-between">
                <span className="text-xs text-slate-400 uppercase tracking-wide">Dominant Emotion</span>
                <span className="text-sm font-bold capitalize" style={{ color: emotionSummary.dominant.color }}>
                  {emotionSummary.dominant.label}
                </span>
              </div>
            </div>
          )}

          {interview_answers && interview_answers.length > 0 ? (
            <div className="space-y-6">
              {interview_answers.map((answer: any, index: number) => (
                <div key={index} className="border border-slate-100 rounded-lg p-5 bg-slate-50/50">
                  <div className="mb-3">
                    <p className="text-xs text-slate-400 font-semibold uppercase mb-1">Question {index + 1}</p>
                    <p className="font-medium text-slate-800 text-lg">{answer.question}</p>
                  </div>

                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <p className="text-xs text-slate-400 font-semibold uppercase">Emotion Analysis</p>
                      <span className="inline-flex items-center gap-1.5 bg-blue-100 text-blue-700 px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize">
                        <Mic className="w-3.5 h-3.5" /> {answer.predicted_label || "Unknown"}
                      </span>
                    </div>

                    {answer.audio_analysis ? (
                      <div className="space-y-2">
                        {EMOTIONS.map((e) => {
                          const val = Math.max(0, Math.min(100, Number(answer.audio_analysis[e.key]) || 0));
                          return (
                            <div key={e.key} className="flex items-center gap-3">
                              <span className="text-xs text-slate-500 w-24 shrink-0">{e.label}</span>
                              <div className="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${val}%`, backgroundColor: e.color }} />
                              </div>
                              <span className="text-xs font-semibold text-slate-600 w-10 text-right tabular-nums">{val.toFixed(0)}%</span>
                            </div>
                          );
                        })}
                        {typeof answer.audio_analysis.hesitation_word_count === "number" && (
                          <p className="text-[11px] text-slate-400 pt-1">
                            Filler words detected: <b className="text-slate-600">{answer.audio_analysis.hesitation_word_count}</b>
                            {answer.audio_analysis.audio_info?.duration_sec != null && (
                              <> · Duration: <b className="text-slate-600">{answer.audio_analysis.audio_info.duration_sec}s</b></>
                            )}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic">Detailed metrics not available for this answer.</p>
                    )}
                  </div>

                  <div className="mb-4">
                    <p className="text-xs text-slate-400 font-semibold uppercase mb-1">Audio Recording</p>
                    {answer.audio_url ? (
                      <audio controls className="w-full h-10 mt-1">
                        <source src={`${baseUrl}${answer.audio_url}`} type="audio/wav" />
                        Your browser does not support the audio element.
                      </audio>
                    ) : (
                      <p className="text-sm text-slate-500 italic">No audio available</p>
                    )}
                  </div>

                  {(answer.audio_analysis?.transcript || answer.transcribed_text) && (
                    <div>
                      <p className="text-xs text-slate-400 font-semibold uppercase mb-1">Transcript</p>
                      <p className="text-sm text-slate-600 bg-white p-3 rounded border border-slate-200 leading-relaxed">
                        {answer.audio_analysis?.transcript || answer.transcribed_text}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-slate-500">
              <Mic className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p>No interview answers recorded yet.</p>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════ TAB 3: FACIAL & GAZE BEHAVIOUR ══════════════════ */}
      {activeTab === "behavior" && (
        <div className="space-y-6">
          {/* ── Overall Session Behavioral Summary ── */}
          {application.behavioral_summary && (
            <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
              <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-100">
                <div className="flex items-center gap-2 text-slate-800">
                  <Activity className="w-5 h-5 text-emerald-600" />
                  <h3 className="text-xl font-semibold font-outfit">Overall Interview Behavioral Summary</h3>
                </div>
                <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                  Aggregated across {application.behavioral_summary.analyzed_answers_count} question(s)
                </span>
              </div>

              {/* Review Priority Banner */}
              {(() => {
                const priority = application.behavioral_summary.review_priority || "Low";
                const isHigh = priority === "High";
                const isMed = priority === "Medium";
                const bgClass = isHigh
                  ? "bg-amber-600 text-white"
                  : isMed
                  ? "bg-amber-500 text-white"
                  : "bg-emerald-600 text-white";

                return (
                  <div className={`${bgClass} rounded-lg p-5 mb-6 shadow-sm`}>
                    <div className="text-[11px] font-bold uppercase tracking-widest opacity-80 mb-1">REVIEW PRIORITY</div>
                    <div className="text-3xl font-extrabold font-outfit mb-2">{priority}</div>
                    {application.behavioral_summary.priority_reasons?.length > 0 && (
                      <p className="text-sm font-medium opacity-95">
                        {application.behavioral_summary.priority_reasons.join("; ")}
                      </p>
                    )}
                    <p className="text-xs opacity-75 mt-2">
                      How much of this footage a person may want to watch. Not a judgement about the candidate.
                    </p>
                  </div>
                );
              })()}

              {/* Stat Tiles Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-4">
                  <div className="text-xs text-slate-500 font-medium">Analysed</div>
                  <div className="text-2xl font-bold text-slate-800 mt-1">
                    {application.behavioral_summary.total_analysed_s}s
                  </div>
                  {application.behavioral_summary.total_calibrating_s > 0 && (
                    <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                      <span>↑ {application.behavioral_summary.total_calibrating_s}s calibrating</span>
                    </div>
                  )}
                </div>

                <div className="bg-slate-50 border border-slate-100 rounded-lg p-4">
                  <div className="text-xs text-slate-500 font-medium">Longest Sustained</div>
                  <div className="text-2xl font-bold text-slate-800 mt-1">
                    {application.behavioral_summary.longest_suspicious_span_s}s
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    aversion span
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-100 rounded-lg p-4">
                  <div className="text-xs text-slate-500 font-medium">Review Flags</div>
                  <div className="text-2xl font-bold text-slate-800 mt-1">
                    {application.behavioral_summary.total_flags}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    moments marked
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-100 rounded-lg p-4">
                  <div className="text-xs text-slate-500 font-medium">State Distribution</div>
                  <div className="mt-2 space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-emerald-700 font-medium">Engaged</span>
                      <span className="text-slate-600 font-bold">{Math.round((application.behavioral_summary.average_state_fractions?.Engaged || 0) * 100)}%</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-blue-700 font-medium">Neutral</span>
                      <span className="text-slate-600 font-bold">{Math.round((application.behavioral_summary.average_state_fractions?.Neutral || 0) * 100)}%</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-rose-700 font-medium">Suspicious</span>
                      <span className="text-slate-600 font-bold">{Math.round((application.behavioral_summary.average_state_fractions?.Suspicious || 0) * 100)}%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Per-Question Video & Behavior Breakdown ── */}
          {interview_answers && interview_answers.length > 0 ? (
            <div className="space-y-6">
              {interview_answers.map((answer: any, index: number) => {
                const analysis = answer.video_analysis;
                const summary = analysis?.summary;
                const session = summary?.session;
                const entries = analysis?.entries || [];
                const meta = analysis?.meta;

                return (
                  <div key={index} className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
                    {/* Header */}
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-5 pb-3 border-b border-slate-100">
                      <div>
                        <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Question {index + 1}</span>
                        <h4 className="text-lg font-semibold text-slate-800 mt-0.5">{answer.question}</h4>
                      </div>
                      {session?.review_priority && (
                        <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                          session.review_priority === 'High' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                          session.review_priority === 'Medium' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                          'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        }`}>
                          Priority: {session.review_priority}
                        </span>
                      )}
                    </div>

                    {/* Video Player & Summary Panel */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
                      {/* Left: Video Player */}
                      <div className="lg:col-span-5 flex flex-col justify-center">
                        <div className="bg-slate-900 rounded-lg overflow-hidden border border-slate-200 shadow-inner">
                          {answer.video_url ? (
                            <video
                              controls
                              playsInline
                              className="w-full aspect-video object-cover"
                              src={`${baseUrl}${answer.video_url}`}
                            >
                              Your browser does not support video playback.
                            </video>
                          ) : (
                            <div className="aspect-video flex flex-col items-center justify-center text-slate-400 p-6 text-center">
                              <Video className="w-10 h-10 mb-2 opacity-40" />
                              <p className="text-sm">Video file was not captured for this question</p>
                            </div>
                          )}
                        </div>
                        {meta && (
                          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
                            {meta.duration_s != null && <span>Duration: <b>{meta.duration_s}s</b></span>}
                            {meta.fps != null && <span>FPS: <b>{meta.fps}</b></span>}
                            {meta.frames != null && <span>Frames: <b>{meta.frames}</b></span>}
                            {meta.detector && <span>Detector: <b className="font-mono">{meta.detector}</b></span>}
                          </div>
                        )}
                      </div>

                      {/* Right: Question Metrics */}
                      <div className="lg:col-span-7 flex flex-col justify-between">
                        {session ? (
                          <div className="space-y-4">
                            {/* Priority Banner Card */}
                            <div className={`p-4 rounded-lg border ${
                              session.review_priority === 'High' ? 'bg-amber-500/10 border-amber-300 text-amber-900' :
                              session.review_priority === 'Medium' ? 'bg-amber-50 border-amber-200 text-amber-800' :
                              'bg-emerald-50 border-emerald-200 text-emerald-800'
                            }`}>
                              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">Review Priority</div>
                              <div className="text-xl font-bold font-outfit">{session.review_priority}</div>
                              {session.priority_reasons?.length > 0 && (
                                <p className="text-xs mt-1 font-medium text-slate-700">
                                  {session.priority_reasons.join("; ")}
                                </p>
                              )}
                            </div>

                            {/* Stat Tiles */}
                            <div className="grid grid-cols-3 gap-3">
                              <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                                <span className="text-[10px] font-semibold uppercase text-slate-400">Analysed</span>
                                <p className="text-lg font-bold text-slate-800 mt-0.5">{session.analysed_s}s</p>
                                {session.calibrating_s > 0 && (
                                  <span className="text-[10px] text-slate-400">↑ {session.calibrating_s}s calib</span>
                                )}
                              </div>

                              <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                                <span className="text-[10px] font-semibold uppercase text-slate-400">Longest Sustained</span>
                                <p className="text-lg font-bold text-slate-800 mt-0.5">{session.longest_suspicious_span_s || 0}s</p>
                                <span className="text-[10px] text-slate-400">aversion</span>
                              </div>

                              <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                                <span className="text-[10px] font-semibold uppercase text-slate-400">Review Flags</span>
                                <p className="text-lg font-bold text-slate-800 mt-0.5">{summary?.n_flags || 0}</p>
                                <span className="text-[10px] text-slate-400">flags</span>
                              </div>
                            </div>

                            {/* Moments to review note */}
                            <div className="bg-sky-50 border border-sky-200 rounded-lg p-3 flex items-start gap-2.5 text-xs text-sky-900">
                              <Info className="w-4 h-4 text-sky-600 mt-0.5 shrink-0" />
                              <div>
                                {session.review_moments_s?.length > 0 ? (
                                  <p className="font-semibold mb-0.5">
                                    Moments to review: {session.review_moments_s.map((m: number) => `${m}s`).join(", ")}
                                  </p>
                                ) : (
                                  <p className="font-semibold mb-0.5">No critical moments flagged</p>
                                )}
                                <p className="text-sky-700/80 text-[11px] leading-relaxed">
                                  A review flag marks a moment where a brief facial movement coincided with looking away. It means a person might want to watch this timestamp — nothing more.
                                </p>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-slate-50 rounded-lg p-8 text-center text-slate-400 flex flex-col items-center justify-center h-full">
                            <Eye className="w-8 h-8 mb-2 opacity-40" />
                            <p className="text-sm">Facial & gaze analysis pending or not available for this question.</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Full Timeline Table */}
                    {entries.length > 0 && (
                      <div className="mt-6 pt-5 border-t border-slate-100">
                        <div className="flex items-center justify-between mb-3">
                          <h5 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Full Timeline</h5>
                          <button
                            onClick={() => downloadJSON(analysis, `behavioural_log_q${index + 1}.json`)}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#008558] hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-md transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Download behavioural log (JSON)
                          </button>
                        </div>

                        <div className="overflow-x-auto border border-slate-200 rounded-lg">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                              <tr>
                                <th className="py-2.5 px-4">time (s)</th>
                                <th className="py-2.5 px-4">state</th>
                                <th className="py-2.5 px-4">event</th>
                                <th className="py-2.5 px-4 text-center">review</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-slate-700 font-mono">
                              {entries.map((entry: any, eIdx: number) => {
                                const isFlagged = entry.review_flag === true;
                                return (
                                  <tr key={eIdx} className={isFlagged ? "bg-amber-50/50" : "hover:bg-slate-50/60"}>
                                    <td className="py-2 px-4 font-semibold text-slate-900">
                                      {typeof entry.t === 'number' ? entry.t.toFixed(2) : entry.t}
                                    </td>
                                    <td className="py-2 px-4">
                                      <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-sans font-semibold ${
                                        entry.state === 'Calibrating' ? 'bg-slate-100 text-slate-600' :
                                        entry.state === 'Neutral' ? 'bg-blue-100 text-blue-700' :
                                        entry.state === 'Engaged' ? 'bg-emerald-100 text-emerald-700' :
                                        'bg-amber-100 text-amber-800'
                                      }`}>
                                        {entry.state}
                                      </span>
                                    </td>
                                    <td className="py-2 px-4 font-sans text-slate-600">{entry.event || "state change"}</td>
                                    <td className="py-2 px-4 text-center">
                                      {isFlagged ? (
                                        <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-[11px] font-sans font-semibold">
                                          <Flag className="w-3 h-3" /> yes
                                        </span>
                                      ) : (
                                        <span className="text-slate-300 font-sans">—</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg p-12 text-center text-slate-500 shadow-sm">
              <Video className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-base font-semibold text-slate-700">No interview recordings available</p>
              <p className="text-sm text-slate-400 mt-1">Once the candidate records video answers, facial and gaze behavior analysis will appear here.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
