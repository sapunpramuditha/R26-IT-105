const express = require('express');
const c = require('../controllers/assessmentController');
const { protect, authorize } = require('../middleware/auth');
const router = express.Router();

router.get('/papers', protect, authorize('admin'), c.listPapers);
router.post('/papers', protect, authorize('admin'), c.createPaper);
router.get('/papers/:id', protect, authorize('admin'), c.getPaper);
router.put('/papers/:id', protect, authorize('admin'), c.updatePaper);
router.post('/papers/:id/publish', protect, authorize('admin'), c.publishPaper);
router.delete('/papers/:id', protect, authorize('admin'), c.deletePaper);
router.get('/application/:applicationId', protect, authorize('user'), c.getMyAttemptForApplication);
router.post('/attempts/:id/start', protect, authorize('user'), c.startAttempt);
router.put('/attempts/:id/answers/:questionId', protect, authorize('user'), c.saveAnswer);
router.post('/attempts/:id/submit', protect, authorize('user'), c.submitAttempt);
router.get('/attempts/:id/result', protect, authorize('admin'), c.getAttemptResult);
module.exports = router;
