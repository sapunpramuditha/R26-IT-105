const Application = require('../models/Application');
const JobPost = require('../models/JobPost');
const axios = require('axios');
const FormData = require('form-data');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { rankCandidatesForJob } = require('../services/candidateRankingService');
const { assignAssessment } = require('./assessmentController');

// Set up node mailer transporter
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// @desc    Analyze profile using python model
// @route   POST /api/applications/analyze
// @access  Private/User
exports.analyzeProfile = async (req, res) => {
    try {
        const cvFile = req.file; // From multer

        if (!cvFile) {
            return res.status(400).json({ success: false, error: 'Please provide cv file' });
        }

        const formData = new FormData();
        formData.append('resume', cvFile.buffer, {
            filename: cvFile.originalname,
            contentType: cvFile.mimetype
        });

        // Call the python model to parse resume only (Step 1)
        const response = await axios.post('http://localhost:5000/profile/parse-resume', formData, {
            headers: {
                ...formData.getHeaders()
            }
        });

        // Send back the python model's response directly to frontend
        res.status(200).json({
            success: true,
            data: response.data
        });
    } catch (error) {
        console.error('Model API Error:', error.response?.data || error.message);
        res.status(500).json({ success: false, error: 'Error analyzing profile' });
    }
};

// @desc    Submit Application (After user confirmation)
// @route   POST /api/applications/submit
// @access  Private/User
exports.submitApplication = async (req, res) => {
    try {
        let { job_id, candidate_name, github_username, resume_data } = req.body;
        
        // Parse resume_data if it comes as a string (from FormData)
        if (typeof resume_data === 'string') {
            resume_data = JSON.parse(resume_data);
        }

        // Ensure job exists
        const job = await JobPost.findById(job_id);
        if (!job) {
            return res.status(404).json({ success: false, error: 'Job not found' });
        }

        // Check if already applied
        const existingApp = await Application.findOne({ job_id, user_id: req.user.id });
        if (existingApp) {
            return res.status(400).json({ success: false, error: 'You have already applied for this job' });
        }

        // Save CV File
        let original_cv_url = null;
        if (req.file) {
            const cvDir = path.join(__dirname, '..', 'uploads', 'cv');
            if (!fs.existsSync(cvDir)) {
                fs.mkdirSync(cvDir, { recursive: true });
            }
            const ext = path.extname(req.file.originalname) || '.pdf';
            const fileName = `cv_${req.user.id}_${Date.now()}${ext}`;
            const filePath = path.join(cvDir, fileName);
            fs.writeFileSync(filePath, req.file.buffer);
            original_cv_url = `/uploads/cv/${fileName}`;
        }

        // Call analyze-from-resume using the finalized resume_data
        const pythonResponse = await axios.post('http://localhost:5000/profile/analyze-from-resume', {
            resume_data,
            github_username,
            job_requirements: {
                required_skills: job.required_skills,
                preferred_skills: job.preferred_skills,
                min_experience_years: job.min_experience_years,
                domain: job.domain
            }
        });
        
        const ai_analysis = pythonResponse.data;

        const application = await Application.create({
            job_id,
            user_id: req.user.id,
            candidate_name,
            github_username,
            resume_data,
            ai_analysis,
            original_cv_url
        });

        // Keep the persisted ranking and Top-10 selection current as candidates apply.
        await rankCandidatesForJob(job_id);
        const rankedApplication = await Application.findById(application._id);

        res.status(201).json({
            success: true,
            data: rankedApplication
        });
    } catch (error) {
        console.error('Submit application error:', error.response?.data || error.message);
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Get applications for a job
// @route   GET /api/applications/job/:jobId
// @access  Private/Admin
exports.getJobApplications = async (req, res) => {
    try {
        // Also initializes ranking fields for applications created before this feature.
        await rankCandidatesForJob(req.params.jobId);
        const applications = await Application.find({ job_id: req.params.jobId })
            .populate('user_id', 'email name')
            .sort({ rank: 1, 'ai_analysis.final_score': -1, appliedAt: 1 });

        res.status(200).json({
            success: true,
            count: applications.length,
            data: applications
        });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Recalculate and persist candidate ranking/Top-10 selection for a job
// @route   POST /api/applications/job/:jobId/rank
// @access  Private/Admin
exports.rankJobCandidates = async (req, res) => {
    try {
        const job = await JobPost.findById(req.params.jobId);
        if (!job) {
            return res.status(404).json({ success: false, error: 'Job not found' });
        }

        const summary = await rankCandidatesForJob(req.params.jobId);
        return res.status(200).json({ success: true, data: summary });
    } catch (error) {
        console.error('Ranking error:', error);
        return res.status(500).json({ success: false, error: 'Failed to rank candidates' });
    }
};

// @desc    Send email to applicant
// @route   POST /api/applications/:id/send-email
// @access  Private/Admin
exports.sendEmail = async (req, res) => {
    try {
        const { subject, message } = req.body;
        const application = await Application.findById(req.params.id).populate('user_id', 'email');

        if (!application) {
            return res.status(404).json({ success: false, error: 'Application not found' });
        }

        const userEmail = application.user_id.email;

        const mailOptions = {
            from: `"HireNova" <${process.env.EMAIL_USER}>`,
            to: userEmail,
            subject: subject,
            text: message,
        };

        await transporter.sendMail(mailOptions);

        res.status(200).json({ success: true, message: 'Email sent successfully' });
    } catch (error) {
        console.error('Email error:', error);
        res.status(500).json({ success: false, error: 'Failed to send email' });
    }
};

// @desc    Get applications for logged in user
// @route   GET /api/applications/user
// @access  Private/User
exports.getMyApplications = async (req, res) => {
    try {
        const applications = await Application.find({ user_id: req.user.id })
            .populate('job_id', 'title domain slug')
            .sort({ appliedAt: -1 });

        res.status(200).json({
            success: true,
            count: applications.length,
            data: applications
        });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Invite candidate to interview
// @route   PUT /api/applications/:id/invite
// @access  Private/Admin
async function sendInterviewInvitation(applicationId) {
    // Claim the invitation atomically so repeated/concurrent requests cannot send twice.
    const application = await Application.findOneAndUpdate(
        {
            _id: applicationId,
            selection_status: 'Selected',
            rank: { $gte: 1, $lte: 10 },
            invitation_status: { $in: ['Not Sent', 'Failed'] }
        },
        {
            $set: {
                invitation_status: 'Sending',
                invitation_error: null
            }
        },
        { new: true }
    ).populate('user_id', 'email name').populate('job_id', 'title');

    if (!application) {
        const existing = await Application.findById(applicationId);
        if (!existing) {
            const error = new Error('Application not found');
            error.statusCode = 404;
            throw error;
        }
        if (existing.invitation_status === 'Sent' || existing.invitation_status === 'Sending') {
            const error = new Error('Interview invitation has already been sent or is currently sending');
            error.statusCode = 409;
            throw error;
        }
        const error = new Error('Only candidates currently selected in the Top 10 can be invited');
        error.statusCode = 403;
        throw error;
    }

    const subject = `Interview Invitation for ${application.job_id.title}`;
    const message = `Hi ${application.user_id.name},\n\nCongratulations! You have been selected for an AI Video Interview for the ${application.job_id.title} position.\n\nPlease log in to your profile at HireNova to start your interview.\n\nBest,\nThe HireNova Team`;

    try {
        await transporter.sendMail({
            from: `"HireNova" <${process.env.EMAIL_USER}>`,
            to: application.user_id.email,
            subject,
            text: message,
        });

        application.status = 'Interviewing';
        application.invitation_status = 'Sent';
        application.invitation_sent_at = new Date();
        application.invitation_error = null;
        await application.save();
        return application;
    } catch (error) {
        await Application.updateOne(
            { _id: application._id, invitation_status: 'Sending' },
            {
                $set: {
                    invitation_status: 'Failed',
                    invitation_error: error.message
                }
            }
        );
        throw error;
    }
}

exports.inviteToInterview = async (req, res) => {
    try {
        const application = await sendInterviewInvitation(req.params.id);
        res.status(200).json({ success: true, data: application });
    } catch (error) {
        console.error('Invite error:', error);
        res.status(error.statusCode || 500).json({ success: false, error: error.message || 'Failed to invite candidate' });
    }
};

// @desc    Invite every reviewed Top-10 candidate who has not already been invited
// @route   POST /api/applications/job/:jobId/invite-selected
// @access  Private/Admin
exports.inviteSelectedCandidates = async (req, res) => {
    try {
        const candidates = await Application.find({
            job_id: req.params.jobId,
            selection_status: 'Selected',
            rank: { $gte: 1, $lte: 10 }
        }).sort({ rank: 1 });

        const result = { sent: 0, alreadySent: 0, failed: 0, failures: [] };
        for (const candidate of candidates) {
            if (candidate.invitation_status === 'Sent' || candidate.invitation_status === 'Sending') {
                result.alreadySent += 1;
                continue;
            }
            try {
                await sendInterviewInvitation(candidate._id);
                result.sent += 1;
            } catch (error) {
                if (error.statusCode === 409) {
                    result.alreadySent += 1;
                } else {
                    result.failed += 1;
                    result.failures.push({ application_id: candidate._id, error: error.message });
                }
            }
        }

        res.status(200).json({ success: true, data: result });
    } catch (error) {
        console.error('Bulk invite error:', error);
        res.status(500).json({ success: false, error: 'Failed to invite selected candidates' });
    }
};

// Fixed set of interview questions (served in order until all are answered)
const INTERVIEW_QUESTIONS = [
    "Could you please introduce yourself and walk me through your background?",
    "What are your key technical strengths, and how have you applied them in a real project?",
    "Tell me about a challenging problem you solved recently. How did you approach it?",
    "How do you stay current with new technologies and continue to grow your skills?",
    "Why are you interested in this role, and what do you hope to achieve here?"
];

// Helper to analyze video via interview_ai API (:8000)
async function analyzeInterviewVideo(videoBuffer, originalFilename = 'answer.webm') {
    try {
        const formData = new FormData();
        const ext = path.extname(originalFilename) || '.webm';
        formData.append('video', videoBuffer, {
            filename: `answer${ext}`,
            contentType: ext === '.mp4' ? 'video/mp4' : 'video/webm'
        });

        const submitRes = await axios.post('http://127.0.0.1:8000/v1/analyse', formData, {
            headers: { ...formData.getHeaders() },
            timeout: 15000
        });

        const jobId = submitRes.data?.id;
        if (!jobId) {
            console.warn('[interview_ai] No job ID returned');
            return null;
        }

        // Poll for result up to 60s
        const maxAttempts = 120;
        for (let i = 0; i < maxAttempts; i++) {
            await new Promise((r) => setTimeout(r, 500));
            try {
                const res = await axios.get(`http://127.0.0.1:8000/v1/jobs/${jobId}/result`, { timeout: 5000 });
                if (res.status === 200 && res.data?.state === 'done') {
                    return res.data.result;
                }
            } catch (pollErr) {
                if (pollErr.response?.status === 409) {
                    continue; // still processing
                }
                if (pollErr.response?.status === 422) {
                    console.error('[interview_ai] Job failed:', pollErr.response?.data);
                    break;
                }
            }
        }
        console.warn('[interview_ai] Job timed out');
        return null;
    } catch (err) {
        console.error('[interview_ai] Error submitting video:', err.response?.data || err.message);
        return null;
    }
}

// Compute aggregate behavioral metrics across all answers
function computeBehavioralSummary(answers) {
    const valid = answers.filter((a) => a.video_analysis?.summary?.session);
    if (!valid.length) return null;

    let totalAnalysed = 0;
    let totalCalibrating = 0;
    let totalFlags = 0;
    let maxSuspiciousSpan = 0;
    let totalEngagedFrac = 0;
    let totalNeutralFrac = 0;
    let totalSuspiciousFrac = 0;
    const allReasons = [];
    const allReviewMoments = [];

    const priorityRank = { 'High': 3, 'Medium': 2, 'Low': 1, 'Insufficient': 0 };
    let highestPriority = 'Low';

    valid.forEach((a) => {
        const s = a.video_analysis.summary.session;
        totalAnalysed += Number(s.analysed_s) || 0;
        totalCalibrating += Number(s.calibrating_s) || 0;
        totalFlags += Number(a.video_analysis.summary.n_flags) || 0;
        if ((Number(s.longest_suspicious_span_s) || 0) > maxSuspiciousSpan) {
            maxSuspiciousSpan = Number(s.longest_suspicious_span_s);
        }

        const fracs = s.state_fractions || {};
        totalEngagedFrac += Number(fracs.Engaged) || 0;
        totalNeutralFrac += Number(fracs.Neutral) || 0;
        totalSuspiciousFrac += Number(fracs.Suspicious) || 0;

        if (Array.isArray(s.priority_reasons)) {
            allReasons.push(...s.priority_reasons);
        }
        if (Array.isArray(s.review_moments_s)) {
            allReviewMoments.push(...s.review_moments_s);
        }

        if ((priorityRank[s.review_priority] || 0) > (priorityRank[highestPriority] || 0)) {
            highestPriority = s.review_priority;
        }
    });

    const count = valid.length;
    return {
        review_priority: highestPriority,
        priority_reasons: Array.from(new Set(allReasons)),
        total_analysed_s: Math.round(totalAnalysed * 10) / 10,
        total_calibrating_s: Math.round(totalCalibrating * 10) / 10,
        total_flags: totalFlags,
        longest_suspicious_span_s: Math.round(maxSuspiciousSpan * 10) / 10,
        average_state_fractions: {
            Engaged: Math.round((totalEngagedFrac / count) * 1000) / 1000,
            Neutral: Math.round((totalNeutralFrac / count) * 1000) / 1000,
            Suspicious: Math.round((totalSuspiciousFrac / count) * 1000) / 1000,
        },
        review_moments_count: allReviewMoments.length,
        analyzed_answers_count: count,
    };
}

// @desc    Submit audio/video answer for interview
// @route   POST /api/applications/:id/answer
// @access  Private/User
exports.submitInterviewAnswer = async (req, res) => {
    try {
        const application = await Application.findOne({ _id: req.params.id, user_id: req.user.id });

        if (!application) {
            return res.status(404).json({ success: false, error: 'Application not found or unauthorized' });
        }

        // Support both req.file (single) and req.files (fields: audio, video)
        const audioFile = req.files?.audio?.[0] || req.file;
        const videoFile = req.files?.video?.[0];

        if (!audioFile && !videoFile) {
            return res.status(400).json({ success: false, error: 'Please provide audio or video file' });
        }

        let audioAnalysis = null;
        let transcribedText = "";
        let predictedLabel = "";
        let audio_url = null;

        // 1. Audio processing with Component 3
        if (audioFile) {
            const formData = new FormData();
            formData.append('audio', audioFile.buffer, {
                filename: 'answer.wav',
                contentType: audioFile.mimetype || 'audio/wav'
            });
            if (req.body.question) {
                formData.append('question', req.body.question);
            }

            try {
                const pythonResponse = await axios.post('http://127.0.0.1:5000/audio/analyze', formData, {
                    headers: {
                        ...formData.getHeaders()
                    },
                    timeout: 30000
                });

                if (pythonResponse.data && pythonResponse.data.predicted_label) {
                    audioAnalysis = pythonResponse.data;
                    predictedLabel = pythonResponse.data.predicted_label;
                    const sttTranscript = (pythonResponse.data.transcript || "").trim();
                    transcribedText = sttTranscript || `Voice analysis complete. Emotion: ${predictedLabel}`;
                } else {
                    throw new Error("Invalid response from audio analysis API");
                }
            } catch (pythonError) {
                console.error('Python Voice API Error:', pythonError.message);
                transcribedText = "Error during audio analysis";
                predictedLabel = "unknown";
            }

            // Save audio file locally
            const audioDir = path.join(__dirname, '..', 'uploads', 'audio');
            if (!fs.existsSync(audioDir)) {
                fs.mkdirSync(audioDir, { recursive: true });
            }
            const audioFileName = `${application._id}_${Date.now()}.wav`;
            const audioFilePath = path.join(audioDir, audioFileName);
            fs.writeFileSync(audioFilePath, audioFile.buffer);
            audio_url = `/uploads/audio/${audioFileName}`;
        }

        // 2. Video processing with interview_ai (:8000)
        let videoAnalysis = null;
        let video_url = null;

        if (videoFile) {
            const videoDir = path.join(__dirname, '..', 'uploads', 'video');
            if (!fs.existsSync(videoDir)) {
                fs.mkdirSync(videoDir, { recursive: true });
            }
            const ext = path.extname(videoFile.originalname) || '.webm';
            const videoFileName = `${application._id}_${Date.now()}${ext}`;
            const videoFilePath = path.join(videoDir, videoFileName);
            fs.writeFileSync(videoFilePath, videoFile.buffer);
            video_url = `/uploads/video/${videoFileName}`;

            // Run analysis via interview_ai API
            videoAnalysis = await analyzeInterviewVideo(videoFile.buffer, videoFile.originalname);
        }

        // Update database
        application.interview_answers.push({
            question: req.body.question || "Unknown Question",
            audio_url: audio_url,
            video_url: video_url,
            transcribed_text: transcribedText,
            predicted_label: predictedLabel,
            audio_analysis: audioAnalysis,
            video_analysis: videoAnalysis
        });

        // ── Question progression & Behavioral summary ───────────────────
        const answeredCount  = application.interview_answers.length;
        const totalQuestions = INTERVIEW_QUESTIONS.length;
        const isComplete     = answeredCount >= totalQuestions;

        application.behavioral_summary = computeBehavioralSummary(application.interview_answers);
        application.status = isComplete ? 'Completed' : 'Interviewing';
        await application.save();

        let writtenAssessment = null;
        if (isComplete) {
            writtenAssessment = await assignAssessment(application);
        }

        const nextQuestion = isComplete
            ? "Thank you for your answers. The interview is now complete."
            : INTERVIEW_QUESTIONS[answeredCount];

        res.status(200).json({
            success: true,
            data: {
                transcribed_text: transcribedText,
                predicted_label:  predictedLabel,
                audio_analysis:   audioAnalysis,
                video_analysis:   videoAnalysis,
                answered_count:   answeredCount,
                total_questions:  totalQuestions,
                is_complete:      isComplete,
                written_assessment_required: Boolean(writtenAssessment),
                written_assessment_id: writtenAssessment?._id || null,
                next_question:    nextQuestion
            }
        });
    } catch (error) {
        console.error('Submit answer error:', error);
        res.status(500).json({ success: false, error: 'Failed to process answer' });
    }
};

// @desc    Get application by ID
// @route   GET /api/applications/:id
// @access  Private/Admin
exports.getApplicationById = async (req, res) => {
    try {
        const application = await Application.findById(req.params.id)
            .populate('job_id', 'title domain slug')
            .populate('user_id', 'name email');

        if (!application) {
            return res.status(404).json({ success: false, error: 'Application not found' });
        }

        res.status(200).json({ success: true, data: application });
    } catch (error) {
        console.error('Get application by id error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};
