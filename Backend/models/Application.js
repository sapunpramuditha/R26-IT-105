const mongoose = require('mongoose');

const ApplicationSchema = new mongoose.Schema({
    job_id: {
        type: mongoose.Schema.ObjectId,
        ref: 'JobPost',
        required: true
    },
    user_id: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true
    },
    candidate_name: {
        type: String,
        required: true
    },
    github_username: {
        type: String
    },
    resume_data: {
        type: Object, // Stores parsed resume data after user confirmation
        required: true
    },
    ai_analysis: {
        type: Object // Stores model scores (final_score, grade, etc.)
    },
    original_cv_url: {
        type: String // Stores the path to the uploaded CV file
    },
    status: {
        type: String,
        enum: ['Pending', 'Interviewing', 'Written Assessment Pending', 'Written Assessment In Progress', 'Completed', 'Rejected', 'Accepted'],
        default: 'Pending'
    },
    selection_status: {
        type: String,
        enum: ['Pending', 'Selected'],
        default: 'Pending'
    },
    rank: {
        type: Number,
        default: null
    },
    selected_at: {
        type: Date,
        default: null
    },
    invitation_status: {
        type: String,
        enum: ['Not Sent', 'Sending', 'Sent', 'Failed'],
        default: 'Not Sent'
    },
    invitation_sent_at: {
        type: Date,
        default: null
    },
    invitation_error: {
        type: String,
        default: null
    },
    interview_answers: [{
        question: String,
        audio_url: String,
        video_url: String,
        transcribed_text: String,
        predicted_label: String,
        audio_analysis: Object, // Full /audio/analyze response: per-label %, verdict, audio_info, hesitation count
        video_analysis: Object, // Full interview_ai response: summary, entries, meta
        answered_at: { type: Date, default: Date.now }
    }],
    behavioral_summary: {
        type: Object // Aggregated session metrics across interview questions
    },
    written_assessment_id: { type: mongoose.Schema.ObjectId, ref: 'WrittenAssessmentAttempt', default: null },
    written_assessment_status: { type: String, default: null },
    written_assessment_summary: { type: Object, default: null },
    appliedAt: {
        type: Date,
        default: Date.now
    }
});

ApplicationSchema.index({ job_id: 1, 'ai_analysis.final_score': -1, appliedAt: 1 });
ApplicationSchema.index({ job_id: 1, rank: 1 });

module.exports = mongoose.model('Application', ApplicationSchema);
