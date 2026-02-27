import express from 'express';
import passport from 'passport';
import { authenticateUser } from '../middleware/auth.js';
import * as authController from '../controllers/authController.js';

const router = express.Router();

/**
 * @route   GET /api/auth/microsoft
 * @desc    Initiate Microsoft OAuth login
 * @access  Public
 */
router.get('/microsoft', 
  passport.authenticate('azuread-openidconnect', {
    failureRedirect: '/api/auth/login-failed'
  })
);

/**
 * @route   POST /api/auth/callback
 * @desc    Microsoft OAuth callback
 * @access  Public
 */
router.post('/callback',
  passport.authenticate('azuread-openidconnect', {
    failureRedirect: '/api/auth/login-failed'
  }),
  authController.handleOAuthCallback
);

router.get('/login-failed', authController.handleLoginFailed);
router.get('/me', authenticateUser, authController.getCurrentUser);
router.get('/logout', authController.logout);
router.get('/check', authController.checkAuth);

export default router;