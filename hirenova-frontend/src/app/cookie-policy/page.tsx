import React from 'react';

export const metadata = {
  title: 'Cookie Policy | HireNova',
  description: 'Cookie Policy for HireNova',
};

export default function CookiePolicyPage() {
  return (
    <div className="bg-slate-50 min-h-screen">
      <div className="max-w-6xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-semibold text-slate-900 mb-8 font-outfit">Cookie Policy</h1>
        
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8 prose prose-slate max-w-none text-slate-600">
          <p className="mb-6">
            Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </p>
          
          <h2 className="text-2xl font-semibold text-slate-800 mb-4 font-outfit mt-8">1. Introduction</h2>
          <p className="mb-4">
            This Cookie Policy explains how HireNova ("we", "us", or "our") uses cookies and similar technologies to recognize you when you visit our website. It explains what these technologies are and why we use them, as well as your rights to control our use of them.
          </p>

          <h2 className="text-2xl font-semibold text-slate-800 mb-4 font-outfit mt-8">2. What are cookies?</h2>
          <p className="mb-4">
            Cookies are small data files that are placed on your computer or mobile device when you visit a website. Cookies are widely used by website owners in order to make their websites work, or to work more efficiently, as well as to provide reporting information.
          </p>

          <h2 className="text-2xl font-semibold text-slate-800 mb-4 font-outfit mt-8">3. Why do we use cookies?</h2>
          <p className="mb-4">
            We use first-party and third-party cookies for several reasons. Some cookies are required for technical reasons in order for our website to operate, and we refer to these as "essential" or "strictly necessary" cookies. Other cookies also enable us to track and target the interests of our users to enhance the experience on our online properties.
          </p>

          <h2 className="text-2xl font-semibold text-slate-800 mb-4 font-outfit mt-8">4. Types of Cookies We Use</h2>
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li><strong>Essential Cookies:</strong> These cookies are strictly necessary to provide you with services available through our website and to use some of its features, such as access to secure areas (e.g., your authentication tokens).</li>
            <li><strong>Performance and Functionality Cookies:</strong> These cookies are used to enhance the performance and functionality of our website but are non-essential to their use.</li>
            <li><strong>Analytics and Customization Cookies:</strong> These cookies collect information that is used either in aggregate form to help us understand how our website is being used or how effective our marketing campaigns are.</li>
          </ul>

          <h2 className="text-2xl font-semibold text-slate-800 mb-4 font-outfit mt-8">5. How can I control cookies?</h2>
          <p className="mb-4">
            You have the right to decide whether to accept or reject cookies. You can set or amend your web browser controls to accept or refuse cookies. If you choose to reject cookies, you may still use our website though your access to some functionality and areas of our website may be restricted.
          </p>

          <p className="mt-8 font-medium">
            If you have any questions about our use of cookies or other technologies, please email us at privacy@hirenova.com.
          </p>
        </div>
      </div>
    </div>
  );
}
