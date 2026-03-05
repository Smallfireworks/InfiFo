# Infinite Folio (InfiFo)

## Frontend Features (Current)

- Owner / Visitor mode switch in sidebar.
- `Visitor` mode is read-only in UI (no add/edit/delete/drag/run/connect actions).
- `Owner` mode can edit canvas, organize blocks, lock/unlock grouped blocks, and create links.
- Block types:
  - `Text (Markdown)`
  - `Code`
  - `Image`
  - `Music`
  - `Drawing`
  - `Graph` (function plotting + geometry command drawing)
  - `Area`
- Code chain:
  - Topological chain execution
  - Breakpoint toggle + hit highlight
  - Step speed control
- Layout rules are configurable and persisted locally:
  - organize mode: `stack | grid | waterfall`
  - drag snap mode: `off | grid | smart guides`
  - frame visibility toggle

> Important: this is still frontend-only access control. It is **not** secure against malicious users by itself.

## Backend Auth & Security TODO

1. Authentication and session
   - Add login flow for blog owner (password/OAuth/JWT/session cookie).
   - Issue signed access tokens and refresh strategy.
   - Add logout + token revocation.

2. Authorization model (Owner vs Visitor)
   - Add role field to user model: `owner | visitor`.
   - Enforce permissions in backend middleware, not in frontend.
   - Deny all write operations unless role is `owner`.

3. API permission matrix
   - `GET /notes`, `GET /blocks`, `GET /connections`: allow visitor.
   - `POST/PUT/PATCH/DELETE` on notes/blocks/connections/layout: owner only.
   - Return `401` for unauthenticated, `403` for authenticated but unauthorized.

4. Data integrity checks
   - Validate payload schema server-side for each block type.
   - Validate ownership and parent-child relationship before update.
   - Reject illegal `locked`, `parentId`, and `connections` combinations.

5. Secure code execution
   - Do not trust browser-side code execution for security boundaries.
   - Move execution to isolated sandbox runtime (container/VM/WebContainer/isolated worker service).
   - Add execution timeout, memory/CPU limits, network restrictions, and output size limits.

6. Abuse protection
   - Add rate limit for mutation and code-run endpoints.
   - Add audit logs for write operations (who/when/what changed).
   - Add CSRF protection if using cookie-based sessions.

7. Persistence and versioning
   - Replace mock state with database persistence.
   - Add optimistic locking/version field to avoid concurrent overwrite.
   - Add operation history for rollback on malicious or accidental edits.
