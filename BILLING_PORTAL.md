# Billing Portal — Tenant Guide

Your facility now has a **Billing Portal**: the one place to see what you owe the platform, pay it, and track your payment until it's verified.

**URL:** `billing.html?client=<your-facility-id>` (same `?client=` id as your booking page)
**PIN:** your facility's usual **Admin PIN** — the same one staff use on the booking page.

---

## What you see

| Section | What it tells you |
|---|---|
| Summary cards | Your **prepaid balance** (credit held with the platform), your current **plan** and pricing version, your **billing status** as the operator set it, and your total **outstanding** across all unpaid invoices |
| This Month — Projection | A running estimate of this month's platform charges: base subscription, confirmed bookings vs your included allowance, overage so far, and staff-reserved hours. A projection, not a bill — your invoices are the official record |
| Invoices | Every invoice the platform has issued to you, with its exact line items (frozen when it was generated), amounts paid/credited, and its current status |
| If your site is suspended | A banner appears reminding you that settling the invoices below is the path to restoration |

## Invoice statuses

```text
Draft                  → being prepared (nothing owed yet)
Awaiting payment       → official bill, please pay
Submitted              → you reported a payment; the operator is checking
Verified / paid        → the operator confirmed your payment — settled
Partially paid         → some verified; the rest is still due
Rejected               → your payment claim didn't check out (reason shown on the invoice)
Overdue / Waived / Cancelled → operator-set states
```

## Paying an invoice

1. Open the invoice → **"I've Paid — Submit for Verification"**.
2. The **how-to-pay** section on the invoice shows the platform's GCash/bank details. Pay externally first.
3. Submit: payment method, amount, **reference number**, and (recommended) a photo/PDF of your proof.
4. Your submission shows on the invoice as **Pending review**. The operator verifies it and it flips to **Verified** (or **Rejected**, with their reason shown so you can fix and resubmit).

**Important:** submitting a payment is a *claim*, not a payment. An invoice only becomes paid when the platform operator verifies it. Never delete your reference numbers.

---

## Notes

- Your product data (bookings, store, tournaments) is untouched by anything here — this portal only covers **platform charges** (what your facility owes the platform operator for using the system).
- The portal is gated by your Admin PIN. If staff change the PIN under Admin → Security, the portal PIN changes with it.
- No card details or bank credentials are stored anywhere — payments happen entirely on GCash/bank, with you submitting the reference for manual verification.
