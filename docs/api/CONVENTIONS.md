# API Conventions (Phase 2)

## Base Path And Versioning
- Base API path: `/api/v1`
- Contract file: `docs/api/openapi.v1.yaml`
- Any breaking change requires a new version path (e.g. `/api/v2`)

## Response Envelope

Success shape:
```json
{
  "data": {},
  "meta": {
    "request_id": "req_...",
    "timestamp": "2026-02-14T10:00:00Z"
  }
}
```

Error shape:
```json
{
  "error": {
    "code": "validation_failed",
    "message": "Validation failed.",
    "details": {
      "field_name": ["The field is required."]
    }
  },
  "meta": {
    "request_id": "req_...",
    "timestamp": "2026-02-14T10:00:00Z"
  }
}
```

## Pagination
- Query params:
  - `page` (default `1`)
  - `per_page` (default `15`, max `100`)
- Response metadata:
```json
{
  "meta": {
    "pagination": {
      "page": 1,
      "per_page": 15,
      "total": 245,
      "total_pages": 17
    }
  }
}
```

## Filtering
- Filter namespace: `filter[...]`
- Example:
  - `filter[search]=john`
  - `filter[status]=scheduled`
  - `filter[date_from]=2026-02-01`
  - `filter[date_to]=2026-02-28`

## Sorting
- Query param: `sort`
- Format: comma-separated field names
- Descending: prefix field with `-`
- Example: `sort=-created_at,full_name`

## Authentication
- Session-based auth via Laravel Sanctum.
- Session cookie must be `httpOnly`.
- CSRF protection required for state-changing requests.

## Authorization
- Roles: `admin`, `dentist`
- Dentist routes must enforce per-user data ownership.
- Admin routes must be explicitly role-gated.

