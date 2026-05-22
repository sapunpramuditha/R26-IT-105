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
        enum: ['Pending', 'Interviewing', 'Completed', 'Rejected', 'Accepted'],
        default: 'Pending'
    },
    interview_answers: [{
        question: String,
        audio_url: String,
        transcribed_text: String,
        predicted_label: String,
        audio_analysis: Object, // Full /audio/analyze response: per-label %, verdict, audio_info, hesitation count
        answered_at: { type: Date, default: Date.now }
    }],
    appliedAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Application', ApplicationSchema);
