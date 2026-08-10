import React from 'react';
import { Shield, Lock, Server, CheckCircle } from 'lucide-react';

export const metadata = {
  title: 'Security | HireNova',
  description: 'Security practices and setup at HireNova',
};

export default function SecurityPage() {
  return (
    <div className="bg-slate-50 min-h-screen">
      <div className="max-w-6xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
        
        <div className="text-center mb-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald- mb-6">
            <Shield className="w-8 h-8 text-[#008558]" />
          </div>
          <h1 className="text-4xl font-semibold text-slate-900 mb-4 font-outfit">Enterprise-Grade Security</h1>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto">
            At HireNova, we take the security and privacy of your data seriously. Our infrastructure is built with security-first principles to ensure your hiring process remains confidential and compliant.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mb-16">
          <div className="bg-white p-8 rounded-lg border border-slate-200 shadow-sm">
            <Lock className="w-8 h-8 text-[#008558] mb-4" />
            <h3 className="text-xl font-semibold text-slate-900 mb-3 font-outfit">Data Encryption</h3>
            <p className="text-slate-600 text-sm leading-relaxed">
              All data transmitted between your browser and our servers is encrypted using industry-standard TLS 1.3. Data at rest is encrypted using AES-256 encryption.
            </p>
          </div>
          
          <div className="bg-white p-8 rounded-lg border border-slate-200 shadow-sm">
            <Server className="w-8 h-8 text-[#008558] mb-4" />
            <h3 className="text-xl font-semibold text-slate-900 mb-3 font-outfit">Secure Infrastructure</h3>
            <p className="text-slate-600 text-sm leading-relaxed">
              Our application is hosted on secure, isolated cloud infrastructure with continuous monitoring, automated threat detection, and rigorous access controls.
            </p>
          </div>
          
          <div className="bg-white p-8 rounded-lg border border-slate-200 shadow-sm">
            <CheckCircle className="w-8 h-8 text-[#008558] mb-4" />
            <h3 className="text-xl font-semibold text-slate-900 mb-3 font-outfit">Compliance Ready</h3>
            <p className="text-slate-600 text-sm leading-relaxed">
              We adhere to strict data protection regulations. Your candidate information and interview videos are stored securely with strict retention policies.
            </p>
          </div>
        </div>

        <div className="bg-slate-900 rounded-lg p-10 md:p-12 text-white">
          <h2 className="text-3xl font-semibold mb-6 font-outfit">Our Security Practices</h2>
          
          <div className="grid md:grid-cols-2 gap-x-12 gap-y-6">
            <div>
              <h4 className="font-semibold text-[#008558] mb-2">Authentication & Access</h4>
              <p className="text-slate-400 text-sm leading-relaxed">We utilize secure JWT-based authentication. Passwords are cryptographically hashed using bcrypt with secure salts. Administrative access requires multi-factor authentication.</p>
            </div>
            <div>
              <h4 className="font-semibold text-[#008558] mb-2">Vulnerability Management</h4>
              <p className="text-slate-400 text-sm leading-relaxed">We conduct regular automated vulnerability scans and periodic manual penetration testing to identify and remediate potential security risks proactively.</p>
            </div>
            <div>
              <h4 className="font-semibold text-[#008558] mb-2">Video Interview Security</h4>
              <p className="text-slate-400 text-sm leading-relaxed">Live interview streams are transmitted over secure WebRTC channels. Recorded interviews are stored on private, signed cloud storage buckets accessible only by authorized team members.</p>
            </div>
            <div>
              <h4 className="font-semibold text-[#008558] mb-2">Incident Response</h4>
              <p className="text-slate-400 text-sm leading-relaxed">We maintain a comprehensive incident response plan and have dedicated security engineers on-call 24/7 to respond to and mitigate potential anomalies immediately.</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
