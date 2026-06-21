const mongoose = require('mongoose');

const QuestionSchema = new mongoose.Schema({
    question_text: { type: String, required: true, trim: true },
    marks: { type: Number, min: 0, default: 10 },
    minimum_words: { type: Number, min: 0, default: 20 },
    maximum_words: { type: Number, min: 1, default: 1000 },
    order: { type: Number, required: true }
}, { _id: true });

const AssessmentPaperSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    instructions: { type: String, default: 'Answer every question in your own words.' },
    domain: { type: String, default: 'General' },
    duration_minutes: { type: Number, min: 5, max: 240, default: 45 },
    questions: {
        type: [QuestionSchema],
        validate: [(value) => value.length > 0, 'At least one question is required']
    },
    total_marks: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: ['Draft', 'Published', 'Archived'], default: 'Draft' },
    version: { type: Number, min: 1, default: 1 },
    created_by: { type: mongoose.Schema.ObjectId, ref: 'Admin' }
}, { timestamps: true });

AssessmentPaperSchema.pre('save', function () {
    this.questions.sort((a, b) => a.order - b.order);
    this.total_marks = this.questions.reduce((sum, q) => sum + (Number(q.marks) || 0), 0);
});

module.exports = mongoose.model('AssessmentPaper', AssessmentPaperSchema);
