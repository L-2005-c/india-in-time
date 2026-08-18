# Location Data Retention Policy

India In-Time should treat precise user location as sensitive operational data.

## Rules
- Do not log precise coordinates unless required for a user-requested operation or security/diagnostic need.
- Prefer coarse city/region identifiers in analytics.
- Do not include raw GPS coordinates in normal application logs.
- Retain precise location only for the minimum period required by the feature.
- Remove or aggregate historical location data when the feature no longer requires precision.
- Access to retained location data must be authenticated and audited.
