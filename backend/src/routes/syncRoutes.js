import express from 'express';
import { authenticateUser, requireAdmin } from '../middleware/auth.js';
import * as syncController from '../controllers/syncController.js';

const router = express.Router();

/**
 * @route   POST /api/sync/mssql
 * @desc    Sync products from MS-SQL APIs (Zoho + Shopify SKUs)
 * @access  Private (Admin only)
 */
router.post('/mssql', authenticateUser, requireAdmin, syncController.syncFromMSSQL);

/**
 * @route   GET /api/sync/status
 * @desc    Get status of last sync
 * @access  Private
 */
router.get('/status', authenticateUser, syncController.getSyncStatus);

/**
 * @route   GET /api/sync/history
 * @desc    Get all sync history with pagination
 * @access  Private
 */
router.get('/history', authenticateUser, syncController.getSyncHistory);

export default router;