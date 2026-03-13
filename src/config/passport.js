import passport from 'passport';
import { OIDCStrategy } from 'passport-azure-ad';
import User from '../models/User.js';

/**
 * Microsoft 365 OAuth Configuration using Passport Azure AD
 * 
 * This uses OpenID Connect (OIDC) strategy to authenticate users
 * with their Microsoft 365 accounts
 */

const identityMetadata = `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}/v2.0/.well-known/openid-configuration`;

const passportConfig = {
  identityMetadata: identityMetadata,
  clientID: process.env.AZURE_AD_CLIENT_ID,
  clientSecret: process.env.AZURE_AD_CLIENT_SECRET,
  responseType: 'code',
  responseMode: 'form_post',
  redirectUrl: process.env.OAUTH_REDIRECT_URI,
  allowHttpForRedirectUrl: process.env.NODE_ENV !== 'production', // Allow HTTP in dev
  validateIssuer: true,
  passReqToCallback: false,
  scope: ['profile', 'email', 'openid'],
  loggingLevel: process.env.NODE_ENV === 'development' ? 'info' : 'error',
};

// Verify callback - called after successful authentication
passport.use(
  new OIDCStrategy(
    passportConfig,
    async (iss, sub, profile, accessToken, refreshToken, done) => {
      try {
        console.log('🔐 M365 OAuth - User authenticated:', profile.displayName);

        // Extract user information from Microsoft profile
        const email = profile._json.email || profile._json.preferred_username;
        const name = profile.displayName;
        
        if (!email) {
          return done(new Error('No email found in Microsoft profile'), null);
        }

        // Find or create user in database
        let user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
          // Create new user if doesn't exist
          user = await User.create({
            email: email.toLowerCase(),
            name: name,
            microsoftId: profile.oid, // Microsoft Object ID
            role: 'viewer', // Default role - can be changed by admin
            authProvider: 'microsoft',
            lastLogin: new Date()
          });

          console.log(' New user created:', email);
        } else {
          // Update last login
          user.lastLogin = new Date();
          await user.save();
          console.log(' Existing user logged in:', email);
        }

        return done(null, user);

      } catch (error) {
        console.error(' Error in OAuth callback:', error);
        return done(error, null);
      }
    }
  )
);

// Serialize user - store user ID in session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user - retrieve user from database using ID in session
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id).select('-__v');
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

console.log('🔧 Passport M365 OAuth configured');

export default passport;