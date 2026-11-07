# Tournament Organizer Guide

This guide is for the people who run tournaments for a facility. You set up the tournament, register players, build the bracket, publish the schedule, and enter match results in **Tournament Admin**.

Players do not need an account or a PIN to follow a tournament. They use the public tournament page, which shows the schedule, standings, live scores, and photos.

For the rest of the facility's Admin Console (bookings, courts, pricing, queues, and the Store), see the Facility Staff Guide.

---

## Before You Start

**The Tournaments add-on must be turned on for your facility.** The Tournament Admin page opens only when your facility has this add-on. Check the **Pickle Court Tournaments** card in the Admin Console:

- If it says **Not enabled — contact support**, your facility does not have the add-on yet. Contact your platform administrator.
- If it says **Paused — contact operator**, the add-on is temporarily paused. Your booking and Store tools still work. Contact your platform administrator to resume it.

**You need the facility's Admin PIN.** Tournament Admin uses the same Admin PIN as the Admin Console. There is no separate tournament PIN. See "The Tournament Admin PIN" below.

**Players register through you.** The public tournament page does not have a registration form. The organizer adds each player or pair in Tournament Admin.

**Your facility's Admin PIN unlocks the Admin Console first.** You must unlock the Admin Console on the booking site before the **Go to Tournaments →** link appears.

**Setup order.** The app works best if you follow this order:

1. Sign in to Tournament Admin.
2. Create the tournament.
3. Add at least one division.
4. Publish the tournament.
5. Register players and check them in.
6. Generate the bracket for each division.
7. Set up locations and tournament days, then generate and publish the schedule.
8. Enter match results as they finish.

---

## Sign In to Tournament Admin

**Goal:** Open the Tournament Admin page and unlock it with the Admin PIN.

**Who this is for:** Tournament organizers and anyone who runs tournaments for the facility.

**Where:** Your facility's booking site, in the **Admin** area, on the **Pickle Court Tournaments** card. The link is **Go to Tournaments →**. It opens Tournament Admin in a new browser tab.

**Steps**

1. Unlock the Admin Console on your facility's booking site (see the Facility Staff Guide).
2. Find the **Pickle Court Tournaments** card in the Admin Console.
3. Select **Go to Tournaments →**. A new tab opens.
4. In the box that says **Enter the facility's Admin PIN to continue**, type the Admin PIN.
5. Select **Unlock →**.

**What you should see when it worked:**

- The page title shows your facility's name with the words "Pickle Court Tournaments".
- A list of tournaments appears, with a **+ New Tournament** button.
- A **Lock** button appears in the top bar.

**If something goes wrong:**

- **"Incorrect PIN."** The Admin PIN does not match. Try again. If the PIN works on the booking Admin Console but not here, see "The Tournament Admin PIN" below.
- **"Failed to verify PIN."** The page could not check the PIN. Check your internet connection and try again.
- **"Tournaments Not Available."** The add-on is not turned on for your facility. Contact your platform administrator.
- **"Tournaments Paused."** The add-on is paused. Contact your platform administrator.
- **"No Facility Selected."** The page opened without your facility's details. Go back to the booking site's Admin Console and select **Go to Tournaments →** again.

**Related flows:** The Tournament Admin PIN, Create a Tournament.

---

## Sign Out of Tournament Admin

**Goal:** Lock Tournament Admin so the next person must enter the PIN.

**Who this is for:** Any organizer who is finished, especially on a shared computer.

**Where:** The **Lock** button in the top bar.

**Steps**

1. Select **Lock**.

**What you should see when it worked:**

- The page reloads and shows the PIN screen again.

**If something goes wrong:**

- **The page still shows the tournament list.** Close the tab. Tournament Admin stays unlocked in that browser tab until you lock it or close it.

**Related flows:** Sign In to Tournament Admin.

---

## The Tournament Admin PIN

**Goal:** Know which PIN opens Tournament Admin, and change it when needed.

**Who this is for:** Organizers and whoever manages the facility's access.

**Where:** Tournament Admin uses the facility's Admin PIN. To change it, use the **Security** tab in the Admin Console on the booking site.

**Steps: change the PIN**

