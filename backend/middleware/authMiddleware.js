const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization denied - No token provided' });
    }

    // Extract token from header
    const token = authHeader.split(' ')[1];
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Attach user to request object
    req.user = { userId: decoded.userId };
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token is not valid' });
  }
};

module.exports = { authMiddleware };