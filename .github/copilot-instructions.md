B1ackb0x — Project Best Practices
A consolidated set of guidelines to maintain code quality, consistency, security, and readability across both frontend and backend of the B1ackb0x application.

1. Project Overview
B1ackb0x is a secure journaling platform that captures, encrypts, and stores personal video logs. Videos are encrypted end-to-end, tied to individual user accounts, and stored in AWS S3. Users can record, pause/resume, review, and delete entries through a React/TypeScript frontend backed by a Node.js/Express/MongoDB API.

2. Technology Stack
• Frontend: React, TypeScript, Vite, Tailwind CSS
• Backend: Node.js, Express, TypeScript (or JS), Mongoose (MongoDB)
• Security: AES-GCM client-side encryption, JWT auth, HTTPS, cors, helmet
• Storage: AWS S3 (SSE-S3/SSE-KMS), signed URLs
• Dev Tools: ESLint, Prettier, Husky (pre-commit), dotenv

## 3. Directory Structure
/Blackb0x
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── context/
│   │   ├── services/
│   │   ├── utils/
│   │   └── index.tsx
│   ├── public/
│   ├── vite.config.ts
│   └── tsconfig.json
└── backend/
    ├── src/
    │   ├── config/
    │   ├── controllers/
    │   ├── middleware/
    │   ├── models/
    │   ├── routes/
    │   ├── utils/
    │   └── server.ts
    ├── scripts/   # test-mongo.js, test-s3.js
    ├── .env
    └── tsconfig.json

4. Frontend Best Practices
4.1 Component Design
• File & Naming: One component per file, PascalCase filename (VideoRecorder.tsx).
• Length: Keep components ≤ 50 lines. Break out logic into custom hooks or child components.
• Props: Always type props / use interfaces. Avoid any.
Bad:
const MyComponent = ({x}: any) => {
// 100+ lines, mixing logic/UI
}
Good:
interface Props { count: number; }
export function Counter({ count }: Props) {
return <span>{count}</span>;
}
4.2 State & Hooks
• Extract reusable logic into custom hooks (useAuth, useCrypto).
• Always specify dependencies for useEffect.
• Avoid deeply nested state; lift up when shared.
4.3 Styling
• Use Tailwind CSS with utility-first classes.
• Follow a consistent order: layout → box-model → typography → color → misc.
4.4 API Calls
• Centralize HTTP logic in services/api.ts (Axios/Fetch wrappers).
• Use interceptors to inject JWT tokens.
• Handle errors with consistent UI feedback (toasts/snackbars).
4.5 Tooling
• ESLint + Prettier: Enforce code style and catch errors early.
• Husky: Run lint and tests on pre-commit.

5. Backend Best Practices
5.1 Architecture & Layering
• controllers/: HTTP handlers only.
• services/ (optional): Business logic and DB calls.
• models/: Mongoose schemas with validation.
• routes/: Wire controllers to paths.
5.2 Error Handling
• Use centralized error middleware to catch and format errors.
• Always return consistent JSON shape: { error: string, details?: any }.
5.3 Security
• Auth: JWT in Authorization: Bearer. Verify in middleware.
• Input Validation: Validate body/query with Joi or custom logic.
• Helmet & cors: Enable basic headers and restrict origins.
• Rate Limiting: e.g. express-rate-limit on auth routes.
5.4 Environment & Config
• Store secrets in .env; load via dotenv.
• Do not commit .env.
• Use config modules to centralize and strongly type env variables.
5.5 Logging & Monitoring
• Log at different levels: info, warn, error.

6. Security & Compliance
• E2EE: Perform encryption/decryption strictly on client.
• HTTPS: Enforce via reverse proxy or app.use(helmet()).
• Access Controls: S3 signed URLs expire quickly.
• Data Privacy: Only store minimal metadata server-side.