1. Unlock the Admin Console on the booking site.
2. Open the **Security** tab.
3. Type the new PIN in **New PIN**.
4. Select **Save PIN**.
5. Sign in to Tournament Admin with the new PIN.

**What you should see when it worked:**

- The Admin Console shows "PIN updated & synced".
- Tournament Admin accepts the new PIN.

**If something goes wrong:**

- **Tournament Admin says "Incorrect PIN" but the Admin Console accepts the same PIN.** Go to the **Security** tab on the Admin Console, type the same PIN again, select **Save PIN**, and then try Tournament Admin again. This saves the PIN in the form Tournament Admin checks.
- **You cannot find a separate tournament PIN setting.** There is none. Tournament Admin uses only the Admin PIN.
- **Changing the Admin PIN changes it for both** the Admin Console and Tournament Admin. The Store has its own PIN, and changing the Store PIN does not affect Tournament Admin.

**Related flows:** Sign In to Tournament Admin.

---

## Create a Tournament

**Goal:** Start a new tournament. It is saved as a draft until you publish it.

**Who this is for:** The organizer who sets up the event.

**Where:** Tournament Admin, the tournament list, **+ New Tournament**.

**Steps**

1. Sign in to Tournament Admin.
2. Select **+ New Tournament**.
3. Type the **Tournament Name**. This field is required.
4. Choose the **Event Type**:
   - **Intra-Tenant (this club only)** for a tournament with only your facility's players.
   - **Dual Meet / Inter-Club** for a tournament between clubs. If you choose this, a field for **Other Participating Club(s)** appears. Type the other clubs' names.
5. Type the **Venue**.
6. Choose the **Start Date**.
7. Choose the **End Date**. If you leave it blank, the end date is the same as the start date. The end date cannot be before the start date.
8. Optional: type the **Admin/Officiating Fee (₱)**.
9. Optional: type the **Prize Pool (₱)**.
10. Select **Save Draft**.

**What you should see when it worked:**

- A short message says "Tournament created as a draft".
- The tournament opens, showing its details and a **Draft** status.
- The new tournament appears in the tournament list.

**If something goes wrong:**

- **"Enter a tournament name."** The name box is empty.
- **"End date is before start date."** Change the end date.
- **The fee and prize amounts are your own budget.** Entry fees are set separately for each division. Do not enter entry fees here.

**Related flows:** Add a Division, Publish a Tournament.

---

## Add a Division

**Goal:** Add an event category, such as Men's Doubles, with its own format, fee, and scoring. Every tournament needs at least one division before it can be published.

**Who this is for:** The organizer who sets up categories.

**Where:** Open the tournament. In the **Divisions** section, select **+ Add Division**.

**Steps**

1. Open the tournament and select **+ Add Division**.
2. Type the **Division Name**, for example "Men's Doubles". This field is required.
3. Choose the **Category**:
   - Men's Singles
   - Women's Singles
   - Men's Doubles
   - Women's Doubles
   - Mixed Doubles
   - Custom / Other
4. Choose the **Format**:
   - Round Robin
   - Single Elimination
   - Group Stage → Knockout
5. Choose the **Seeding Method**: Random, DUPR Rating, or Manual (set by Director).
6. Optional: type the **Max Participants**. Leave it blank for no limit.
7. Optional: type the **Entry Fee per Team/Player (₱)**.
8. Choose the **Match format** that the live scoreboard uses:
   - **Game to**: 7, 9, 11, 15, or 21
   - **Win by**: 2 or 1
   - **Best of**: one game, 3, or 5
   - **Scoring**: side-out or rally
9. Optional: type **DUPR Min** and **DUPR Max** to limit the division to a rating range.
10. Select **Add Division**.

**What you should see when it worked:**

- A short message says "Division added".
- The division appears in the **Divisions** list with its format, maximum size, entry fee, match format, and DUPR range.

**If something goes wrong:**

- **"Enter a division name."** The name box is empty.
- **Custom / Other and doubles.** For a custom category, you choose whether it is a doubles division when you register players. Men's Doubles, Women's Doubles, and Mixed Doubles always register two players.

**Related flows:** Create a Tournament, Register Players.

---

## Publish a Tournament

**Goal:** Change a tournament from Draft to Published, so players can see it on the public tournament page.

