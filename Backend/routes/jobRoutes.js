const express = require('express');
const { getJobs, getJob, createJob, updateJob, deleteJob } = require('../controllers/jobController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.route('/')
    .get(getJobs)
    .post(protect, authorize('admin'), createJob);

router.route('/:slug')
    .get(getJob);

router.route('/:id')
    .put(protect, authorize('admin'), updateJob)
    .delete(protect, authorize('admin'), deleteJob);

module.exports = router;
