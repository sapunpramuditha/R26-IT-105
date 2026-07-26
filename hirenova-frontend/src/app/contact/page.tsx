"use client";

import { motion } from "framer-motion";
import { Mail, Phone, MapPin, Send, CheckCircle2, Loader2 } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import Swal from 'sweetalert2';

export default function ContactPage() {
  const [formData, setFormData] = useState({ name: "", email: "", company: "", message: "" });
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const handleContactSubmit = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    setStatus("");

    try {
      await api.post('/contact', formData);
      Swal.fire({
        icon: 'success',
        title: 'Message Sent!',
        text: 'Our team will get back to you shortly.',
        confirmButtonColor: '#008558'
      });
      setFormData({ name: "", email: "", company: "", message: "" });
    } catch (err: any) {
      console.error(err);
      Swal.fire({
        icon: 'error',
        title: 'Oops...',
        text: err.response?.data?.error || 'Failed to send message. Please try again.',
        confirmButtonColor: '#008558'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-50 min-h-screen py-20 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 -translate-y-12 inset-x-0 h-[400px] bg-emerald-/50 blur-[120px] rounded-lg pointer-events-none" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-16 lg:mb-20">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-6xl font-outfit font-semibold text-slate-900 mb-6 tracking-tight"
          >
            Let's Start a <span className="text-[#008558]">Conversation</span>
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-lg md:text-xl text-slate-600 leading-relaxed"
          >
            Whether you have a question about features, trials, pricing, need a demo, or anything else, our team is ready to answer all your questions.
          </motion.p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8 lg:gap-12 max-w-6xl mx-auto">
          {/* Contact Form */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="lg:col-span-2 bg-white p-8 md:p-12 rounded-lg border border-slate-200 shadow-xl"
          >
            <h2 className="text-2xl font-semibold font-outfit text-slate-900 mb-8">Send us a message</h2>
            <form onSubmit={handleContactSubmit} className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 ml-1">Full Name</label>
                  <input type="text" required value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-5 py-4 focus:outline-none focus:border-emerald- focus:ring-4 focus:ring-emerald-/10 transition-all text-slate-900 placeholder:text-slate-400 font-medium" placeholder="Jane Doe" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 ml-1">Work Email</label>
                  <input type="email" required value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-5 py-4 focus:outline-none focus:border-emerald- focus:ring-4 focus:ring-emerald-/10 transition-all text-slate-900 placeholder:text-slate-400 font-medium" placeholder="jane@company.com" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 ml-1">Company (Optional)</label>
                <input type="text" value={formData.company} onChange={(e) => setFormData({...formData, company: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-5 py-4 focus:outline-none focus:border-emerald- focus:ring-4 focus:ring-emerald-/10 transition-all text-slate-900 placeholder:text-slate-400 font-medium" placeholder="Acme Corp" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 ml-1">How can we help?</label>
                <textarea rows={5} required value={formData.message} onChange={(e) => setFormData({...formData, message: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-5 py-4 focus:outline-none focus:border-emerald- focus:ring-4 focus:ring-emerald-/10 transition-all text-slate-900 placeholder:text-slate-400 font-medium resize-none" placeholder="Tell us about your hiring needs..." />
              </div>
              <button disabled={loading} type="submit" className="w-full md:w-auto px-10 group flex items-center justify-center gap-3 bg-[#008558] hover:bg-[#006b47] text-white rounded-lg py-4 font-semibold text-lg transition-all shadow-lg shadow-emerald-/20 active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 group-hover:-translate-y-1 group-hover:translate-x-1 transition-transform" />} 
                {loading ? 'Sending...' : 'Send Message'}
              </button>
            </form>
          </motion.div>

          {/* Contact Info Sidebar */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="lg:col-span-1 space-y-6 lg:space-y-8"
          >
            <div className="bg-white p-8 rounded-lg border border-slate-200 shadow-sm flex items-start gap-4">
              <div className="w-12 h-12 bg-emerald- rounded-lg flex items-center justify-center text-[#008558] shrink-0">
                <Mail className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold font-outfit text-slate-900 mb-1">Email Us</h3>
                <p className="text-slate-500 text-sm mb-3">Our friendly team is here to help.</p>
                <a href="mailto:Yasasdewanga@gmail.com" className="text-[#008558] font-semibold hover:underline">Yasasdewanga@gmail.com</a>
              </div>
            </div>

            <div className="bg-white p-8 rounded-lg border border-slate-200 shadow-sm flex items-start gap-4">
              <div className="w-12 h-12 bg-emerald- rounded-lg flex items-center justify-center text-[#008558] shrink-0">
                <MapPin className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold font-outfit text-slate-900 mb-1">Visit Us</h3>
                <p className="text-slate-500 text-sm mb-3">Come say hello at our office HQ.</p>
                <p className="text-slate-700 font-medium">123 Innovation Drive<br/>Tech City, CA 94043</p>
              </div>
            </div>

            <div className="bg-white p-8 rounded-lg border border-slate-200 shadow-sm flex items-start gap-4">
              <div className="w-12 h-12 bg-emerald- rounded-lg flex items-center justify-center text-[#008558] shrink-0">
                <Phone className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold font-outfit text-slate-900 mb-1">Call Us</h3>
                <p className="text-slate-500 text-sm mb-3">Mon-Fri from 8am to 5pm.</p>
                <p className="text-slate-700 font-medium">+1 (555) 123-4567</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
