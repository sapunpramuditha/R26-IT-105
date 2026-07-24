"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createJob, getAssessmentPapers } from "@/lib/api";
import { ArrowLeft, BookOpenCheck, Clock3, Loader2, Save, LayoutGrid, MapPin, Briefcase, FileText, ShieldCheck } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import "suneditor/dist/css/suneditor.min.css";

const SunEditor = dynamic(() => import("suneditor-react"), { ssr: false });

export default function CreateJobPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [papers, setPapers] = useState<any[]>([]);
  const [assessmentEnabled, setAssessmentEnabled] = useState(false);
  const [assessmentPaperId, setAssessmentPaperId] = useState("");
  useEffect(() => { getAssessmentPapers().then(r => setPapers(r.data.data.filter((p:any) => p.status === 'Published'))).catch(() => setPapers([])); }, []);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    domain: "",
    location: "Colombo",
    min_experience_years: 0,
    required_skills: "",
    preferred_skills: "",
    is_active: true
  });

  const handleChange = (e: any) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleEditorChange = (content: string) => {
    setFormData(prev => ({ ...prev, description: content }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const payload = {
        ...formData,
        required_skills: formData.required_skills.split(',').map((s: string) => s.trim()).filter(Boolean),
        preferred_skills: formData.preferred_skills.split(',').map((s: string) => s.trim()).filter(Boolean),
        min_experience_years: Number(formData.min_experience_years),
        written_assessment: { enabled: assessmentEnabled, paper_id: assessmentEnabled ? assessmentPaperId : null, duration_minutes: papers.find((p:any) => p._id === assessmentPaperId)?.duration_minutes || 45, minimum_answer_characters: 100, attempt_limit: 1 }
      };

      await createJob(payload);
      router.push('/admin/dashboard/jobs');
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to create job.");
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      <Link href="/admin/dashboard/jobs" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-600 mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Jobs
      </Link>

      <div className="mb-8">
        <h1 className="text-3xl font-outfit font-semibold text-slate-800">Create Job Post</h1>
        <p className="text-slate-500 mt-2">Fill in the details below to publish a new job opportunity.</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white p-8 sm:p-10 rounded-lg border border-slate-200 shadow-sm space-y-8">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
                <Briefcase className="w-4 h-4 text-slate-800" /> Job Title
              </label>
              <input
                type="text"
                name="title"
                required
                value={formData.title}
                onChange={handleChange}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all text-slate-700"
                placeholder="e.g. Senior Software Engineer"
              />
            </div>
            
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
                <LayoutGrid className="w-4 h-4 text-slate-800" /> Domain
              </label>
              <input
                type="text"
                name="domain"
                required
                value={formData.domain}
                onChange={handleChange}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all text-slate-700"
                placeholder="e.g. Engineering, Design"
              />
            </div>
            
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
                <MapPin className="w-4 h-4 text-slate-800" /> Location
              </label>
              <input
                type="text"
                name="location"
                required
                value={formData.location}
                onChange={handleChange}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all text-slate-700"
                placeholder="e.g. Colombo, Remote"
              />
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
              <FileText className="w-4 h-4 text-slate-800" /> Description
            </label>
            <div className="border border-slate-200 rounded-lg overflow-hidden shadow-sm">
              <SunEditor
                setContents={formData.description}
                onChange={handleEditorChange}
                setOptions={{
                  buttonList: [
                    ['undo', 'redo'],
                    ['font', 'fontSize', 'formatBlock'],
                    ['bold', 'underline', 'italic', 'strike', 'subscript', 'superscript'],
                    ['removeFormat'],
                    ['fontColor', 'hiliteColor'],
                    ['align', 'list', 'lineHeight'],
                    ['outdent', 'indent'],
                    ['table', 'horizontalRule', 'link', 'image', 'video'],
                    ['fullScreen', 'showBlocks', 'codeView']
                  ],
                  minHeight: "300px",
                }}
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Min. Experience (Years)</label>
              <input
                type="number"
                name="min_experience_years"
                required
                min={0}
                value={formData.min_experience_years}
                onChange={handleChange}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all text-slate-700"
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Required Skills (Comma separated)</label>
              <input
                type="text"
                name="required_skills"
                value={formData.required_skills}
                onChange={handleChange}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all text-slate-700"
                placeholder="React, Node.js, TypeScript"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Preferred Skills (Comma separated)</label>
              <input
                type="text"
                name="preferred_skills"
                value={formData.preferred_skills}
                onChange={handleChange}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all text-slate-700"
                placeholder="Docker, AWS, GraphQL"
              />
            </div>
          </div>

          <div className="pt-2">
            <div className={`mb-5 overflow-hidden rounded-2xl border transition-all ${assessmentEnabled ? "border-emerald-300 bg-emerald-50/40 shadow-sm" : "border-slate-200 bg-white"}`}>
              <label className="flex cursor-pointer items-start gap-4 p-5">
                <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${assessmentEnabled ? "bg-[#008558] text-white" : "bg-slate-100 text-slate-500"}`}><BookOpenCheck className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1"><span className="block font-bold text-slate-900">Written assessment</span><span className="mt-1 block text-sm leading-6 text-slate-500">Automatically assign a timed written paper after the candidate completes their video interview.</span></span>
                <span className={`relative mt-1 h-6 w-11 shrink-0 rounded-full transition ${assessmentEnabled ? "bg-[#008558]" : "bg-slate-300"}`}><input type="checkbox" checked={assessmentEnabled} onChange={e=>setAssessmentEnabled(e.target.checked)} className="sr-only"/><span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${assessmentEnabled ? "left-6" : "left-1"}`}/></span>
              </label>
              {assessmentEnabled && <div className="border-t border-emerald-200 px-5 pb-5 pt-4"><label className="mb-2 block text-sm font-semibold text-slate-700">Published paper</label><select required value={assessmentPaperId} onChange={e=>setAssessmentPaperId(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm outline-none transition focus:border-[#008558] focus:ring-4 focus:ring-emerald-100"><option value="">Select a paper for this job</option>{papers.map((p:any)=><option key={p._id} value={p._id}>{p.title} · {p.questions.length} questions · {p.duration_minutes} min</option>)}</select>{assessmentPaperId&&(()=>{const selected=papers.find((p:any)=>p._id===assessmentPaperId);return selected?<div className="mt-4 grid gap-3 sm:grid-cols-3"><span className="flex items-center gap-2 rounded-lg bg-white p-3 text-xs font-semibold text-slate-600"><BookOpenCheck className="h-4 w-4 text-[#008558]"/>{selected.questions.length} questions</span><span className="flex items-center gap-2 rounded-lg bg-white p-3 text-xs font-semibold text-slate-600"><Clock3 className="h-4 w-4 text-[#008558]"/>{selected.duration_minutes} minutes</span><span className="flex items-center gap-2 rounded-lg bg-white p-3 text-xs font-semibold text-slate-600"><ShieldCheck className="h-4 w-4 text-[#008558]"/>One attempt</span></div>:null})()}</div>}
            </div>
            <label className="flex items-center gap-3 cursor-pointer p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
              <input
                type="checkbox"
                name="is_active"
                checked={formData.is_active}
                onChange={handleChange}
                className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div>
                <span className="block text-sm font-semibold text-slate-800">Active Job Post</span>
                <span className="block text-xs text-slate-500 mt-0.5">Visible to candidates immediately upon saving.</span>
              </div>
            </label>
          </div>
        </div>

        <div className="pt-6 border-t border-slate-200 flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3.5 rounded-lg font-semibold transition-colors shadow-sm shadow-indigo-500/20 disabled:opacity-70 text-sm"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5" /> Publish Job</>}
          </button>
        </div>
      </form>
    </div>
  );
}
