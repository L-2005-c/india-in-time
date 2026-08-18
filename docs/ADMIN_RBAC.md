# Admin RBAC

Admin endpoints use Firebase ID tokens with custom claims. The minimum claim is `admin: true`; administrative role is carried in `role`.

Supported roles:
- `owner`: full administration, feature flags, ML training and analytics
- `admin`: operational administration and analytics
- `analytics`: read-only analytics, metrics and model status

Example claim:

```json
{ "admin": true, "role": "analytics" }
```

Shared `x-admin-key` administrator authentication has been removed entirely. All administrator access uses Firebase ID tokens with explicit custom claims and roles.
