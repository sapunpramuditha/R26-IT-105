import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function TermsPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-600 mb-8 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Home
      </Link>
      
      <div className="bg-white rounded-lg p-8 md:p-12 border border-slate-200 shadow-sm">
        <h1 className="text-4xl font-outfit font-semibold text-slate-900 mb-4">Terms of Service</h1>
        <p className="text-slate-500 mb-8">Last updated: {new Date().toLocaleDateString()}</p>
        
        <div className="prose prose-slate max-w-none">
          <p>
            Welcome to HireNova. By accessing or using our platform, you agree to be bound by these Terms of Service. If you disagree with any part of the terms, you may not access the service.
          </p>
          
          <h3 className="text-xl font-semibold text-slate-800 mt-8 mb-4">1. Description of Service</h3>
          <p>
            HireNova is an AI-powered recruitment platform that facilitates connections between employers and job candidates. Our services include resume parsing, AI-based matching, and automated video interviews.
          </p>

          <h3 className="text-xl font-semibold text-slate-800 mt-8 mb-4">2. User Accounts</h3>
          <p>
            When you create an account with us, you must provide us information that is accurate, complete, and current at all times. Failure to do so constitutes a breach of the Terms, which may result in immediate termination of your account on our Service.
          </p>

          <h3 className="text-xl font-semibold text-slate-800 mt-8 mb-4">3. Intellectual Property</h3>
          <p>
            The Service and its original content, features and functionality are and will remain the exclusive property of HireNova and its licensors. The Service is protected by copyright, trademark, and other laws of both the United States and foreign countries.
          </p>

          <h3 className="text-xl font-semibold text-slate-800 mt-8 mb-4">4. Limitation of Liability</h3>
          <p>
            In no event shall HireNova, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your access to or use of or inability to access or use the Service.
          </p>
        </div>
      </div>
    </div>
  );
}
