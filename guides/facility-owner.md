# Facility Owner Guide: Set Up Your Facility Yourself

This guide is for facility owners who create and publish their own facility on the Court Booking platform, without a platform operator setting it up for them.

## Two things to know first

- **Your owner account does two things only:** it lets you publish your facility, and it shows you the "finish setup" reminder. **You do not get an admin role on your booking site.** Admin areas still require the facility's Admin PIN. That includes you. Staff use the same shared Admin PIN, and there are no individual staff logins.
- **Your facility stays hidden from players until you publish it.** You can save your setup as often as you like. Publishing is the step that makes it visible on the public facility picker.

## How to reach setup today

The public facility picker is the main page of the booking site, the page shown when no facility is selected. It is the only public page that links to setup.

1. Open the main site address.
2. Below the search box, click **Own a facility? Set it up yourself.**

If you already started a facility and did not publish it, signing in on the picker shows a yellow card, **You have an unfinished facility**, with a **Finish setup →** link. See Flow 6.

---

## Flow 1: Sign in to set up your facility

**Goal**
Sign in with your owner account so your facility is saved under your name.

**Who this is for**
A facility owner starting a new facility, or returning to one you started. Setup always requires a signed-in account.

**Where**
The first setup screen, titled "Sign in to create your facility." You reach it from the **Own a facility? Set it up yourself** link on the picker.

**Steps**
1. Click **Sign in with Google**, or type your email and password in the form and click **Sign in**.
2. If you do not have an account yet, click **Create an account** under the form. Enter your name, email, and password, then click **Create account**.
3. If you already started this facility on this device, click **Go to my facility's checklist** at the bottom of the screen. If this device does not remember a facility, the page asks for your facility's web address name. Type it exactly as it was set.

**What you should see when it worked**
The screen changes to **Create your facility** with your name shown and a **Sign out** link. If you used the checklist link, your facility's checklist opens instead.

**If something goes wrong**
- **"Couldn't sign in with Google"**: the Google window may have been closed or blocked. Try email and password instead.
- **An email or password message under the form**: the email format is not valid, or the password is too short. Correct it and try again.
- **"No facility found for slug ... yet"**: the web address name you typed does not match a facility. Check the spelling, or click **Start over** and create the facility.

**Related flows**
Flow 2 (create your facility), Flow 6 (resume setup from the picker).

---

## Flow 2: Name your facility and set its web address, color, and PIN

**Goal**
Create your facility with a name, a web address, a starter color, and an Admin PIN.

**Who this is for**
A signed-in owner creating a new facility.

**Where**
The **Create your facility** screen, shown after sign-in.

**Steps**
1. Type your business or facility name in **Business / facility name**. The web address is filled in from the name automatically.
2. Review **Web address slug**. It can contain only lowercase letters, numbers, and hyphens. Your booking page address appears under the field and updates as you type. You can edit the slug by hand.
3. Choose a **Starter color**. Click the color square and pick a color, or type a six-digit code such as `#D6FF5F`.
4. Type the **Admin PIN** that staff will use to open the Admin Console. Choose one you will remember. You can change it later under **Admin → Security**.
5. Fill in **Number of courts** and **Hourly rate** (see Flow 3), then click **Create facility**.

**What you should see when it worked**
A green banner appears once, right after creation: "Facility created! One step left — publish it below to make it visible on the public booking picker." Below it, the setup screen shows **Finish setting up** with your facility name. The banner does not appear again on later visits.

**If something goes wrong**
- **"Business name is required," "Enter a web address slug," or "An admin PIN is required"**: fill in the field shown and submit again.
- **"... is already taken. Choose a different slug."**: web address names are unique across the platform. Choose another one.
- **The color you typed is not a full six-digit code** (for example `#FFF`): the facility is created with the default lime color. You can change the color later in the Admin Console.
- **"Something went wrong — please try again."**: check your connection and submit again. If it keeps happening, do not change the details. Wait and try later.
- **The web address cannot be changed on this page.** Choose it carefully before you click **Create facility**.

**Related flows**
Flow 3 (courts and rates), Flow 4 (checklist), Flow 5 (publish).

---

## Flow 3: Add courts and hourly rates

**Goal**
Set how many courts you have and what you charge per hour, so every active court has a rate before you publish.

**Who this is for**
A signed-in owner, during setup and afterwards.

**Where**
- During creation: the **Number of courts** and **Hourly rate** fields on the **Create your facility** form.
- After creation: the Admin Console, under **Court Management** (courts) and **Pricing** (rates).

**Steps**
*During creation:*
1. Enter **Number of courts** from 1 to 20. Each court is created as active and named Court 1, Court 2, and so on.
2. Enter **Hourly rate**. This is what you charge per court, per hour. Every court created here starts with this rate.
3. Click **Create facility**.

*After creation (in the Admin Console):*
4. Open the Admin Console (see Flow 4, step 2 or 3). Go to **Court Management** and click **Add Court** to add a court. Rename it there if you want.
5. Go to **Pricing** and enter an hourly rate for each active court.

