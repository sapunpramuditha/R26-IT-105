const axios = require('axios');
const AssessmentPaper = require('../models/AssessmentPaper');
const WrittenAssessmentAttempt = require('../models/WrittenAssessmentAttempt');
const Application = require('../models/Application');
const JobPost = require('../models/JobPost');

const ML_URL = process.env.KEYSTROKE_API_URL || 'http://127.0.0.1:5000/keystroke/analyze';

const paperSnapshot = (paper, durationOverride) => ({
    title: paper.title,
    description: paper.description,
    instructions: paper.instructions,
    duration_minutes: durationOverride || paper.duration_minutes,
    total_marks: paper.total_marks,
    questions: paper.questions.map((q) => ({
        _id: q._id.toString(), question_text: q.question_text, marks: q.marks,
        minimum_words: q.minimum_words, maximum_words: q.maximum_words, order: q.order
    }))
});

async function assignAssessment(application) {
    const job = await JobPost.findById(application.job_id).populate('written_assessment.paper_id');
    const config = job?.written_assessment;
    const paper = config?.paper_id;
    if (!config?.enabled || !paper || paper.status !== 'Published') return null;

    let attempt = await WrittenAssessmentAttempt.findOne({ application_id: application._id });
    if (!attempt) {
        attempt = await WrittenAssessmentAttempt.create({
            application_id: application._id, job_id: job._id, user_id: application.user_id,
            paper_id: paper._id, paper_version: paper.version,
            paper_snapshot: paperSnapshot(paper, config.duration_minutes)
        });
    }
    application.written_assessment_id = attempt._id;
    application.written_assessment_status = attempt.status;
    application.status = 'Written Assessment Pending';
    await application.save();
    return attempt;
}

function stats(values) {
    if (!values.length) return { avg: 0, min: 0, max: 0 };
    return {
        avg: values.reduce((a, b) => a + b, 0) / values.length,
        min: Math.min(...values), max: Math.max(...values)
    };
}

function extractFeatures(events, activeDurationMs) {
    const sorted = [...events]
        .filter((e) => ['keydown', 'keyup'].includes(e.type) && Number.isFinite(Number(e.t)) && e.code)
        .sort((a, b) => Number(a.t) - Number(b.t));
    const downs = new Map();
    const holds = [], downTimes = [], upTimes = [];
    let validKeys = 0;
    for (const e of sorted) {
        const t = Number(e.t);
        if (e.type === 'keydown' && !e.repeat) {
            downs.set(e.code, t); downTimes.push(t); validKeys += 1;
        } else if (e.type === 'keyup') {
            upTimes.push(t);
            if (downs.has(e.code)) {
                const duration = t - downs.get(e.code);
                if (duration >= 0 && duration <= 2000) holds.push(duration);
                downs.delete(e.code);
            }
        }
    }
    const differences = (arr) => arr.slice(1).map((v, i) => v - arr[i]).filter((v) => v >= 0 && v <= 5000);
    const keyLatency = differences(downTimes);
    const interRelease = differences(upTimes);
    const digraph = downTimes.slice(1).map((v, i) => {
        const matchingUp = upTimes.find((u) => u >= v);
        return matchingUp == null ? null : matchingUp - downTimes[i];
    }).filter((v) => v != null && v >= 0 && v <= 5000);
    const h = stats(holds), k = stats(keyLatency), d = stats(digraph), r = stats(interRelease);
    // Use the captured typing window, not time since the assessment page loaded.
    // The latter includes reading/other-question time and made automated typing
    // appear artificially slow (and therefore human-like to this model).
    const eventDurationMs = sorted.length > 1
        ? Number(sorted.at(-1).t) - Number(sorted[0].t)
        : 0;
    const durationMs = eventDurationMs > 0 ? eventDurationMs : Number(activeDurationMs) || 0;
    const minutes = Math.max(durationMs, 1000) / 60000;
    return {
        features: {
            Typing_Speed: validKeys / 5 / minutes,
            Avg_Hold_Time: h.avg, Max_Hold_Time: h.max, Min_Hold_Time: h.min,
            Avg_Keystroke_Latency: k.avg, Max_Keystroke_Latency: k.max, Min_Keystroke_Latency: k.min,
            Avg_Digraph_Duration: d.avg, Max_Digraph_Duration: d.max, Min_Digraph_Duration: d.min,
            Avg_Inter_Release_Latency: r.avg, Max_Inter_Release_Latency: r.max, Min_Inter_Release_Latency: r.min
        }, eventCount: validKeys
    };
}

