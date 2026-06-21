const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL ERROR: JWT_SECRET is not defined in environment variables');
  process.exit(1);
}

/**
 * Authenticate GraphQL requests using JWT token from Authorization header
 * Similar to main server's authenticateToken middleware
 */
const authenticateGraphQL = (req) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      throw new Error('Access token required');
    }

    // Verify JWT token
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.type !== 'access') {
      throw new Error('Invalid token type');
    }

    // Extract user information from token
    const user = {
      id: decoded.userId || decoded.id,
      userId: decoded.userId || decoded.id,
      email: decoded.email,
      name: decoded.name,
    };

    console.log(`✅ Authenticated user: ${user.id} (${user.email})`);

    return { user, token };
  } catch (error) {
    console.error('❌ Authentication error:', error.message);
    throw new Error(`Unauthorized: ${error.message}`);
  }
};

module.exports = {
  authenticateGraphQL,
  JWT_SECRET
};