**Who this is for:** The organizer, once the details and divisions are ready.

**Where:** Open the tournament and select **Publish →**.

**Steps**

1. Open the tournament.
2. Check that the tournament has at least one division.
3. Select **Publish →**.

**What you should see when it worked:**

- A short message says "Tournament published".
- The status changes from **Draft** to **Published**.

**If something goes wrong:**

- **"Add at least one division before publishing."** Add a division first (see "Add a Division").

- **Publishing the tournament is different from publishing the schedule.** Players see the tournament once you publish it. They see match times only after you publish the schedule (see "Generate, Check, and Publish the Schedule").

**Related flows:** Add a Division, Generate, Check, and Publish the Schedule.

---

## Register Players

**Goal:** Add a player, or a pair for doubles, to a division.

**Who this is for:** The organizer who handles entries.

**Where:** Open the tournament. In the **Registration** section, select **+ Register Participant**.

**Steps**

1. Open the tournament and select **+ Register Participant**.
2. Choose the **Division**.
3. Type **Player 1 Phone** and **Player 1 Name**. The phone number identifies the player across tournaments, so use the number the player will keep.
4. Optional: type **Player 1 DUPR (optional)**.
5. For a doubles division, type **Player 2 (Partner) Phone** and **Player 2 (Partner) Name**. Optional: type the partner's DUPR.
6. For a Custom / Other division, check the doubles box first if the entry is a pair.
7. Choose **Partner Selected By**:
   - **Player (brought their own partner)**
   - **Admin-assigned (on-site pairing)**
8. Select **Register**.

**What you should see when it worked:**

- A short message says "Registered".
- The new entry appears in the **Registrations** list.
- The status is **approved**. If the division is already full, the status is **waitlisted**, and the message says the division is full.

**If something goes wrong:**

- **"Add a division first."** Create a division before you register anyone.
- **"Enter player 1's phone and name."** Fill in the first player's details.
- **"Enter player 2's (partner's) phone and name."** The division is a doubles category, so both players are required.
- **"Player 2 must be a different person from Player 1."** The two phone numbers belong to the same player. Use the partner's own phone number.
- **"One of these players is already registered in this division."** A player can be registered only once per division. Withdraw the earlier entry if needed.
- **"Registration is closed -- the bracket for this division has already been generated."** You cannot add players after the bracket is generated. Add the player to a different division, or wait for a later event.

**Related flows:** Check In Players and Manage Entries, Generate a Bracket.

---

## Check In Players and Manage Entries

**Goal:** Mark players as checked in, track entry fees, replace a partner, or withdraw an entry.

**Who this is for:** The organizer on the day of the event.

**Where:** The **Registrations** list in the tournament.

**Steps: check in a player**

1. Find the entry in the **Registrations** list. The entry must have the status **approved**.
2. Select **Check In**.

**Steps: undo a check-in**

1. Find the checked-in entry.
2. Select **Undo Check-In**.

**Steps: record an entry fee payment**

1. Find an entry in a division that has an entry fee. It shows **Fee Pending** until it is paid.
2. Select **Mark Paid** when you receive the payment.
3. Select **Mark Pending** to undo a payment you recorded by mistake.

**Steps: replace a partner**

1. Find the doubles entry.
2. Select **Replace Partner**.
3. Type the new partner's phone number. The box says which partner you are replacing.
4. Type the new partner's full name.

**Steps: withdraw an entry**

1. Find the entry.
2. Select **Withdraw**.
3. Select **OK** in the confirmation box that names the player or pair.

**What you should see when it worked:**

- The status of the entry changes, for example to **checked_in** or **withdrawn**.
- The financial summary for the tournament updates the amounts collected and pending.

**If something goes wrong:**

- **There is no Check In button.** Only entries with the status **approved** can be checked in. A **waitlisted** entry does not show this button.
- **The player's fee still shows as pending.** Select **Mark Paid** after you receive the payment.
- **The partner replacement does not apply.** Make sure both the phone number and the name are filled in.

**Related flows:** Register Players, Generate a Bracket.

---

## Generate a Bracket

**Goal:** Create the matches for one division.

**Who this is for:** The organizer, once registrations are set.

**Where:** Open the tournament. In the **Matches** section, choose the division. Select **Generate Bracket**.