async function analyze(events, activeDurationMs) {
    const extracted = extractFeatures(events, activeDurationMs);
    if (extracted.eventCount < 40) return { ...extracted, analysis: { classification: 'insufficient_data', event_count: extracted.eventCount } };
    try {
        const response = await axios.post(ML_URL, { features: extracted.features, event_count: extracted.eventCount }, { timeout: 15000 });
        return { ...extracted, analysis: response.data };
    } catch (error) {
        return { ...extracted, analysis: { classification: 'analysis_unavailable', event_count: extracted.eventCount, reason: error.message } };
    }
}

exports.listPapers = async (_req, res) => res.json({ success: true, data: await AssessmentPaper.find().sort({ updatedAt: -1 }) });
exports.getPaper = async (req, res) => {
    const paper = await AssessmentPaper.findById(req.params.id);
    return paper ? res.json({ success: true, data: paper }) : res.status(404).json({ success: false, error: 'Paper not found' });
};
exports.createPaper = async (req, res) => {
    try { res.status(201).json({ success: true, data: await AssessmentPaper.create({ ...req.body, created_by: req.user.id }) }); }
    catch (e) { res.status(400).json({ success: false, error: e.message }); }
};
exports.updatePaper = async (req, res) => {
    try {
        const current = await AssessmentPaper.findById(req.params.id);
        if (!current) return res.status(404).json({ success: false, error: 'Paper not found' });
        Object.assign(current, req.body);
        if (req.body.questions) current.version += 1;
        await current.save();
        res.json({ success: true, data: current });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
};
exports.publishPaper = async (req, res) => {
    const paper = await AssessmentPaper.findById(req.params.id);
    if (!paper) return res.status(404).json({ success: false, error: 'Paper not found' });
    paper.status = 'Published'; await paper.save();
    res.json({ success: true, data: paper });
};
exports.deletePaper = async (req, res) => {
    const used = await JobPost.exists({ 'written_assessment.paper_id': req.params.id });
    if (used) return res.status(409).json({ success: false, error: 'Archive papers assigned to jobs instead of deleting them' });
    await AssessmentPaper.findByIdAndDelete(req.params.id);
    res.json({ success: true, data: {} });
};

async function ownedAttempt(id, userId) { return WrittenAssessmentAttempt.findOne({ _id: id, user_id: userId }); }
exports.getMyAttemptForApplication = async (req, res) => {
    const application = await Application.findOne({ _id: req.params.applicationId, user_id: req.user.id });
    if (!application) return res.status(404).json({ success: false, error: 'Application not found' });
    let attempt = await WrittenAssessmentAttempt.findOne({ application_id: application._id });
    if (!attempt && application.status === 'Completed') attempt = await assignAssessment(application);
    if (!attempt) return res.status(404).json({ success: false, error: 'No written assessment assigned' });
    res.json({ success: true, data: attempt });
};
exports.startAttempt = async (req, res) => {
    const attempt = await ownedAttempt(req.params.id, req.user.id);
    if (!attempt) return res.status(404).json({ success: false, error: 'Assessment not found' });
    if (!['Assigned', 'In Progress'].includes(attempt.status)) return res.status(409).json({ success: false, error: 'Assessment cannot be started' });
    if (!attempt.started_at) {
        attempt.started_at = new Date();
        attempt.expires_at = new Date(Date.now() + attempt.paper_snapshot.duration_minutes * 60000);
        attempt.status = 'In Progress'; await attempt.save();
        await Application.findByIdAndUpdate(attempt.application_id, { status: 'Written Assessment In Progress', written_assessment_status: attempt.status });
    }
    res.json({ success: true, data: attempt });
};
exports.saveAnswer = async (req, res) => {
    const attempt = await ownedAttempt(req.params.id, req.user.id);
    if (!attempt || attempt.status !== 'In Progress') return res.status(409).json({ success: false, error: 'Assessment is not in progress' });
    const question = attempt.paper_snapshot.questions.find((q) => String(q._id) === req.params.questionId);
    if (!question) return res.status(404).json({ success: false, error: 'Question not found' });
    let answer = attempt.answers.find((a) => a.question_id === req.params.questionId);
    if (!answer) { attempt.answers.push({ question_id: req.params.questionId }); answer = attempt.answers.at(-1); }
    answer.answer_text = String(req.body.answer_text || '').slice(0, 20000);
    answer.active_duration_ms = Math.max(0, Number(req.body.active_duration_ms) || 0);
    answer.integrity_events = { ...answer.integrity_events?.toObject?.(), ...(req.body.integrity_events || {}) };
    await attempt.save(); res.json({ success: true, saved_at: new Date() });
};
exports.submitAttempt = async (req, res) => {
    const attempt = await ownedAttempt(req.params.id, req.user.id);
    if (!attempt || attempt.status !== 'In Progress') return res.status(409).json({ success: false, error: 'Assessment is not in progress' });
    const submitted = Array.isArray(req.body.answers) ? req.body.answers : [];
    for (const item of submitted) {
        const question = attempt.paper_snapshot.questions.find((q) => String(q._id) === String(item.question_id));
        if (!question) continue;
        let answer = attempt.answers.find((a) => a.question_id === String(item.question_id));
        if (!answer) { attempt.answers.push({ question_id: String(item.question_id) }); answer = attempt.answers.at(-1); }
        answer.answer_text = String(item.answer_text || '').slice(0, 20000);
        answer.active_duration_ms = Math.max(0, Number(item.active_duration_ms) || 0);
        answer.integrity_events = item.integrity_events || {};
        const result = await analyze(Array.isArray(item.events) ? item.events : [], answer.active_duration_ms);
        answer.keystroke_features = result.features;
        answer.keystroke_analysis = result.analysis;
    }
    const analyses = attempt.answers.map((a) => a.keystroke_analysis).filter(Boolean);
    const human = analyses.filter((a) => a.classification === 'human_like').length;
    const bot = analyses.filter((a) => a.classification === 'bot_like').length;
    const pasteCount = attempt.answers.reduce((s, a) => s + (a.integrity_events?.paste_count || 0), 0);
    attempt.overall_analysis = {
        classification: bot > human ? 'bot_like' : human ? 'human_like' : 'insufficient_data',
        analyzed_answers: human + bot, paste_count: pasteCount,
        review_required: bot > 0 || pasteCount > 0,
        notice: 'Behavioural indicator only. This is not proof of AI use and must not be used as an automatic rejection.'
    };
    attempt.status = analyses.some((a) => a.classification === 'analysis_unavailable') ? 'Submitted' : 'Analyzed';
    attempt.submitted_at = new Date(); await attempt.save();
    await Application.findByIdAndUpdate(attempt.application_id, {
        status: 'Completed', written_assessment_status: attempt.status, written_assessment_summary: attempt.overall_analysis
    });
    res.json({ success: true, data: { status: attempt.status } });
};
exports.getAttemptResult = async (req, res) => {
    const attempt = await WrittenAssessmentAttempt.findById(req.params.id);
    return attempt ? res.json({ success: true, data: attempt }) : res.status(404).json({ success: false, error: 'Assessment not found' });
};

exports.assignAssessment = assignAssessment;
exports.extractFeatures = extractFeatures;
