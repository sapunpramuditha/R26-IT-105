const mongoose = require('mongoose');

const WrittenAssessmentAttemptSchema = new mongoose.Schema({
    application_id: { type: mongoose.Schema.ObjectId, ref: 'Application', required: true, unique: true },
    job_id: { type: mongoose.Schema.ObjectId, ref: 'JobPost', required: true },
    user_id: { type: mongoose.Schema.ObjectId, ref: 'User', required: true },
    paper_id: { type: mongoose.Schema.ObjectId, ref: 'AssessmentPaper', required: true },
    paper_version: { type: Number, required: true },
    paper_snapshot: { type: Object, required: true },
    status: { type: String, enum: ['Assigned', 'In Progress', 'Submitted', 'Analyzed', 'Expired'], default: 'Assigned' },
    assigned_at: { type: Date, default: Date.now },
    started_at: Date,
    submitted_at: Date,
    expires_at: Date,
    answers: [{
        question_id: { type: String, required: true },
        answer_text: { type: String, default: '' },
        active_duration_ms: { type: Number, default: 0 },
        integrity_events: {
            paste_count: { type: Number, default: 0 },
            pasted_character_count: { type: Number, default: 0 },
            focus_lost_count: { type: Number, default: 0 },
            deletion_count: { type: Number, default: 0 }
        },
        keystroke_features: Object,
        keystroke_analysis: Object
    }],
    overall_analysis: Object
}, { timestamps: true });

WrittenAssessmentAttemptSchema.index({ user_id: 1, status: 1 });
module.exports = mongoose.model('WrittenAssessmentAttempt', WrittenAssessmentAttemptSchema);
