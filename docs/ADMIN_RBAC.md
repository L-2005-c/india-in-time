# Admin RBAC & Identity Configuration

Admin endpoints use Firebase ID tokens with custom claims or environment-configured administrator whitelisting via `ADMIN_EMAILS`.

### Configuration Requirements:
- At least one administrator must be configured via `ADMIN_EMAILS` (comma-separated list of emails in environment) or via Firebase custom claim (`admin: true`).
- If neither is configured, all administrative endpoints fail closed and return `401 Unauthorized` or `503 Service Unavailable`.

### Role Hierarchy & Defaults:
- `owner`: full administration, feature flags, ML training and analytics.
- `admin`: operational administration and analytics.
- `analytics`: read-only analytics, metrics, and model status (**default role for whitelist-matched admins**).

> **Security Note:** Whitelist-based admins default to the lowest privilege (`'analytics'`, read-only). Elevated privileges (`'admin'` or `'owner'`) require explicit Firebase custom claims (`role: "owner"` or `role: "admin"`).

Example Firebase custom claim:
```json
{ "admin": true, "role": "owner" }
```

Shared legacy keys have been permanently eliminated. All admin actions require authenticated Firebase ID tokens.
