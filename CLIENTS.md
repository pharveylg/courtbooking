# Client Deployment Registry

Single source of truth for every live deployment. Update this file
whenever a client goes live, renews, or churns.

| Client | Branch | Vercel URL | Firebase Project | Custom Domain | Plan | Setup | Renewal | Status |
|---|---|---|---|---|---|---|---|---|
| White Kitchen | `main` | `courtbooking.vercel.app` | `courtbooking-85175` | — | ₱10k setup / incl. 12mo | 2026-08 | 2027-08 | ✅ Live |
| Ace Pickle Club | `client/ace-pickle` | — | — | — | — | — | — | ⬜ Planned |
| | | | | | | | | |

## Plan reference

| Plan | Setup | Includes | After 12 months |
|---|---|---|---|
| A — Monthly | ₱3,000 | Hosting, updates, support | ₱500/mo continues |
| C — Annual | ₱10,000 | Setup + 12 months all-in | Optional ₱500/mo; else export data & sunset |

## Notes

- **Software ownership** stays with the developer; clients receive a
  non-exclusive license to use their deployment.
- **Client data** belongs to the client. On termination, export their
  Firestore (Console → Firestore → Export) before sunsetting the project.
- One Firebase project per client — never share a database between clients.
