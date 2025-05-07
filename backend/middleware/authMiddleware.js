const jwt = require('jsonwebtoken');

// Middleware to verify JWT token and attach user to request
const authMiddleware = (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Access denied. No token provided' });
    }

    // Extract token from "Bearer <token>"
    const token = authHeader.split(' ')[1];
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Attach user data to request
    req.user = decoded;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error.message);
    res.status(401).json({ error: 'Token is not valid' });
  }
};

module.exports = authMiddleware;