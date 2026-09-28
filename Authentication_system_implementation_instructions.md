Authentication System Implementation Instructions
This document outlines best practices and a recommended file structure for adding user authentication to the Blackbox project, ensuring that video entries are associated with and accessible only by their owners.

1. Overview
• Goal: Only registered users can record, save, view, and delete their own videos.
• Tech Stack:
o Frontend: React, TypeScript, Vite
o Backend: Node.js, Express, TypeScript (or JavaScript)
o Database: MongoDB with Mongoose
o Storage: AWS S3

2. ## Backend File Structure (`backend/src/`)

```plaintext
backend/src/
├── config/
│   └── db.ts               # MongoDB connection logic
├── controllers/
│   ├── authController.ts   # register, login, getCurrentUser
│   └── videoController.ts  # video CRUD (protected)
├── middleware/
│   └── authMiddleware.ts   # JWT verification
├── models/
│   ├── User.ts             # email, hashed password, timestamps
│   └── Video.ts            # s3Key, iv, jwk, ownerId, metadata
├── routes/
│   ├── authRoutes.ts       # /api/auth/register, /login, /me
│   └── videoRoutes.ts      # /api/videos (all protected)
├── utils/
│   └── validate.ts         # input validation helpers
└── server.ts               # Express app setup and route mounting

3. Backend Implementation Guidelines
3.1 User Model (models/User.ts)
• Fields: email: { type: String, unique: true, required: true }, password: { type: String, required: true }, createdAt: Date.
• Before saving, hash passwords with bcrypt (e.g. bcrypt.hash(password,
saltRounds)).
3.2 Auth Controller (controllers/authController.ts)
• register:
1. Validate email & password.
2. Hash password.
3. Save new User.
4. Sign JWT (e.g. jwt.sign({ userId }, process.env.JWT_SECRET)).
5. Return token & user info.
• login:
1. Validate credentials.
2. Compare password with bcrypt.compare().
3. Issue JWT.
4. Return token & user info.
• getCurrentUser:
1. Extract and verify JWT from Authorization header.
2. Return user profile.
3.3 Auth Routes (routes/authRoutes.ts)
import express from 'express';
import { register, login, getCurrentUser } from
'../controllers/authController';
import { authMiddleware } from '../middleware/authMiddleware';
const router = express.Router();
router.post('/register', register);
router.post('/login', login);
router.get('/me', authMiddleware, getCurrentUser);
export default router;
3.4 Auth Middleware (middleware/authMiddleware.ts)
• Parse Authorization: Bearer <token>.
• Verify with jwt.verify(token, process.env.JWT_SECRET).
• Attach req.user = { userId } on success.
• Return 401 Unauthorized on failure.
3.5 Protect Video Routes
• Apply authMiddleware to all /api/videos endpoints.
• In controllers, use req.user.userId as ownerId for create, and filter Video.find({ ownerId }) when reading.

4. Frontend File Structure (frontend/src/)
frontend/src/
├── components/
│ ├── VideoRecorder.tsx # record & encrypt then POST
│ ├── EntryList.tsx # fetch & decrypt then play
│ ├── AuthForm.tsx # combined Login/Register form
│ └── ProtectedRoute.tsx # route guard
├── context/ │ └── AuthContext.tsx # user state & auth methods
├── hooks/
│ └── useAuth.ts # custom hook for context
├── pages/ │ ├── Login.tsx
│ ├── Register.tsx
│ └── Dashboard.tsx # hosts VideoRecorder & EntryList
├── services/
│ └── api.ts # axios instance with interceptors
└── utils/
└── storage.ts # token storage (cookies or localStorage)

5. Frontend Implementation Guidelines
5.1 API Service (services/api.ts)
• Create an Axios instance with baseURL = '/api'.
• Add request interceptor to include Authorization: Bearer <token> from secure storage.
5.2 Auth Context & Hook (context/AuthContext.tsx, hooks/useAuth.ts)
• Provide methods: register(email, password), login(email, password),
logout().
• Store JWT in secure, httpOnly cookie (recommended) or localStorage.
• Expose user and isLoggedIn state.
5.3 ProtectedRoute Component
• Wrap protected routes to redirect unauthenticated users to /login.
5.4 Integrate in Components
• On login/register: call API, store token, update context.
• On mount of Dashboard: fetch /api/auth/me to hydrate user.
• VideoRecorder & EntryList: call /api/videos with token; backend filters by ownerId.
6. Security Best Practices
• HTTPS in production.
• httpOnly cookies for tokens to prevent XSS.
• CSRF protection if using cookies.
• Rate-limit auth endpoints.
• Validate inputs on both client and server.
• Environment variables for all secrets.
• CORS: restrict origins in Express config.
End of instructions.md