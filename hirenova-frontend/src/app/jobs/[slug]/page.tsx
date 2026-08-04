"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, Briefcase, MapPin, Clock, CheckCircle2, Loader2, ArrowRight, Share2, Zap, Building2, Calendar, Target } from "lucide-react";
import { getJobBySlug } from "@/lib/api";

export default function JobDetailPage() {
  const { slug } = useParams();
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchJob = async () => {
      try {
        const res = await getJobBySlug(slug as string);
        setJob(res.data.data);
      } catch (error) {
        console.error("Job not found", error);
      } finally {
        setLoading(false);
      }
    };
    fetchJob();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-indigo-200 rounded-full animate-pulse"></div>
            <div className="w-16 h-16 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin absolute top-0 left-0"></div>
          </div>
          <p className="text-indigo-600 font-medium animate-pulse">Loading amazing opportunity...</p>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-xl text-center">
          <div className="w-20 h-20 bg-red-50 text-red-500 rounded-lg flex items-center justify-center mx-auto mb-6">
            <Briefcase className="w-10 h-10" />
          </div>
          <h1 className="text-3xl font-outfit font-semibold text-slate-800 mb-4">Job Not Found</h1>
          <p className="text-slate-500 mb-8">The position you're looking for might have been closed or doesn't exist.</p>
          <Link href="/jobs" className="inline-flex items-center justify-center gap-2 w-full bg-slate-900 text-white py-3.5 rounded-lg font-semibold hover:bg-slate-800 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Return to all jobs
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#f8fafc] min-h-screen pb-24 selection:bg-indigo-100 selection:text-indigo-900">
      {/* Modern Hero Section */}
      <div 
        className="relative text-white overflow-hidden py-16 lg:py-24"
        style={{ backgroundImage: "url('/dark_hero_bg.png')", backgroundSize: 'cover', backgroundPosition: 'center' }}
      >
        {/* Dark overlay for readability */}
        <div className="absolute inset-0 bg-slate-900/75 mix-blend-multiply"></div>
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px]"></div>


        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-10">
            <div className="flex-1">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center gap-3 mb-6">
                <span className="px-4 py-1.5 bg-emerald-500/20 text-emerald-300 text-xs font-semibold rounded-lg uppercase tracking-wider border border-emerald-500/30 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" /> Actively Hiring
                </span>
                <span className="px-4 py-1.5 bg-white/10 text-slate-300 text-xs font-semibold rounded-lg border border-white/10 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" /> Posted recently
                </span>
              </motion.div>
              
              <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="text-4xl md:text-5xl lg:text-6xl font-outfit font-semibold text-white mb-6 tracking-tight leading-tight">
                {job.title}
              </motion.h1>
              
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="flex flex-wrap items-center gap-y-4 gap-x-8 text-slate-300 font-medium">
                <div className="flex items-center gap-2.5 bg-white/5 px-4 py-2 rounded-lg border border-white/10">
                  <Building2 className="w-5 h-5 text-[#008558]" /> 
                  <span>{job.domain}</span>
                </div>
                <div className="flex items-center gap-2.5 bg-white/5 px-4 py-2 rounded-lg border border-white/10">
                  <MapPin className="w-5 h-5 text-indigo-400" /> 
                  <span>{job.location || 'Colombo'}</span>
                </div>
                <div className="flex items-center gap-2.5 bg-white/5 px-4 py-2 rounded-lg border border-white/10">
                  <Clock className="w-5 h-5 text-emerald-400" /> 
                  <span>{job.min_experience_years}+ Years Exp.</span>
                </div>
              </motion.div>
            </div>
            
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }} className="flex flex-col sm:flex-row gap-4">
              <button className="flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white px-6 py-4 rounded-lg font-semibold transition-all border border-white/10 backdrop-blur-md">
                <Share2 className="w-5 h-5" /> Share
              </button>
              <Link 
                href={`/jobs/${job.slug}/apply`}
                className="group relative inline-flex items-center justify-center gap-2 bg-gradient-to-r from-[#008558] to-emerald- hover:from-emerald- hover:to-[#008558] text-white px-10 py-4 rounded-lg font-semibold transition-all shadow-[0_0_40px_rgba(240,108,58,0.4)] hover:shadow-[0_0_60px_rgba(240,108,58,0.6)] hover:-translate-y-1 overflow-hidden"
              >
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out"></div>
                <span className="relative z-10 text-lg">Apply Now</span>
                <ArrowRight className="w-5 h-5 relative z-10 group-hover:translate-x-1 transition-transform" />
              </Link>
            </motion.div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8 relative z-20">
        <div className="grid lg:grid-cols-3 gap-8 lg:gap-12">
          {/* Main Content */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="lg:col-span-2 space-y-8">
            <section className="bg-white p-8 md:p-12 rounded-lg border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-indigo-500 to-purple-500"></div>
              <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600">
                  <Target className="w-6 h-6" />
                </div>
                <h2 className="text-3xl font-semibold text-slate-900 font-outfit">About the Role</h2>
              </div>
              <div 
                className="prose prose-slate prose-lg max-w-none text-slate-600 leading-relaxed prose-headings:font-outfit prose-headings:font-semibold prose-headings:text-slate-900 prose-a:text-indigo-600 hover:prose-a:text-indigo-500"
                dangerouslySetInnerHTML={{ __html: job.description }}
              />
            </section>
          </motion.div>

          {/* Sidebar */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="lg:col-span-1 space-y-6">
            
            {/* Required Skills Card */}
            <div className="bg-white p-8 rounded-lg border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] sticky top-28">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-semibold text-slate-900 font-outfit">Must Haves</h3>
              </div>
              
              <div className="flex flex-wrap gap-2.5">
                {job.required_skills?.map((skill: string) => (
                  <span key={skill} className="px-4 py-2 bg-slate-50 border border-slate-200 text-slate-700 font-semibold rounded-lg text-sm shadow-sm hover:border-emerald-300 hover:bg-emerald-50 transition-colors">
                    {skill}
                  </span>
                ))}
              </div>

              {job.preferred_skills?.length > 0 && (
                <>
                  <div className="w-full h-px bg-slate-100 my-8"></div>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600">
                      <Zap className="w-5 h-5" />
                    </div>
                    <h3 className="text-xl font-semibold text-slate-900 font-outfit">Nice to Haves</h3>
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {job.preferred_skills?.map((skill: string) => (
                      <span key={skill} className="px-4 py-2 bg-slate-50 border border-slate-200 text-slate-600 font-medium rounded-lg text-sm hover:border-indigo-300 hover:bg-indigo-50 transition-colors">
                        {skill}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>

          </motion.div>
        </div>
      </div>
    </div>
  );
}
