const Application = require('../models/Application');

const TOP_CANDIDATE_LIMIT = 10;

/**
 * Persist a deterministic ranking for every application to a job.
 * This updates existing documents only, so rerunning it is idempotent.
 */
async function rankCandidatesForJob(jobId) {
    const applications = await Application.find({ job_id: jobId })
        .select('_id selected_at status invitation_status invitation_sent_at')
        .sort({ 'ai_analysis.final_score': -1, appliedAt: 1, _id: 1 })
        .lean();

    if (!applications.length) {
        return { total: 0, selected: 0 };
    }

    const now = new Date();
    const operations = applications.map((application, index) => {
        const rank = index + 1;
        const isSelected = rank <= TOP_CANDIDATE_LIMIT;
        const existingInvitationStatus = application.invitation_status ||
            (['Interviewing', 'Completed'].includes(application.status) ? 'Sent' : 'Not Sent');

        return {
            updateOne: {
                filter: { _id: application._id },
                update: {
                    $set: {
                        rank,
                        selection_status: isSelected ? 'Selected' : 'Pending',
                        selected_at: isSelected ? (application.selected_at || now) : null,
                        invitation_status: existingInvitationStatus
                    }
                }
            }
        };
    });

    await Application.bulkWrite(operations);

    return {
        total: applications.length,
        selected: Math.min(applications.length, TOP_CANDIDATE_LIMIT)
    };
}

module.exports = { TOP_CANDIDATE_LIMIT, rankCandidatesForJob };
