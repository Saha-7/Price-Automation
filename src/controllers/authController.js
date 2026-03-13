/**
 * Authentication Controller
 * Handles all authentication logic
 */

/**
 * Get current logged-in user
 */
export const getCurrentUser = (req, res) => {
  try {
    res.json({
      success: true,
      user: {
        id: req.user._id,
        email: req.user.email,
        name: req.user.name,
        role: req.user.role,
        lastLogin: req.user.lastLogin
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Logout user
 */
export const logout = (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: 'Error logging out'
      });
    }
    
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: 'Error destroying session'
        });
      }
      
      res.json({
        success: true,
        message: 'Logged out successfully'
      });
    });
  });
};

/**
 * Check authentication status
 */
export const checkAuth = (req, res) => {
  res.json({
    authenticated: req.isAuthenticated(),
    user: req.isAuthenticated() ? {
      email: req.user.email,
      name: req.user.name,
      role: req.user.role
    } : null
  });
};

/**
 * Handle successful M365 OAuth callback
 */
export const handleOAuthCallback = (req, res) => {
  // Successful authentication
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  res.redirect(`${frontendUrl}/auth/success`);
};

/**
 * Handle failed M365 OAuth login
 */
export const handleLoginFailed = (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  res.redirect(`${frontendUrl}/auth/failed`);
};

export default {
  getCurrentUser,
  logout,
  checkAuth,
  handleOAuthCallback,
  handleLoginFailed
};