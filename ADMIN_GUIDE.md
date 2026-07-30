# White Kitchen Pickleball Court Admin Guide

## Recommended Admin URL

Use one official public link for customers. Keep the other deployment as backup or staging.

Recommended setup:

| Purpose | Platform |
|---|---|
| Public customer link | Vercel |
| Backup / future database version | Firebase |

Vercel is the easiest choice for the current static app because it is simple to update from Git and fast for public users. Firebase is useful if the app later needs Firestore or Realtime Database so bookings and queues sync across multiple devices.

Important: the current app stores data in the browser using localStorage. Admin booking data, queues, QR uploads, and PIN changes are saved on the specific device/browser being used.

## Admin Access

1. Open the official site link.
2. Click the Staff button in the header.
3. Enter the admin PIN.
4. Default PIN is 1234 unless changed.
5. After unlocking, Admin and Bookings tabs become visible.

## Public vs Admin Tabs

Public users see:

| Tab | Purpose |
|---|---|
| Book | View schedule and submit reservations |
| Queue | Create and manage public queue boards |
| Payment | View payment QR codes |

Admins can also see:

| Tab | Purpose |
|---|---|
| Bookings | View all reservations |
| Admin | Manage payment verification, morning booking, open play, QR codes, security |

## Confirming Reservations

1. Go to Admin.
2. Find Confirm & Tag Bookings.
3. Review Pending bookings.
4. Verify payment externally through GCash, Maya, BPI, or bank transfer.
5. Change the booking status from Pending to Reserved.

Status rules:

| Status | Meaning |
|---|---|
| Pending | User submitted reservation, payment not yet verified |
| Reserved | Admin verified external payment |

Do not use Confirmed or Paid. The app uses only Pending and Reserved.

## Morning Booking Toggle

Morning schedule is walk-in queue by default.

To enable morning booking:

1. Go to Admin.
2. Find Morning Booking Toggle.
3. Turn on individual hours from 7 AM to 11 AM.
4. Enabled hours become bookable by public users.
5. Disabled hours remain Queue / Walk-in only.

## Open Play Blocks

Use Open Play to block public reservations for a date and time range.

1. Go to Admin.
2. Find Create Open Play Entry.
3. Select date, start time, and end time.
4. Click Add Open Play Block.
5. The schedule shows Reserved — Open Play.

Open Play blocks reservations the same way staff-reserved hours do.

## Payment QR Management

Admins can upload QR codes for multiple payment channels.

Supported channels:

| Channel | Public Button |
|---|---|
| GCash | GCash |
| Maya | Maya |
| BPI / Bank | BPI / Bank |

To update a QR:

1. Go to Admin.
2. Find Payment QR Code & Channels Manager.
3. Select GCash, Maya, or BPI / Bank.
4. Upload an image file or paste a direct image URL.
5. Update the account label if needed.
6. Save.

Users can switch payment QR codes on the Payment tab.

## Queue Module Admin Notes

The Queue tab is public and standalone. It is not tied to reservations.

Queue sessions allow:

| Feature | Details |
|---|---|
| Multiple sessions | More than one queue can exist at the same time |
| Singles and doubles | Singles uses 2 players, doubles uses 4 players |
| Rotation styles | Winner Stays or Fixed Order |
| Score tracking | Exact final scores can be entered |
| Mid-queue joining | Allowed if enabled by the queue creator |
| PIN lock | Protects reset, delete, and admin-style edits |

Queue cleanup:

All queue sessions expire at the end of the day and are removed after midnight on the next page load.

## Security and PINs

Admin PIN:

1. Go to Admin.
2. Find Security.
3. Enter a new PIN.
4. Click Save PIN.

Queue PIN:

1. Queue creator sets a PIN while creating a queue.
2. The PIN is required for reset, delete, and removing players.
3. Normal users can still view queues and submit scores.

## Data Storage Warning

This version has no backend database.

Data is stored in localStorage, which means:

| Behavior | Impact |
|---|---|
| Same browser/device | Data persists |
| Different device | Data does not automatically sync |
| Browser cache cleared | Data may be lost |
| Incognito mode | Data may disappear after closing browser |

Recommended admin workflow:

Use one dedicated admin device/browser for managing actual reservations until a shared database is added.

## Recommended Future Upgrade

If White Kitchen needs shared live bookings across all users and devices, add Firebase Firestore or Realtime Database.

That would make Firebase the best primary platform.
