const Application = require('../models/Application');
const JobPost = require('../models/JobPost');
const axios = require('axios');
const FormData = require('form-data');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

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
            github_username
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

        res.status(201).json({
            success: true,
            data: application
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
        const applications = await Application.find({ job_id: req.params.jobId })
            .populate('user_id', 'email name')
            .sort({ 'ai_analysis.final_score': -1 }); // Sort by score descending

        res.status(200).json({
            success: true,
            count: applications.length,
            data: applications
        });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
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
exports.inviteToInterview = async (req, res) => {
    try {
        const application = await Application.findById(req.params.id).populate('user_id', 'email name').populate('job_id', 'title');

        if (!application) {
            return res.status(404).json({ success: false, error: 'Application not found' });
        }

        application.status = 'Interviewing';
        await application.save();

        const userEmail = application.user_id.email;
        const subject = `Interview Invitation for ${application.job_id.title}`;
        const message = `Hi ${application.user_id.name},\n\nCongratulations! You have been selected for an AI Video Interview for the ${application.job_id.title} position.\n\nPlease log in to your profile at HireNova to start your interview.\n\nBest,\nThe HireNova Team`;

        const mailOptions = {
            from: `"HireNova" <${process.env.EMAIL_USER}>`,
            to: userEmail,
            subject: subject,
            text: message,
        };

        try {
            await transporter.sendMail(mailOptions);
        } catch(emailErr) {
            console.error('Failed to send interview invitation email:', emailErr);
        }

        res.status(200).json({ success: true, data: application });
    } catch (error) {
        console.error('Invite error:', error);
        res.status(500).json({ success: false, error: 'Failed to invite candidate' });
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

// @desc    Submit audio answer for interview
// @route   POST /api/applications/:id/answer
// @access  Private/User
exports.submitInterviewAnswer = async (req, res) => {
    try {
        const application = await Application.findOne({ _id: req.params.id, user_id: req.user.id });

        if (!application) {
            return res.status(404).json({ success: false, error: 'Application not found or unauthorized' });
        }

        const audioFile = req.file;
        if (!audioFile) {
            return res.status(400).json({ success: false, error: 'Please provide audio file' });
        }

        const formData = new FormData();
        formData.append('audio', audioFile.buffer, {
            filename: 'answer.wav',
            contentType: audioFile.mimetype
        });
        if (req.body.question) {
            formData.append('question', req.body.question);
        }

        let audioAnalysis = null;
        let transcribedText = "";
        let predictedLabel = "";

        try {
            const pythonResponse = await axios.post('http://127.0.0.1:5000/audio/analyze', formData, {
                headers: {
                    ...formData.getHeaders()
                }
            });

            if (pythonResponse.data && pythonResponse.data.predicted_label) {
                audioAnalysis = pythonResponse.data; // Keep the FULL analysis (all %s, verdict, audio_info, transcript)
                predictedLabel = pythonResponse.data.predicted_label;
                // Prefer the real speech-to-text transcript; fall back to an emotion note
                const sttTranscript = (pythonResponse.data.transcript || "").trim();
                transcribedText = sttTranscript || `Voice analysis complete. Emotion: ${predictedLabel}`;
            } else {
                throw new Error("Invalid response from audio analysis API");
            }
        } catch (pythonError) {
            console.error('Python API Error:', pythonError.message);
            transcribedText = "Error during audio analysis";
            predictedLabel = "unknown";
        }

        // Save file locally (ensure the audio directory exists)
        const audioDir = path.join(__dirname, '..', 'uploads', 'audio');
        if (!fs.existsSync(audioDir)) {
            fs.mkdirSync(audioDir, { recursive: true });
        }
        const fileName = `${application._id}_${Date.now()}.wav`;
        const filePath = path.join(audioDir, fileName);
        fs.writeFileSync(filePath, audioFile.buffer);

        // Update database
        application.interview_answers.push({
            question: req.body.question || "Unknown Question",
            audio_url: `/uploads/audio/${fileName}`,
            transcribed_text: transcribedText,
            predicted_label: predictedLabel,
            audio_analysis: audioAnalysis
        });

        // ── Question progression ─────────────────────────────────────────
        const answeredCount  = application.interview_answers.length;
        const totalQuestions = INTERVIEW_QUESTIONS.length;
        const isComplete     = answeredCount >= totalQuestions;

        application.status = isComplete ? 'Completed' : 'Interviewing';
        await application.save();

        const nextQuestion = isComplete
            ? "Thank you for your answers. The interview is now complete."
            : INTERVIEW_QUESTIONS[answeredCount];

        res.status(200).json({
            success: true,
            data: {
                transcribed_text: transcribedText,
                predicted_label:  predictedLabel,
                audio_analysis:   audioAnalysis,
                answered_count:   answeredCount,
                total_questions:  totalQuestions,
                is_complete:      isComplete,
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