**Steps**

1. Open the tournament.
2. In the **Matches** section, choose the division from the list.
3. Check that the division has enough players. The button is available only when there are at least 2 approved or checked-in entries. For a Group Stage → Knockout division, there must be at least 3. The line under the button shows how many you have.
4. For a Group Stage → Knockout division, review the group settings that appear above the button.
5. Select **Generate Bracket**.

**What you should see when it worked:**

- A short message says "Bracket generated" with the number of matches.
- The matches for the division appear in the **Matches** list.
- Registration for that division closes.

**If something goes wrong:**

- **The button is grayed out.** Add more approved or checked-in entries, or check in players who are waiting.
- **"Failed:" followed by a message.** The bracket was not created. Read the message, fix the cause, and try again.

**Related flows:** Advance a Group Stage to the Knockout, Enter a Match Score, Set Up Locations and Tournament Days.

---

## Advance a Group Stage to the Knockout

**Goal:** Create the knockout bracket once every group match has finished.

**Who this is for:** The organizer of a Group Stage → Knockout division.

**Where:** The **Matches** section for that division. The **Advance to Knockout →** button appears there.

**Steps**

1. Open the division's matches.
2. Check that every group match is finished. Each one must show **Completed**, **Walkover**, or **Forfeit**.
3. Select **Advance to Knockout →**.

**What you should see when it worked:**

- A short message says "Knockout bracket generated" with the number of matches.
- The knockout matches appear in the list.

**If something goes wrong:**

- **The button is grayed out.** The message under it says "Waiting on the rest of the group stage to finish." Enter the remaining group results first.

**Related flows:** Generate a Bracket, Enter a Match Score.

---

## Set Up Locations and Tournament Days

**Goal:** Set the venues, tournament days, and match timing that the scheduler uses.

**Who this is for:** The organizer who plans the event schedule.

**Where:** Open the tournament. In the **Tournament Location & Court Grid** section.

**Steps: add a venue**

1. Select **Use this club's courts** to add your facility as a venue. Its courts come from your booking site.
2. Or select **+ Add Venue** to add another location.
3. Type the **Venue Name / Branch**. This field is required for every venue.
4. Optional: type the **Street Address**.
5. In **Courts available at this location**, type how many courts the venue has.
6. Optional: select **Primary venue (playoffs)** to make this venue the one used for playoffs.

**Steps: add tournament days**

1. Under **Tournament days & timing**, select **+ Add Day**.
2. Choose the **date**, the **start time**, and the **end time** for the day.
3. Repeat for each day. Each day needs its own date, and each day must be long enough for at least one match.

**Steps: set match timing and save**

1. Type the **Match length (min)**.
2. Type the **Rest between a team's matches (min)**.
3. Type the **Travel buffer between venues (min)**.
4. Select **Save Locations & Timing**.

**What you should see when it worked:**

- A short message says "Locations & timing saved".

**If something goes wrong:**

- **"Give every venue a name."** Fill in the name for each venue.
- **"Every tournament day needs a date."** Choose a date for each day you added.
- **"... is listed twice."** Two days share the same date. Change one of them.
- **"... the day is shorter than one match."** Make the day longer or shorten the match length.

**Related flows:** Generate, Check, and Publish the Schedule.

---

## Generate, Check, and Publish the Schedule

**Goal:** Assign courts and times to every match, check for conflicts, and make the schedule visible to players.

**Who this is for:** The organizer who finalizes the event schedule.

**Where:** The **Tournament Location & Court Grid** section. The buttons are **Generate Schedule**, **Check Conflicts**, **Publish Schedule**, and **Regenerate All**.

**Steps**

1. Select **Generate Schedule**. The app saves your locations and timing first.
2. Read the result panel. It lists any problems.
3. Select **Check Conflicts** to review the schedule. The panel shows how many matches are scheduled and how many still have no court or time.
4. If there are conflicts, change your venues, courts, days, or timing, and select **Generate Schedule** again.
5. When the schedule is ready, select **Publish Schedule**.

**What you should see when it worked:**

- The result panel says "Schedule is live" with the number of scheduled matches.
- If any court blocks were added to the facility's booking calendar, the panel says how many.
- The button changes to **Unpublish (back to draft)**.
- Players can see the match times on the public tournament page.

