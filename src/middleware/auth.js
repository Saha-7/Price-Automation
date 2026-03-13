/**
 * Authentication Middleware
 * Protects routes and checks user roles
 */

/**
 * Middleware to check if user is authenticated
 */
export const authenticateUser = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  
  return res.status(401).json({
    success: false,
    message: 'Unauthorized. Please login with your Microsoft account.'
  });
};

/**
 * Middleware to check if user has specific role
 * @param {string|array} roles - Required role(s)
 */
export const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized. Please login.'
      });
    }
    
    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden. Required role: ${allowedRoles.join(' or ')}`
      });
    }
    
    next();
  };
};

/**
 * Middleware to check if user is admin
 */
export const requireAdmin = requireRole('admin');

/**
 * Middleware to check if user can approve prices (admin or manager)
 */
export const canApprove = requireRole(['admin', 'manager']);

export default {
  authenticateUser,
  requireRole,
  requireAdmin,
  canApprove
};