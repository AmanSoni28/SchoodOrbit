# Roles & permissions

Backend is the source of truth; frontend `RoleGate` is UX only.

| Capability | Super Admin | College Admin | Faculty | Student | Parent |
|---|---|---|---|---|---|
| Branding, feature flags, health | Manage | Read settings | — | — | — |
| Users | Manage (only role that grants admin roles) | Manage non-admin users | — | — | — |
| Academic structure, courses, offerings, enrollment | Read | Manage | Read structure | — | — |
| Lessons, assignments, quizzes, question bank | — | Read (oversight) | **Assigned offerings only** | Published items in enrolled, published offerings | — |
| Grading, attendance marking, announcements | — | Read | Assigned only | Own published grades/attendance | — |
| Doubt board | — | Moderate + audited identity reveal | Answer & moderate (assigned) | Post / vote / report (anonymous) | — |
| AI Homework Helper | — | Course policy via faculty | Set course policy; **cannot read chats** | Own sessions only | Never |
| AI content generator | — | — | Generate, edit, approve, publish | — | — |
| Class insights | — | College overview + offering read | Assigned offerings | — | — |
| Daily revision | — | Read policy | Configure, view stats | Attempt | — |
| Parent portal | — | Verify links & consent scopes | — | See & revoke parent access | Linked student, consented scope, published data only |
| Audit log | Read | Read | — | — | — |

## Enforcement points
- `authenticate`: JWT signature + expiry, then the user is reloaded from the database (suspension takes effect immediately) and the MFA policy is checked.
- `lib/policies.ts`: `assertInstructor`, `assertStaff`, `assertMember`, `assertStudent`, `assertParentScope` (audited; returns 404 for unlinked students).
- Doubts: a single serializer strips `authorId`; identity reveal is College Admin only, needs a reason, and is written to the moderation log and the audit log.
- AI sessions: `ownSession` returns 404 to anyone but the owning student.
- Files: readable by the owner or through the record they're attached to (`canAccessFile`).