**If something goes wrong:**

- **The schedule still has open matches.** A warning says how many matches have no court or time. Adjust your days or courts and generate again.
- **Publishing is blocked.** Some problems stop the schedule from publishing, such as a travel buffer that is too short between venues. Check the conflict list, fix the cause, and try again.
- **You want to re-plan the whole event.** Select **Regenerate All**. Confirm the message. It re-plans every match that has not been played yet, and their current courts and times are replaced.
- **You want to take the schedule back to draft.** Select **Unpublish (back to draft)** and confirm. Players stop seeing match times, and the facility's court blocks are removed from the booking calendar.

**Related flows:** Set Up Locations and Tournament Days, Enter a Match Score.

---

## Enter a Match Score

**Goal:** Record the result of a finished match, so the bracket and standings update.

**Who this is for:** The organizer or scorekeeper.

**Where:** Open the tournament. In the **Matches** section, choose the division. Each match is a card in the list.

**Steps: enter a final score**

1. Find the match. It must show the status **Scheduled**.
2. Select **Enter Score** on the match card.
3. Type the score for each side in the two boxes.
4. Select **Submit**.

**Steps: use the live scoreboard**

1. Find the match with the status **Scheduled**.
2. Select **Live score**. A scoreboard opens.
3. Score each rally on the scoreboard as the match is played.
4. When the match is finished, select **Submit official result**.

**What you should see when it worked:**

- A short message says "Score submitted", or "Result submitted" after the live scoreboard.
- The match status changes to **Completed**.
- The bracket or standings update.
- While the live scoreboard is open, the scores appear on the players' tournament page.

**If something goes wrong:**

- **"Failed:" followed by a message.** The score was not saved. Read the message and try again.
- **The live scoreboard says the score is not syncing.** Your scoring still works on the scoreboard. Keep scoring, and submit the final result when the match is over. Check your connection.
- **You entered the wrong score.** Use **Correct** on the completed match (see "Record a Forfeit or Correct a Score").

**Related flows:** Record a Forfeit or Correct a Score, Respond to a Player's Proposed Score.

---

## Record a Forfeit or Correct a Score

**Goal:** Record a match that one side did not play, or fix a score that was entered wrongly.

**Who this is for:** The organizer.

**Where:** The match card in the **Matches** list.

**Steps: record a forfeit**

1. Find the match with the status **Scheduled**.
2. Select **Enter Score** on the match card.
3. Select **Forfeit → [name]** for the side that wins. Each side has its own button.
4. Select **OK** in the box that asks "Record this as a forfeit?".

**Steps: correct a score**

1. Find a match with the status **Completed**, **Forfeit**, or **Walkover**.
2. Select **Correct** on the match card.
3. Type the corrected score for each side.
4. Type the **Reason** for the correction. This field is required.
5. Select **Save Correction**.

**What you should see when it worked:**

- A short message says "Forfeit recorded", or "Correction saved".
- The match shows the new result.
- If the correction causes a warning, the message shows it.

**If something goes wrong:**

- **"A reason is required for a correction."** Type a reason before you save.
- **The Correct button does not appear.** A match can be corrected only after it has a result. Enter the score first.

**Related flows:** Enter a Match Score.

---

## Respond to a Player's Proposed Score

**Goal:** Review a score that a player suggested on the public tournament page, then accept it, correct it, or dismiss it.

**Who this is for:** The organizer who approves results.

**Where:** The match card in the **Matches** list. A proposed score appears on the card with its own buttons.

**Steps**

1. Find the match card that shows a proposed score.
2. Check the proposed score against your own records.
3. Choose one action:
   - **Accept** to record the proposed score as the result.
   - **Correct** to change the score before you record it.
   - **Dismiss** to ignore the proposal.

**What you should see when it worked:**

- A short message says "Result accepted", or "Proposal dismissed".
- The match shows its new status.

**If something goes wrong:**

- **Accept shows "Failed".** Read the message. Try again or enter the score yourself with **Enter Score**.
- **The proposal is not there.** Refresh the **Matches** list for that division, then look at the match card again.

**Related flows:** Enter a Match Score, Record a Forfeit or Correct a Score.
