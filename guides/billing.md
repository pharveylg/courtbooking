# Billing Guide: Facility Billing Portal

This guide is for the people who handle your facility's platform charges: the amounts your facility owes the platform operator for using the booking system.

The billing portal covers **platform charges only**. It does not show your players' bookings or payments. Those stay in your booking site's Admin Console.

## How to reach the portal

The billing portal is not linked from the booking site. Your platform operator gives you the billing link. It has the same facility ID that appears after `client=` in your booking page address.

Anyone who knows the Admin PIN can open the portal and submit payment claims. Keep the PIN private.

---

## Flow 1: Open the billing portal

**Goal**
Open the portal with your facility's Admin PIN so you can see your invoices and submit payments.

**Who this is for**
The person who handles platform payments for the facility. The portal uses the same Admin PIN as the booking page, so staff who know that PIN can also open it.

**Where**
The billing link from your platform operator. The gate screen shows your facility name followed by "Billing," with a PIN box below it.

**Steps**
1. Open the billing link from your platform operator.
2. Wait for the screen to show your facility name and the PIN box.
3. Type your facility's Admin PIN in the box.
4. Click **Open Billing Portal →**.

**What you should see when it worked**
The portal opens with your facility name in the header and the subtitle "Billing & Invoices — platform charges." Four summary cards appear at the top, followed by **This Month — Projected Platform Charges** and **Invoices**.

**If something goes wrong**
- **"Incorrect PIN."**: the PIN does not match your facility's current Admin PIN. Try again. If staff changed the PIN recently, use the new one.
- **"No tenant specified. Open this page as ..."**: the link is missing your facility ID. Ask your platform operator for the full billing link.
- **"Failed to verify PIN"** or **"Failed to load"**: check your connection and try again. If it keeps failing, contact your platform operator.
- **The portal stays open after a PIN change**: the portal remembers the PIN for this browser tab. Click **Lock** in the header, then sign in again with the new PIN.
- **To leave the portal**: click **Lock**. Closing the browser tab also ends the session.

**Related flows**
Flow 2 (view invoices), Flow 3 (submit a payment).

---

## Flow 2: View your invoices and their status

**Goal**
Check what your facility owes, what has been paid, and where each invoice stands.

**Who this is for**
The person who handles platform payments, after opening the portal (Flow 1).

**Where**
- The four summary cards at the top of the portal.
- **This Month — Projected Platform Charges**, with its **Refresh** button.
- **Invoices**, with its **Refresh** button.

**Steps**
1. Open the portal (Flow 1).
2. Read the summary cards:
   - **Prepaid balance**: credit held with the platform. A negative amount appears in red.
   - **Current plan**: your plan and its pricing version, or "manual billing formula" if no plan is set.
   - **Billing status**: the status your platform operator has set, such as current, grace, or overdue.
   - **Outstanding (unpaid invoices)**: the total still due across open invoices. Draft, verified, waived, and cancelled invoices are not counted.
3. Read **This Month — Projected Platform Charges**. It shows the base subscription, confirmed bookings against your included allowance, booking overage, and staff-reserved hours. Click **Refresh** to recalculate. This is an estimate. Your invoices are the official record.
4. In **Invoices**, read the newest invoice first. The list covers the last 12 months.
5. On each invoice, read the status badge, the total, and the line items. If part of the invoice is paid, the line under the total shows the amount paid, any credit applied, and the remaining balance.
6. To see how to pay, open **How to pay** on an invoice that is awaiting payment or otherwise still due.
7. Click **Refresh** in the **Invoices** section to pick up changes your platform operator made since you opened the portal.

**Invoice status guide**

| Status shown | What it means | What you do |
|---|---|---|
| Draft | Being prepared. Nothing is owed yet. | Nothing. Wait for an issued invoice. |
| Awaiting payment | Official bill. Please pay. | Pay, then submit the payment (Flow 3). |
| Submitted — awaiting verification | You reported a payment. The operator is checking. | Wait. Submit again only if your operator asks you to. |
| Partially paid | Part of the invoice is verified. The rest is still due. | Pay the remaining amount, then submit (Flow 3). |
| Verified / paid | The operator confirmed your payment. Settled. | Nothing. |
| Payment rejected | Your payment claim did not check out. The reason is shown. | Fix the issue and submit again (Flow 3). |
| Overdue | Past due. | Pay, then submit (Flow 3). |
| Waived or Cancelled | No payment is needed for this invoice. | Nothing. |

**What you should see when it worked**
Each invoice shows a status badge that matches the table above, a total, and its line items. The summary cards show current figures.

**If something goes wrong**
- **"Failed to load invoices"**: click **Refresh** in the **Invoices** section. If it persists, contact your platform operator.
- **"No invoices yet"**: your platform operator has not issued any invoices for your facility yet.
- **A one-time setup invoice appears as Draft after you publish a self-serve facility**: this can happen if the platform has a one-time setup fee for your plan. Draft means nothing is owed yet. Your operator issues it when it is ready.
- **Your site is suspended banner**: the banner appears when your facility's status is suspended, restricted, cancelled, or archived. Once your invoices are settled, your platform operator can restore access.

**Related flows**
Flow 1 (open the portal), Flow 3 (submit a payment).

---

## Flow 3: Submit a payment for verification

**Goal**
Tell the platform operator you paid an invoice, with your payment reference and proof, so they can verify it.

**Who this is for**
The person who pays platform invoices for the facility.

**Where**
An invoice in **Invoices** that shows the button **I've Paid — Submit for Verification**. The button appears only for invoices that are awaiting payment, partially paid, overdue, or rejected.

**Steps**
1. Pay the amount outside the portal, using the GCash or bank details shown in **How to pay** on the invoice.
2. In **Invoices**, click **I've Paid — Submit for Verification** on the invoice you paid.
3. In the window that opens, read the payment instructions at the top. If it says the operator has not published payment instructions yet, contact your platform operator before you pay.
4. In **Paid via**, choose **GCash**, **Maya**, **Bank transfer**, or **Cash**.
5. In **Amount paid (₱)**, check the amount. It is pre-filled with the remaining balance. Change it to the amount you actually paid.
6. In **Reference number**, type the GCash reference, transaction number, or bank reference for this payment.
7. Optional but recommended: in **Proof of payment**, choose a photo or PDF of your receipt. The file must be an image or a PDF and under 8 MB.
8. Click **Submit for Verification**.

**What you should see when it worked**
A message appears: "Payment submitted — the platform operator will verify it." The window closes.

The invoice status does not change yet. A submission is a claim, not a payment. Once your payment is verified, the invoice shows **Verified / paid**, or **Partially paid** if only part of the amount was verified.

Under **Your submissions** on that invoice, the claim appears as **Pending review**. If that list stays empty after you click **Refresh**, do not submit again right away. Ask your platform operator to confirm they received your claim.

**If something goes wrong**
- **"Enter the amount you actually paid."**: enter an amount above zero.
- **"Failed to submit: ..."**: the file may be too large, or it may not be an image or PDF. No claim is recorded when this message appears, so fix the file and submit again. If it still fails, contact your platform operator.
- **Your claim shows "Rejected"**: the operator's reason appears under **Your submissions** and in a red box on the invoice ("Last payment was rejected"). Fix the issue, then click **I've Paid — Submit for Verification** and submit again.
- **The button does not appear**: the invoice is not in a state that takes payment (for example Draft, Submitted, Verified, Waived, or Cancelled). Check the status in Flow 2.
- **You paid twice or submitted the wrong amount**: contact your platform operator. Do not submit a second claim to correct it.

**Related flows**
Flow 2 (view invoices and status), Flow 1 (open the portal).
