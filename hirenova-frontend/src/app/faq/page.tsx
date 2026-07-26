"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, MessageCircleQuestion } from "lucide-react";
import Link from "next/link";

const faqs = [
  {
    question: "What is HireNova?",
    answer: "HireNova is an AI-powered hiring platform that automates resume parsing, skill matching, and video interviews to help you find the best talent faster and without bias."
  },
  {
    question: "How does the AI matching work?",
    answer: "Our proprietary AI analyzes a candidate's resume, github activity, and previous experience to identify their true potential, rather than just matching keywords. It scores candidates against your job requirements objectively."
  },
  {
    question: "Is candidate data secure?",
    answer: "Yes! We employ bank-grade encryption for all candidate data and video recordings. Please visit our Security Setup page for detailed technical information on how we protect your privacy."
  },
  {
    question: "Can I use HireNova alongside my current ATS?",
    answer: "Absolutely. HireNova is designed to integrate seamlessly into modern HR workflows. While we provide a robust dashboard, you can export candidate data to your existing Applicant Tracking System."
  },
  {
    question: "How much does it cost?",
    answer: "We offer tailored pricing based on the size of your organization and the volume of hires. Please contact our sales team for a custom quote that fits your needs."
  },
  {
    question: "Can I cancel my subscription at any time?",
    answer: "Yes, our monthly plans are completely flexible. You can upgrade, downgrade, or cancel your subscription at any time from your account settings without any hidden fees."
  },
  {
    question: "Do you offer technical support for setup?",
    answer: "We provide comprehensive onboarding support. Our Enterprise customers receive a dedicated Account Manager, while our Pro users have access to 24/7 priority technical support."
  },
  {
    question: "Is the video interviewing feature included in the base plan?",
    answer: "Asynchronous video interviewing is included in our Pro and Enterprise plans. It allows candidates to record answers on their own time, saving hours of initial screening calls for your recruiters."
  },
  {
    question: "How do candidates feel about AI interviews?",
    answer: "Based on our surveys, 85% of candidates prefer asynchronous AI interviews because it allows them to prepare in a low-pressure environment on their own schedule, eliminating scheduling conflicts."
  },
  {
    question: "Do you offer white-labeling?",
    answer: "Yes! Our Enterprise tier allows you to fully white-label the candidate portal, ensuring that applicants see your branding, colors, and logos throughout their entire application journey."
  }
];

export default function FAQPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col py-20 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 -translate-y-12 inset-x-0 h-[400px] bg-emerald-/50 blur-[120px] rounded-lg pointer-events-none" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 w-full relative z-10">
        <div className="text-center mb-16">
          <div className="w-16 h-16 bg-emerald- rounded-2xl flex items-center justify-center mx-auto mb-6 text-[#008558] shadow-sm border border-emerald-">
            <MessageCircleQuestion className="w-8 h-8" />
          </div>
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-5xl font-outfit font-semibold text-slate-900 mb-4 tracking-tight"
          >
            Frequently Asked Questions
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-lg text-slate-600 max-w-2xl mx-auto"
          >
            Everything you need to know about the product and billing. Can't find the answer you're looking for? Feel free to <Link href="/contact" className="text-[#008558] font-medium hover:underline">contact our team</Link>.
          </motion.p>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white border border-slate-200 rounded-lg shadow-sm divide-y divide-slate-100"
        >
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <div key={index} className="overflow-hidden">
                <button
                  onClick={() => toggleFAQ(index)}
                  className="w-full flex items-center justify-between p-6 md:p-8 text-left focus:outline-none hover:bg-slate-50 transition-colors"
                >
                  <span className={`text-lg font-medium font-outfit transition-colors ${isOpen ? 'text-[#008558]' : 'text-slate-800'}`}>
                    {faq.question}
                  </span>
                  <ChevronDown 
                    className={`w-5 h-5 text-slate-400 shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180 text-[#008558]' : ''}`} 
                  />
                </button>
                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                    >
                      <div className="px-6 md:px-8 pb-6 md:pb-8 text-slate-600 leading-relaxed">
                        {faq.answer}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </motion.div>

        {/* Bottom CTA */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-16 bg-slate-900 rounded-lg p-8 md:p-12 text-center shadow-xl relative overflow-hidden"
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#008558]/10 rounded-full blur-[100px] pointer-events-none"></div>
          <div className="relative z-10">
            <h3 className="text-2xl md:text-3xl font-outfit font-semibold text-white mb-4">Still have questions?</h3>
            <p className="text-slate-300 mb-8 max-w-xl mx-auto">
              Our dedicated support team is here to help you get the most out of HireNova.
            </p>
            <Link 
              href="/contact" 
              className="inline-flex items-center justify-center px-8 py-3.5 bg-[#008558] hover:bg-[#006b47] text-white rounded-lg font-semibold transition-all shadow-lg shadow-emerald-/20 active:scale-[0.98]"
            >
              Get in Touch
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
