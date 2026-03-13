import express from 'express';
import { authenticateUser, canApprove } from '../middleware/auth.js';
import * as uploadController from '../controllers/uploadController.js';

const router = express.Router();

/**
 * @route   POST /api/upload/csv
 * @desc    Upload CSV file with purchase prices
 * @access  Private (Manager/Admin)
 */
router.post('/csv', authenticateUser, canApprove, uploadController.uploadCSV);

/**
 * @route   GET /api/upload/history
 * @desc    Get upload history with pagination
 * @access  Private
 */
router.get('/history', authenticateUser, uploadController.getUploadHistory);

/**
 * @route   GET /api/upload/:uploadId
 * @desc    Get specific upload details by ID
 * @access  Private
 */
router.get('/:uploadId', authenticateUser, uploadController.getUploadById);

export default router;
