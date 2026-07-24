"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { updateJob, getJobs } from "@/lib/api";
import { ArrowLeft, Loader2, Save, LayoutGrid, MapPin, Briefcase, FileText } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import "suneditor/dist/css/suneditor.min.css";

const SunEditor = dynamic(() => import("suneditor-react"), { ssr: false });

export default function EditJobPage() {
  const router = useRouter();
  const { id } = useParams();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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

  useEffect(() => {
    const fetchJob = async () => {
      try {
        const res = await getJobs();
        const job = res.data.data.find((j: any) => j._id === id);
        
        if (job) {
          setFormData({
            title: job.title || "",
            description: job.description || "",
            domain: job.domain || "",
            location: job.location || "Colombo",
            min_experience_years: job.min_experience_years || 0,
            required_skills: job.required_skills?.join(", ") || "",
            preferred_skills: job.preferred_skills?.join(", ") || "",
            is_active: job.is_active !== false
          });
        } else {
          setError("Job not found.");
        }
      } catch (err) {
        console.error(err);
        setError("Failed to load job data.");
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchJob();
  }, [id]);

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
    setSaving(true);
    setError("");

    try {
      const payload = {
        ...formData,
        required_skills: formData.required_skills.split(',').map((s: string) => s.trim()).filter(Boolean),
        preferred_skills: formData.preferred_skills.split(',').map((s: string) => s.trim()).filter(Boolean),
        min_experience_years: Number(formData.min_experience_years)
      };

      await updateJob(id as string, payload);
      router.push('/admin/dashboard/jobs');
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to update job.");
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center mt-20"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>;

  return (
    <div className="w-full">
      <Link href="/admin/dashboard/jobs" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-600 mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Jobs
      </Link>

      <div className="mb-8">
        <h1 className="text-3xl font-outfit font-semibold text-slate-800">Edit Job Post</h1>
        <p className="text-slate-500 mt-2">Update the details of this job opportunity.</p>
      </div>

      {error && !formData.title ? (
        <div className="bg-red-50 text-red-600 p-6 rounded-lg text-center">
            {error}
        </div>
      ) : (
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
                />
              </div>
            </div>

            <div className="pt-2">
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
              disabled={saving}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3.5 rounded-lg font-semibold transition-colors shadow-sm shadow-indigo-500/20 disabled:opacity-70 text-sm"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5" /> Save Changes</>}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
