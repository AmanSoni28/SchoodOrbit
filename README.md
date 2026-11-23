# College LMS

Single-college, white-label Learning Management System. React + Vite + Tailwind frontend, Express 5 + TypeScript + Prisma backend, PostgreSQL 16.

## Prerequisites
- Node.js 20+ (developed on 24), PostgreSQL 16 with a database named `college_lms` (and `college_lms_test` for automated tests).

## First run
```bash
npm install                                   # installs both workspaces
cp backend/.env.example backend/.env          # then fill DATABASE_URL, TEST_DATABASE_URL, JWT_ACCESS_SECRET
cd backend
npx prisma migrate deploy                     # create tables (take a pg_dump backup first on any non-empty DB)
npm run db:seed                               # optional fictional demo data
```

## Develop
```bash
npm run dev:api    # http://localhost:4000/api/v1
npm run dev:web    # http://localhost:5173 (proxies /api to the API)
npm test           # backend unit + API integration tests (uses college_lms_test only)
```

Demo accounts after seeding (password `Demo@Pass2026`, fictional `.test` domain):
`superadmin@northbridge.test`, `admin@…`, `faculty@…`, `faculty2@…`, `student@…` … `student6@…`, `parent@…`.

## AI features
Set `ANTHROPIC_API_KEY` in `backend/.env` (model defaults to `claude-opus-5-5`). Without a key, AI screens show an honest "not configured" state.

See `docs/` for requirements, architecture, database design, permissions, API, design system, roadmap, test plan and deployment.
