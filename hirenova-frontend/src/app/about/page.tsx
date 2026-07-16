"use client";

import { motion } from "framer-motion";
import { Users, Target, Zap, ShieldCheck, ArrowRight, MapPin } from "lucide-react";
import Link from "next/link";

export default function AboutPage() {
  return (
    <div className="bg-white min-h-screen py-20 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 -translate-y-12 inset-x-0 h-[400px] bg-emerald-/30 blur-[120px] rounded-lg pointer-events-none" />

      {/* Hero Section */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center mb-20 relative z-10">
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl md:text-6xl lg:text-7xl font-outfit font-semibold text-slate-900 mb-6 tracking-tight leading-[1.1]"
        >
          Redefining Hiring with <br />
          <span className="text-[#008558]">Artificial Intelligence</span>
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-lg md:text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed"
        >
          At HireNova, our mission is to eliminate bias, reduce time-to-hire, and uncover the true potential of every candidate through advanced machine learning and objective data analysis.
        </motion.p>
      </div>

      {/* Stats/Values Section */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mb-24 relative z-10">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
          {[
            { icon: Users, title: "Objective Matching", desc: "We evaluate skills, not just keywords, ensuring fair opportunities." },
            { icon: Zap, title: "Speed & Efficiency", desc: "Reduce your time-to-hire by up to 70% with automated screening." },
            { icon: Target, title: "Precision Accuracy", desc: "Our AI models analyze GitHub activity and interview responses deeply." },
            { icon: ShieldCheck, title: "Enterprise Security", desc: "Bank-grade encryption for all candidate data and video recordings." }
          ].map((item, idx) => (
            <motion.div 
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1 }}
              className="bg-white p-8 rounded-lg border border-slate-200 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all"
            >
              <div className="w-12 h-12 bg-emerald- rounded-lg flex items-center justify-center mb-6 text-[#008558]">
                <item.icon className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-semibold font-outfit text-slate-900 mb-3">{item.title}</h3>
              <p className="text-slate-500 leading-relaxed text-sm md:text-base">{item.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Our Story Section */}
      <div className="bg-slate-50 border-y border-slate-200 py-20 lg:py-28 relative z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <div className="order-2 lg:order-1">
              <h2 className="text-3xl lg:text-4xl font-semibold font-outfit text-slate-900 mb-6 lg:mb-8">Our Story</h2>
              <div className="prose prose-slate prose-lg max-w-none text-slate-600 space-y-6">
                <p>
                  HireNova was founded by a team of engineers and recruiters who were frustrated by the inefficiencies of traditional hiring. We noticed that great candidates were slipping through the cracks because their resumes didn't perfectly match a recruiter's keyword search.
                </p>
                <p>
                  Meanwhile, companies spent countless hours manually screening portfolios and conducting redundant initial interviews. We decided to build a platform that focuses on what actually matters: <strong>demonstrated ability and potential.</strong>
                </p>
                <p>
                  Today, HireNova powers the recruitment pipelines of some of the most innovative companies in the world, helping them build stronger, more diverse engineering teams in a fraction of the time.
                </p>
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <div className="relative rounded-lg overflow-hidden shadow-2xl border border-slate-200 group">
                <img src="/about_office.png" alt="HireNova Office" className="w-full h-[400px] lg:h-[500px] object-cover group-hover:scale-105 transition-transform duration-700" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent"></div>
                <div className="absolute bottom-6 left-6 text-white font-outfit font-medium text-lg flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-[#008558]" /> Tech City HQ
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Meet the Team Section */}
      <div className="py-20 lg:py-28 relative z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <div>
              <div className="relative rounded-lg overflow-hidden shadow-2xl border border-slate-200 group">
                <img src="/about_team.png" alt="HireNova Team" className="w-full h-[400px] lg:h-[500px] object-cover group-hover:scale-105 transition-transform duration-700" />
                <div className="absolute inset-0 bg-emerald-/10 mix-blend-overlay"></div>
              </div>
            </div>
            <div>
              <h2 className="text-3xl lg:text-4xl font-semibold font-outfit text-slate-900 mb-6 lg:mb-8">Meet the Innovators</h2>
              <p className="text-lg text-slate-600 mb-8 leading-relaxed">
                Behind every intelligent algorithm and seamless user experience is our dedicated team of visionaries. We are a diverse collective of AI researchers, seasoned recruiters, and passionate software engineers united by a single goal: to make hiring fair, fast, and remarkably effective.
              </p>
              <div className="grid grid-cols-2 gap-6">
                <div className="bg-slate-50 p-6 rounded-lg border border-slate-200">
                  <h4 className="text-3xl font-outfit font-bold text-[#008558] mb-2">50+</h4>
                  <p className="text-slate-600 font-medium">Team Members</p>
                </div>
                <div className="bg-slate-50 p-6 rounded-lg border border-slate-200">
                  <h4 className="text-3xl font-outfit font-bold text-[#008558] mb-2">10+</h4>
                  <p className="text-slate-600 font-medium">Countries Represented</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* CTA Section (Matching Homepage) */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 pb-10">
        <div className="bg-slate-900 rounded-lg p-12 md:p-16 text-center shadow-2xl relative overflow-hidden">
          {/* Subtle glow effect in the background */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#008558]/10 rounded-full blur-[120px] pointer-events-none"></div>
          
          <div className="relative z-10">
            <h2 className="text-3xl md:text-5xl font-outfit font-semibold text-white mb-6 leading-[1.2] max-w-3xl mx-auto">
              Ready to transform your hiring process?
            </h2>
            <p className="text-slate-300 text-lg mb-10 max-w-2xl mx-auto">
              Join thousands of companies already using HireNova to discover top talent through intelligent automation.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/admin/dashboard/jobs/create" className="bg-[#008558] hover:bg-[#006b47] text-white px-8 py-3.5 rounded-lg font-semibold transition-colors shadow-lg shadow-emerald-/20 w-full sm:w-auto text-[15px] flex items-center justify-center gap-2">
                Post a Job <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/contact" className="bg-white hover:bg-slate-50 text-slate-800 px-8 py-3.5 rounded-lg font-semibold transition-colors shadow-sm w-full sm:w-auto text-[15px] flex items-center justify-center">
                Get in Touch
              </Link>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
