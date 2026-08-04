"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion } from "framer-motion";
import { Brain, FileText, AtSign, CheckCircle2, Loader2, ArrowRight, ArrowLeft, X, Plus } from "lucide-react";
import { analyzeProfile, submitApplication, getJobBySlug } from "@/lib/api";
import Link from "next/link";

export default function ApplyPage() {
  const router = useRouter();
  const { slug } = useParams();
  
  const [job, setJob] = useState<any>(null);
  const [loadingJob, setLoadingJob] = useState(true);

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  // Form State
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [github, setGithub] = useState("");
  
  // Analysis Data
  const [analysisData, setAnalysisData] = useState<any>(null);
  
  // Edit Form State (Step 2)
  const [candidateName, setCandidateName] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [experience, setExperience] = useState<any[]>([]);
  const [education, setEducation] = useState<any[]>([]);
  const [publications, setPublications] = useState<string[]>([]);
  const [achievements, setAchievements] = useState<string[]>([]);
  const [projects, setProjects] = useState<string[]>([]);
  const [certifications, setCertifications] = useState<string[]>([]);
  const [totalExpYears, setTotalExpYears] = useState<number>(0);

  // Input states for adding new items
  const [newSkill, setNewSkill] = useState("");
  const [newLang, setNewLang] = useState("");
  const [newPublication, setNewPublication] = useState("");
  const [newAchievement, setNewAchievement] = useState("");
  const [newProject, setNewProject] = useState("");
  const [newCertification, setNewCertification] = useState("");

  useEffect(() => {
    const fetchJob = async () => {
      try {
        const res = await getJobBySlug(slug as string);
        setJob(res.data.data);
      } catch (err) {
        setError("Job not found.");
      } finally {
        setLoadingJob(false);
      }
    };
    fetchJob();
  }, [slug]);

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cvFile || !github) return setError("Please provide both CV and GitHub username");
    
    setLoading(true);
    setError("");
    
    try {
      const formData = new FormData();
      formData.append("cv", cvFile);
      formData.append("github_username", github);
      
      const res = await analyzeProfile(formData);
      const data = res.data.data; // This is now resume_data directly
      
      setAnalysisData(data);
      setCandidateName(data.name || "");
      setSkills(data.skills || []);
      setLanguages(data.programming_languages || []);
      setExperience(data.experience || []);
      setEducation(data.education || []);
      setPublications(data.publications || []);
      setAchievements(data.achievements || []);
      setProjects(data.projects || []);
      setCertifications(data.certifications || []);
      setTotalExpYears(data.total_experience_years || 0);
      setStep(2);
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to analyze profile. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleAddSkill = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && newSkill.trim()) {
          e.preventDefault();
          if (!skills.includes(newSkill.trim())) {
              setSkills([...skills, newSkill.trim()]);
          }
          setNewSkill("");
      }
  };

  const handleAddLang = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && newLang.trim()) {
          e.preventDefault();
          if (!languages.includes(newLang.trim())) {
              setLanguages([...languages, newLang.trim()]);
          }
          setNewLang("");
      }
  };

  const handleAddPublication = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && newPublication.trim()) {
          e.preventDefault();
          if (!publications.includes(newPublication.trim())) {
              setPublications([...publications, newPublication.trim()]);
          }
          setNewPublication("");
      }
  };

  const handleAddAchievement = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && newAchievement.trim()) {
          e.preventDefault();
          if (!achievements.includes(newAchievement.trim())) {
              setAchievements([...achievements, newAchievement.trim()]);
          }
          setNewAchievement("");
      }
  };

  const handleAddProject = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && newProject.trim()) {
          e.preventDefault();
          if (!projects.includes(newProject.trim())) {
              setProjects([...projects, newProject.trim()]);
          }
          setNewProject("");
      }
  };

  const handleAddCertification = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && newCertification.trim()) {
          e.preventDefault();
          if (!certifications.includes(newCertification.trim())) {
              setCertifications([...certifications, newCertification.trim()]);
          }
          setNewCertification("");
      }
  };

  const handleSubmit = async () => {
    if (!job) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("job_id", job._id);
      formData.append("candidate_name", candidateName);
      formData.append("github_username", github);
      
      const resumeData = {
          ...analysisData,
          name: candidateName,
          skills: skills,
          programming_languages: languages,
          experience: experience,
          education: education,
          publications: publications,
          achievements: achievements,
          projects: projects,
          certifications: certifications,
          total_experience_years: totalExpYears
      };
      formData.append("resume_data", JSON.stringify(resumeData));
      
      if (cvFile) {
          formData.append("cv", cvFile);
      }
      
      await submitApplication(formData);
      setStep(3);
    } catch (err: any) {
       setError(err.response?.data?.error || "Failed to submit application");
    } finally {
      setLoading(false);
    }
  };

  if (loadingJob) return <div className="flex justify-center py-32"><Loader2 className="w-10 h-10 animate-spin text-[#008558]" /></div>;
  if (!job) return <div className="text-center py-20 text-slate-500 text-lg">Job not found.</div>;

  return (
    <div className="min-h-screen bg-slate-50 py-12 selection:bg-emerald-100 selection:text-emerald-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <Link href={`/jobs/${job.slug}`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-[#008558] mb-8 transition-colors group font-medium">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Back to {job.title}
        </Link>

        <div className="mb-10 text-center">
          <h1 className="text-4xl md:text-5xl font-outfit font-semibold mb-4 text-slate-900">Apply for {job.title}</h1>
          <p className="text-slate-500 text-lg">Our AI will review your profile to speed up the process.</p>
        </div>

        <div className="flex justify-center gap-4 mb-12 max-w-2xl mx-auto">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex-1">
              <div className={`h-2 rounded-full transition-colors duration-500 ${step >= i ? 'bg-[#008558]' : 'bg-slate-200'}`} />
              <p className={`text-xs mt-3 font-semibold uppercase tracking-wider text-center ${step >= i ? 'text-[#008558]' : 'text-slate-400'}`}>
                {i === 1 ? 'Upload' : i === 2 ? 'Review' : 'Complete'}
              </p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-lg p-8 md:p-12 border border-slate-200 shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden">
          {/* Subtle decoration */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-50 rounded-full mix-blend-multiply filter blur-3xl opacity-50 pointer-events-none -translate-y-1/2 translate-x-1/2"></div>
          
          <div className="relative z-10">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-6 py-4 rounded-lg mb-8 text-sm font-medium flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-red-500"></div>
                {error}
              </div>
            )}

            {/* STEP 1: UPLOAD */}
            {step === 1 && (
              <form onSubmit={handleAnalyze} className="space-y-8">
                <div>
                  <label className="block text-sm font-semibold mb-3 flex items-center gap-2 text-slate-700 uppercase tracking-wide">
                    <AtSign className="w-4 h-4 text-slate-400" /> GitHub Username
                  </label>
                  <input
                    type="text"
                    value={github}
                    onChange={(e) => setGithub(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-5 py-4 focus:outline-none focus:border-[#008558] focus:ring-1 focus:ring-[#008558] transition-all text-slate-800 text-lg"
                    placeholder="e.g. torvalds"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-semibold mb-3 flex items-center gap-2 text-slate-700 uppercase tracking-wide">
                    <FileText className="w-4 h-4 text-slate-400" /> Resume / CV (PDF)
                  </label>
                  <div className="relative">
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx"
                      onChange={(e) => setCvFile(e.target.files?.[0] || null)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-5 py-4 focus:outline-none focus:border-[#008558] focus:ring-1 focus:ring-[#008558] transition-all file:mr-5 file:py-2.5 file:px-5 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-[#008558]/10 file:text-[#008558] hover:file:bg-[#008558]/20 text-slate-600 cursor-pointer"
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#008558] hover:bg-[#006b47] text-white rounded-lg py-4.5 font-semibold text-lg transition-all flex justify-center items-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 hover:-translate-y-0.5"
                >
                  {loading ? (
                    <><Loader2 className="w-6 h-6 animate-spin" /> Processing...</>
                  ) : (
                    <><Brain className="w-6 h-6" /> Continue to Review</>
                  )}
                </button>
              </form>
            )}

            {/* STEP 2: REVIEW */}
            {step === 2 && analysisData && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-10">
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-6 flex gap-4 items-start shadow-sm">
                    <CheckCircle2 className="w-7 h-7 text-emerald-500 flex-shrink-0 mt-0.5" />
                    <div>
                        <h3 className="font-semibold text-emerald-900 text-lg mb-1">Details Extracted Successfully!</h3>
                        <p className="text-emerald-700">Please review, edit, and add any missing details before finalizing your application. We will use these details to generate your final AI score.</p>
                    </div>
                </div>

                <div className="space-y-8">
                  <div>
                    <label className="block text-sm font-semibold mb-2 text-slate-700 uppercase tracking-wide">Full Name</label>
                    <input
                      type="text"
                      value={candidateName}
                      onChange={(e) => setCandidateName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-5 py-4 focus:outline-none focus:border-[#008558] focus:ring-1 focus:ring-[#008558] text-slate-800 transition-all font-medium"
                    />
                  </div>

                  <div className="grid sm:grid-cols-2 gap-8">
                    <div className="bg-slate-50 p-6 rounded-lg border border-slate-200">
                      <label className="block text-sm font-semibold mb-4 text-slate-700 uppercase tracking-wide">Skills</label>
                      <div className="flex flex-wrap gap-2 mb-4">
                          {skills.map((s: string, i: number) => (
                              <span key={i} className="flex items-center gap-1 bg-white border border-slate-200 pl-3 pr-2 py-1.5 rounded-lg text-sm text-slate-700 font-medium shadow-sm">
                                  {s}
                                  <button type="button" onClick={() => setSkills(skills.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-red-500">
                                    <X className="w-4 h-4" />
                                  </button>
                              </span>
                          ))}
                      </div>
                      <input 
                        type="text"
                        placeholder="Type a skill and press Enter..."
                        value={newSkill}
                        onChange={(e) => setNewSkill(e.target.value)}
                        onKeyDown={handleAddSkill}
                        className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-[#008558]"
                      />
                    </div>
                    
                    <div className="bg-slate-50 p-6 rounded-lg border border-slate-200">
                      <label className="block text-sm font-semibold mb-4 text-slate-700 uppercase tracking-wide">Programming Languages</label>
                      <div className="flex flex-wrap gap-2 mb-4">
                          {languages.map((lang: string, i: number) => (
                              <span key={i} className="flex items-center gap-1 bg-white border border-slate-200 pl-3 pr-2 py-1.5 rounded-lg text-sm text-[#008558] font-semibold shadow-sm">
                                  {lang}
                                  <button type="button" onClick={() => setLanguages(languages.filter((_, idx) => idx !== i))} className="text-[#008558]/60 hover:text-red-500">
                                    <X className="w-4 h-4" />
                                  </button>
                              </span>
                          ))}
                      </div>
                      <input 
                        type="text"
                        placeholder="Type a language and press Enter..."
                        value={newLang}
                        onChange={(e) => setNewLang(e.target.value)}
                        onKeyDown={handleAddLang}
                        className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-[#008558]"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-4 mt-4">
                        <div className="flex items-center gap-4">
                            <label className="block text-sm font-semibold text-slate-700 uppercase tracking-wide">Experience History</label>
                            <div className="flex items-center gap-2">
                                <label className="text-xs font-bold text-slate-500 uppercase">Total Years:</label>
                                <input type="number" step="0.1" value={totalExpYears} onChange={(e) => setTotalExpYears(parseFloat(e.target.value) || 0)} className="w-20 bg-white border border-slate-200 rounded-md px-2 py-1 text-sm font-semibold text-[#008558] focus:outline-none focus:border-[#008558]" />
                            </div>
                        </div>
                        <button type="button" onClick={() => setExperience([...experience, { job_title: "", company: "", start_date: "", end_date: "", responsibilities: [] }])} className="text-sm text-[#008558] font-semibold flex items-center gap-1 hover:underline">
                            <Plus className="w-4 h-4" /> Add Experience
                        </button>
                    </div>
                    <div className="space-y-4">
                        {experience.map((exp: any, i: number) => (
                            <div key={i} className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm relative">
                                <button type="button" onClick={() => setExperience(experience.filter((_, idx) => idx !== i))} className="absolute top-4 right-4 text-slate-400 hover:text-red-500">
                                    <X className="w-5 h-5" />
                                </button>
                                <div className="grid grid-cols-2 gap-4 mb-4">
                                    <input placeholder="Job Title" value={exp.job_title || ''} onChange={(e) => { const newExp = [...experience]; newExp[i].job_title = e.target.value; setExperience(newExp); }} className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-sm font-bold text-slate-800" />
                                    <input placeholder="Company" value={exp.company || ''} onChange={(e) => { const newExp = [...experience]; newExp[i].company = e.target.value; setExperience(newExp); }} className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-sm font-semibold text-[#008558]" />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <input placeholder="Start Date (e.g. 01/2020)" value={exp.start_date || ''} onChange={(e) => { const newExp = [...experience]; newExp[i].start_date = e.target.value; setExperience(newExp); }} className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-500" />
                                    <input placeholder="End Date (e.g. Present)" value={exp.end_date || ''} onChange={(e) => { const newExp = [...experience]; newExp[i].end_date = e.target.value; setExperience(newExp); }} className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-500" />
                                </div>
                            </div>
                        ))}
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="flex justify-between items-center mb-4">
                        <label className="block text-sm font-semibold text-slate-700 uppercase tracking-wide">Education</label>
                        <button type="button" onClick={() => setEducation([...education, { degree: "", field: "", institution: "", year: "" }])} className="text-sm text-[#008558] font-semibold flex items-center gap-1 hover:underline">
                            <Plus className="w-4 h-4" /> Add Education
                        </button>
                    </div>
                    <div className="space-y-4">
                        {education.map((edu: any, i: number) => (
                            <div key={i} className="bg-slate-50 border border-slate-200 rounded-lg p-5 relative">
                                <button type="button" onClick={() => setEducation(education.filter((_, idx) => idx !== i))} className="absolute top-4 right-4 text-slate-400 hover:text-red-500">
                                    <X className="w-4 h-4" />
                                </button>
                                <div className="grid grid-cols-2 gap-4 mb-3">
                                    <input placeholder="Degree (e.g. BSc)" value={edu.degree || ''} onChange={(e) => { const newEdu = [...education]; newEdu[i].degree = e.target.value; setEducation(newEdu); }} className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-sm font-bold text-slate-800" />
                                    <input placeholder="Field (e.g. Computer Science)" value={edu.field || ''} onChange={(e) => { const newEdu = [...education]; newEdu[i].field = e.target.value; setEducation(newEdu); }} className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-sm font-medium text-slate-500" />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <input placeholder="Institution" value={edu.institution || ''} onChange={(e) => { const newEdu = [...education]; newEdu[i].institution = e.target.value; setEducation(newEdu); }} className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-sm font-medium text-slate-600" />
                                    <input placeholder="Year (e.g. 2022)" value={edu.year || ''} onChange={(e) => { const newEdu = [...education]; newEdu[i].year = e.target.value; setEducation(newEdu); }} className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-sm font-medium text-slate-600" />
                                </div>
                            </div>
                        ))}
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-8">
                    <div className="bg-slate-50 p-6 rounded-lg border border-slate-200">
                      <label className="block text-sm font-semibold mb-4 text-slate-700 uppercase tracking-wide">Publications</label>
                      <div className="flex flex-wrap gap-2 mb-4">
                          {publications.map((p: string, i: number) => (
                              <span key={i} className="flex items-center gap-1 bg-white border border-slate-200 pl-3 pr-2 py-1.5 rounded-lg text-sm text-slate-700 font-medium shadow-sm">
                                  {p}
                                  <button type="button" onClick={() => setPublications(publications.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-red-500">
                                    <X className="w-4 h-4" />
                                  </button>
                              </span>
                          ))}
                      </div>
                      <input 
                        type="text"
                        placeholder="Type a publication and press Enter..."
                        value={newPublication}
                        onChange={(e) => setNewPublication(e.target.value)}
                        onKeyDown={handleAddPublication}
                        className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-[#008558]"
                      />
                    </div>
                    
                    <div className="bg-slate-50 p-6 rounded-lg border border-slate-200">
                      <label className="block text-sm font-semibold mb-4 text-slate-700 uppercase tracking-wide">Achievements</label>
                      <div className="flex flex-wrap gap-2 mb-4">
                          {achievements.map((a: string, i: number) => (
                              <span key={i} className="flex items-center gap-1 bg-white border border-slate-200 pl-3 pr-2 py-1.5 rounded-lg text-sm text-[#008558] font-semibold shadow-sm">
                                  {a}
                                  <button type="button" onClick={() => setAchievements(achievements.filter((_, idx) => idx !== i))} className="text-[#008558]/60 hover:text-red-500">
                                    <X className="w-4 h-4" />
                                  </button>
                              </span>
                          ))}
                      </div>
                      <input 
                        type="text"
                        placeholder="Type an achievement and press Enter..."
                        value={newAchievement}
                        onChange={(e) => setNewAchievement(e.target.value)}
                        onKeyDown={handleAddAchievement}
                        className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-[#008558]"
                      />
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-8">
                    <div className="bg-slate-50 p-6 rounded-lg border border-slate-200">
                      <label className="block text-sm font-semibold mb-4 text-slate-700 uppercase tracking-wide">Projects</label>
                      <div className="flex flex-col gap-2 mb-4">
                          {projects.map((p: string, i: number) => (
                              <div key={i} className="flex items-start gap-2 bg-white border border-slate-200 p-3 rounded-lg text-sm text-slate-700 font-medium shadow-sm">
                                  <span className="flex-1">{p}</span>
                                  <button type="button" onClick={() => setProjects(projects.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-red-500 mt-0.5">
                                    <X className="w-4 h-4" />
                                  </button>
                              </div>
                          ))}
                      </div>
                      <input 
                        type="text"
                        placeholder="Type a project and press Enter..."
                        value={newProject}
                        onChange={(e) => setNewProject(e.target.value)}
                        onKeyDown={handleAddProject}
                        className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-[#008558]"
                      />
                    </div>
                    
                    <div className="bg-slate-50 p-6 rounded-lg border border-slate-200">
                      <label className="block text-sm font-semibold mb-4 text-slate-700 uppercase tracking-wide">Certifications</label>
                      <div className="flex flex-col gap-2 mb-4">
                          {certifications.map((c: string, i: number) => (
                              <div key={i} className="flex items-start gap-2 bg-white border border-slate-200 p-3 rounded-lg text-sm text-[#008558] font-semibold shadow-sm">
                                  <span className="flex-1">{c}</span>
                                  <button type="button" onClick={() => setCertifications(certifications.filter((_, idx) => idx !== i))} className="text-[#008558]/60 hover:text-red-500 mt-0.5">
                                    <X className="w-4 h-4" />
                                  </button>
                              </div>
                          ))}
                      </div>
                      <input 
                        type="text"
                        placeholder="Type a certification and press Enter..."
                        value={newCertification}
                        onChange={(e) => setNewCertification(e.target.value)}
                        onKeyDown={handleAddCertification}
                        className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-[#008558]"
                      />
                    </div>
                  </div>

                </div>

                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="w-full bg-[#008558] hover:bg-[#006b47] text-white rounded-lg py-4.5 font-semibold text-lg transition-all flex justify-center items-center gap-3 mt-12 shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <>Finalize & Analyze Profile <ArrowRight className="w-6 h-6" /></>}
                </button>
              </motion.div>
            )}

            {/* STEP 3: SUCCESS */}
            {step === 3 && (
                <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center py-16">
                    <div className="w-24 h-24 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-8 ring-8 ring-emerald-50/50">
                        <CheckCircle2 className="w-12 h-12" />
                    </div>
                    <h2 className="text-3xl font-outfit font-bold mb-4 text-slate-900">Application Submitted!</h2>
                    <p className="text-slate-500 mb-10 max-w-md mx-auto text-lg">
                        Your profile was successfully analyzed and your application has been received securely.
                    </p>
                    <button
                      onClick={() => router.push('/profile')}
                      className="bg-slate-900 hover:bg-slate-800 text-white font-semibold flex items-center justify-center gap-2 mx-auto px-8 py-4 rounded-lg transition-all shadow-md hover:-translate-y-0.5"
                    >
                      View My Profile <ArrowRight className="w-5 h-5" />
                    </button>
                </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
