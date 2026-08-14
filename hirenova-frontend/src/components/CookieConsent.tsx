"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import Cookies from "js-cookie";

export default function CookieConsent() {
  const [showConsent, setShowConsent] = useState(false);

  useEffect(() => {
    // Check if the user has already accepted cookies
    const hasConsented = Cookies.get("cookie_consent");
    if (!hasConsented) {
      setShowConsent(true);
    }
  }, []);

  const acceptCookies = () => {
    Cookies.set("cookie_consent", "true", { expires: 365 });
    setShowConsent(false);
  };

  const acceptEssentialOnly = () => {
    Cookies.set("cookie_consent", "essential", { expires: 365 });
    setShowConsent(false);
  };

  return (
    <AnimatePresence>
      {showConsent && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="fixed bottom-0 left-0 w-full z-[100] p-4 md:p-6 pointer-events-none"
        >
          <div className="max-w-6xl mx-auto pointer-events-auto">
            <div className="bg-slate-900 border border-slate-700 shadow-2xl rounded-2xl p-5 md:p-6 flex flex-col md:flex-row items-center justify-between gap-5">
              <div className="text-slate-300 text-sm leading-6 flex-1">
                <span className="block text-white font-bold mb-1">Your privacy choices</span>
                We use essential cookies to keep HireNova working and optional cookies to improve the experience. Read our{" "}
                <Link href="/cookie-policy" className="text-[#008558] hover:underline font-medium">
                  Cookie Policy
                </Link>{" "}
                for more information.
              </div>
              <div className="flex items-center gap-4 shrink-0 w-full md:w-auto">
                <button 
                  onClick={acceptEssentialOnly}
                  className="px-5 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors font-semibold text-sm w-full md:w-auto"
                >
                  Essential only
                </button>
                <button 
                  onClick={acceptCookies} 
                  className="px-5 py-2.5 rounded-xl bg-[#008558] hover:bg-[#006b47] text-white transition-colors font-bold text-sm w-full md:w-auto shadow-lg shadow-black/20"
                >
                  Accept optional
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