**What you should see when it worked**
**Court Management** lists each court as active. **Pricing** shows a rate for each court. On the setup checklist, **Hourly rate set for every active court** shows a green check.

**If something goes wrong**
- **"Number of courts must be between 1 and 20."**: change the number to a whole number in that range.
- **"Enter your real hourly rate — this is what customers get quoted."**: enter a rate above zero.
- **A new court has no rate**: the checklist marks it as missing, and **Publish facility** will not go through until every active court has a rate.

**Related flows**
Flow 2 (create your facility), Flow 4 (checklist), Flow 5 (publish).

---

## Flow 4: Work through the setup checklist

**Goal**
Finish the items required to publish, and add the recommended items that make your booking page ready for players.

**Who this is for**
A signed-in owner who has created a facility and has not published it yet.

**Where**
The **Finish setting up** screen. It has three parts: the checklist, an **Open your Admin Console** box with a PIN field, and a card titled **Worth finishing before you tell people**.

**Steps**
The checklist has two groups:

*Required before you can publish:*
- Business name set
- At least one active court
- Admin PIN set
- Hourly rate set for every active court

*Recommended (publishing does not wait for these):*
- Logo, poster, location and contact info added (Admin → **Branding & Site Settings**)
- A real payment QR uploaded (Admin → **Payment QR & Channels**)
- Operating hours reviewed (Admin → **Operating Hours**)

1. Read the checklist. A green check means the item is done. An empty circle means it is still open.
2. To open the Admin Console right away, type your Admin PIN in the **Open your Admin Console** box and click **Unlock & Open Admin Console**. If the PIN is correct, your booking page opens already in the Admin Console.
3. To open one recommended area, click its **Open ... ↗** link. Your booking page opens in a new tab. Click **Staff** at the top of that page, enter your Admin PIN in the box that appears, and then open the area named in the link.
4. Finish the items in the Admin Console. Return to the setup page and click **I just finished setup elsewhere — refresh this checklist** to update it.
5. When all four required items have green checks, the **Publish facility** button turns on. See Flow 5.

**What you should see when it worked**
Each finished item shows a green check after you refresh the checklist. The text above the publish button changes to "Ready to go live" once all required items are done.

**If something goes wrong**
- **"That PIN doesn't match — try again."**: the PIN is not the current Admin PIN. If you changed it in the Admin Console, use the new one.
- **"Couldn't check your PIN right now"**: check your connection and try again.
- **"Couldn't load your facility's setup right now"**: check your connection and reload the page.
- **The checklist does not show a change you made**: click **I just finished setup elsewhere — refresh this checklist**.

**Related flows**
Flow 3 (courts and rates), Flow 5 (publish).

---

## Flow 5: Publish your facility

**Goal**
Make your facility visible on the public facility picker so players can find it and book.

**Who this is for**
The owner who signed in with the account that created the facility.

**Where**
The **Finish setting up** screen, the **Publish facility** button.

**Steps**
1. Confirm that all four required items show green checks. The **Publish facility** button is turned off until they do.
2. Click **Publish facility**.
3. Wait for the message below the button.

**What you should see when it worked**
The message reads "Published! Your facility now appears on the public facility picker." Open the main site address and search for your facility name. Reload the picker if it does not appear right away.

**If something goes wrong**
- **"Can't publish yet -- missing: ..."**: the list names what is still missing. Complete those items (Flow 4), then try again.
- **"Sign in before publishing a facility."**: sign in again (Flow 1), then retry.
- **"Not your facility."**: you are signed in with a different account. Sign in with the account that created the facility.
- **"No facility found for ..."**: check the web address name.
- **"Could not publish — please try again."**: check your connection and retry.

Publishing is the only booking-site action your owner account takes. It does not give you admin access. Your platform charges are handled separately. See the Billing guide.

**Related flows**
Flow 4 (checklist), Flow 6 (resume setup).

---

## Flow 6: Resume setup from the picker's "Finish setup" card

**Goal**
Find a facility you started but did not publish, and finish it.

**Who this is for**
An owner who closed the page before publishing.

**Where**
The public facility picker. The yellow card **You have an unfinished facility** appears under the search box after you sign in with your owner account.

**Steps**
1. Sign in with the account you used to create the facility. Sign-in is on the account page, which you reach from the account button at the top of the facility picker.
2. Return to the main site address (the facility picker).
3. Wait a moment for the yellow card to appear.
4. Click **Finish setup →**. The setup screen opens for that facility, showing its checklist.
5. Continue with Flow 4 and Flow 5.
6. To hide the card for this browser session only, click **✕**. It returns on your next visit until you publish.

**What you should see when it worked**
The card appears with your facility's setup link. After you publish, the card no longer appears.

**If something goes wrong**
- **The card does not appear**: you may be signed in with a different account, or the facility may already be published. The card is a reminder that checks quietly, so it may not appear if the check fails. Use **Own a facility? Set it up yourself**, sign in, and then click **Go to my facility's checklist**.
- **The card appears but the link goes to the wrong facility**: sign out, sign in with the account that created the facility, and try again.

**Related flows**
Flow 1 (sign in), Flow 5 (publish).
