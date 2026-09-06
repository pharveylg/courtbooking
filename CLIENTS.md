# Client Deployment Registry

Single source of truth for every tenant's real-world status. Update this
file whenever a tenant actually goes live (starts billing), renews, or
churns. All tenants share one deployment (`courtbooking-85175.web.app`,
Firebase project `courtbooking-85175`) and are resolved via `?client=<id>`
-- there is no per-client branch, domain, or Firebase project anymore.

| Client | Tenant ID | Real customer? | Plan | Setup | Renewal | Status |
|---|---|---|---|---|---|---|
| Samahan D' Paddle Hub | `samahan` | Yes | — | — | — | ⬜ Demo (not billing) |
| White Kitchen | `white-kitchen` | Yes | — | — | — | ⬜ Demo (not billing) |
| Ace Pickleball Academy | `acepickle` | No — fictitious | — | — | — | Demo only |
| Demo Pickleball Club | `demo` | No — fictitious | — | — | — | Demo only |
| Rally Point Sports | `rally-point` | No — fictitious | — | — | — | Demo only |
| Smash Pickleball Club | `smash-club` | No — fictitious | — | — | — | Demo only |

No tenant is live/billing as of this writing. Flip a row to "✅ Live" and
fill in Plan/Setup/Renewal only once that customer actually goes live.

## Plan reference

| Plan | Setup | Includes | After 12 months |
|---|---|---|---|
| A — Monthly | ₱3,000 | Hosting, updates, support | ₱500/mo continues |
| C — Annual | ₱10,000 | Setup + 12 months all-in | Optional ₱500/mo; else export data & sunset |

## Notes

- **Software ownership** stays with the developer; clients receive a
  non-exclusive license to use their tenant.
- **Client data** belongs to the client. On termination, export their
  Firestore data scoped to `clients/{tenantId}/**` (Console → Firestore →
  query by prefix, or a targeted export) before removing the tenant.
- All tenants share one Firebase project and one deployment; isolation is
  by Firestore path (`clients/{tenantId}/...`) and Firestore Security
  Rules, not separate infrastructure per client.
