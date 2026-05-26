const express = require('express');
const { analyzeProfile, submitApplication, getJobApplications, sendEmail, getMyApplications, inviteToInterview, submitInterviewAnswer, getApplicationById } = require('../controllers/applicationController');
const { protect, authorize } = require('../middleware/auth');
const multer = require('multer');

// Configure multer for file uploads in memory
const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();

router.post('/analyze', protect, authorize('user'), upload.single('cv'), analyzeProfile);
router.post('/submit', protect, authorize('user'), upload.single('cv'), submitApplication);
router.get('/user', protect, authorize('user'), getMyApplications);

router.get('/job/:jobId', protect, authorize('admin'), getJobApplications);
router.get('/:id', protect, authorize('admin'), getApplicationById);
router.post('/:id/send-email', protect, authorize('admin'), sendEmail);
router.put('/:id/invite', protect, authorize('admin'), inviteToInterview);

router.post('/:id/answer', protect, authorize('user'), upload.single('audio'), submitInterviewAnswer);

module.exports = router;
