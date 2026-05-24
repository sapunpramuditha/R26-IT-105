const mongoose = require('mongoose');

const JobPostSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Please add a job title'],
        trim: true
    },
    slug: {
        type: String,
        required: [true, 'Please add a slug'],
        unique: true
    },
    description: {
        type: String,
        required: [true, 'Please add a description']
    },
    is_active: {
        type: Boolean,
        default: true
    },
    required_skills: {
        type: [String],
        default: []
    },
    preferred_skills: {
        type: [String],
        default: []
    },
    min_experience_years: {
        type: Number,
        default: 0
    },
    domain: {
        type: String,
        default: 'General'
    },
    location: {
        type: String,
        default: 'Colombo'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('JobPost', JobPostSchema);
