import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-600 mb-8 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Home
      </Link>
      
      <div className="bg-white rounded-lg p-8 md:p-12 border border-slate-200 shadow-sm">
        <h1 className="text-4xl font-outfit font-semibold text-slate-900 mb-4">Privacy Policy</h1>
        <p className="text-slate-500 mb-8">Last updated: {new Date().toLocaleDateString()}</p>
        
        <div className="prose prose-slate max-w-none">
          <p>
            At HireNova, we take your privacy seriously. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website and use our AI recruitment platform.
          </p>
          
          <h3 className="text-xl font-semibold text-slate-800 mt-8 mb-4">1. Information We Collect</h3>
          <p>
            We may collect personal identification information from Users in a variety of ways, including, but not limited to, when Users visit our site, register on the site, upload resumes, connect GitHub accounts, and in connection with other activities, services, features or resources we make available on our Site.
          </p>

          <h3 className="text-xl font-semibold text-slate-800 mt-8 mb-4">2. How We Use Collected Information</h3>
          <p>
            HireNova may collect and use Users' personal information for the following purposes:
          </p>
          <ul className="list-disc pl-6 space-y-2 mt-4">
            <li><strong>To run and operate our Site:</strong> We may need your information display content on the Site correctly.</li>
            <li><strong>To improve customer service:</strong> Information you provide helps us respond to your customer service requests and support needs more efficiently.</li>
            <li><strong>To personalize user experience:</strong> We may use information in the aggregate to understand how our Users as a group use the services and resources provided on our Site.</li>
            <li><strong>AI Analysis:</strong> We use your uploaded resumes and GitHub data to run machine learning models to assess job fit and extract skills.</li>
          </ul>

          <h3 className="text-xl font-semibold text-slate-800 mt-8 mb-4">3. Data Security</h3>
          <p>
            We adopt appropriate data collection, storage and processing practices and security measures to protect against unauthorized access, alteration, disclosure or destruction of your personal information, username, password, transaction information and data stored on our Site.
          </p>

          <h3 className="text-xl font-semibold text-slate-800 mt-8 mb-4">4. Sharing Your Personal Information</h3>
          <p>
            We do not sell, trade, or rent Users personal identification information to others. We may share generic aggregated demographic information not linked to any personal identification information regarding visitors and users with our business partners, trusted affiliates and advertisers for the purposes outlined above.
          </p>
        </div>
      </div>
    </div>
  );
}
