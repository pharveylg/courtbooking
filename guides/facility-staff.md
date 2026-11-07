# Facility Staff Guide

This guide is for the staff of a court facility who run the booking site day to day. It walks you through the Admin area, which is unlocked with the shared Admin PIN, and the Store, which has its own PIN.

Use this guide for:

- Confirming or removing bookings
- Blocking court time for staff use
- Setting up courts, pricing, and operating hours
- Creating Open Play blocks
- Running walk-in queue sessions and viewing their stats
- Selling items and managing stock in the Store

For tournaments, see the Tournament Organizer Guide.

---

## Before You Start

**The Admin PIN.** Every facility has one shared Admin PIN. It is not tied to a person. If your facility has never changed it, the default is `1234`. Change it as your first step (see "Change the Admin PIN" below). Anyone who knows the PIN can open the Admin area.

**The Store PIN is separate.** The Store has its own PIN. Your Admin PIN does not open the Store, and the Store PIN does not open the Admin area.

**Staff mode lasts for one browser tab.** When you unlock the Admin area, it stays unlocked in that browser tab until you exit it, close the tab, or switch to another facility. Each new visit starts locked.

**What the Admin PIN unlocks.** After you enter the PIN, four staff tabs appear in the navigation: **Queue**, **Stats**, **Bookings**, and **Admin**. Players do not see these four tabs.

---

## Unlock the Admin Area

**Goal:** Open the staff tabs and the Admin Console with the Admin PIN.

**Who this is for:** Any staff member who has the Admin PIN.

**Where:** The **Staff** button in the top header of your facility's booking site. It shows a lock icon while the Admin area is locked.

**Steps:**

1. Open your facility's booking site.
2. Select **Staff** in the header.
3. In the **Staff & Admin Access** box, type the Admin PIN.
4. Select **Unlock All Tabs →**.

**What you should see when it worked:**

- A short message confirms that staff mode is on.
- The header button now reads **Admin (Exit)** with a check mark. To lock again, select **Admin (Exit)** in the header; the staff tabs disappear.
- The **Queue**, **Stats**, **Bookings**, and **Admin** tabs are available.

**If something goes wrong:**

- **"Incorrect PIN. Default is 1234."** The PIN you typed does not match. Try again. If the facility never changed the PIN, the default is `1234`.
- **You forgot the PIN.** Contact your platform administrator. They can reset the Admin PIN for you. You cannot reset it yourself from this screen.
- **The tabs did not appear.** Make sure the header button now says **Admin (Exit)**. If it still says **Staff**, the PIN was not accepted.

**Related flows:** Change the Admin PIN.

---

## Confirm a Booking

**Goal:** Mark a player's reservation as confirmed after you have verified their payment.

**Who this is for:** The staff member who checks payments (GCash, Maya, bank transfer, cash, or whatever your facility accepts).

**Where:** **Admin** tab, then the **Confirm & Tag Bookings** tab in the Admin Console. Each row shows the player's name, date, time, court, group notes, and email.

**Steps:**

1. Unlock the Admin area.
2. Open the **Admin** tab.
3. Open **Confirm & Tag Bookings**.
4. Find the player's booking. Check the name, date, time, and amount against the payment you received.
5. Open the status box on that row.
6. Choose **Reserved**.

**What you should see when it worked:**

- A short message says the booking was marked **Reserved**.
- The status box keeps the new value.
- The booking now counts toward your facility's billing, if your platform bills per booking.

**If something goes wrong:**

- **The list is empty.** Players have not booked yet, or the booking data was reset. Ask the platform administrator about your facility's data retention window if you expected older bookings.
- **You chose the wrong status.** Change it back in the same box. The app records billing the first time a booking becomes **Reserved** or **Paid**, so change the status only after you have checked the payment.
- **The status box shows "OpenPlay".** This is an Open Play block, not a player booking. Manage it from the Open Play list instead (see "Remove an Open Play Block").
- **The status box also offers Paid.** Use **Reserved** for verified payments unless your team has agreed to use **Paid**. The app bills both the same way.
- **Pending** is the status of a new booking you have not verified yet.

**Related flows:** Delete a Booking, Create an Open Play Block.

---

## Delete a Booking

**Goal:** Remove a booking, for example when a player never paid or asked to cancel.

**Who this is for:** Staff who manage the booking list.

**Where:** **Admin** tab, then **Confirm & Tag Bookings**.

**Steps:**

1. Unlock the Admin area and open **Confirm & Tag Bookings**.
2. Find the booking you want to remove.
3. Select the **X** button at the right end of that row.
4. In the confirmation box that says **Delete this booking?**, select **OK**.

**What you should see when it worked:**

- The booking disappears from the list.
- The court time is free again for other players.

**If something goes wrong:**

- **You selected Cancel by mistake.** Nothing changes. Select **X** again if you still want to delete it.
- **The booking was already marked Reserved or Paid.** Deleting it also records a cancellation for billing purposes. Check with your platform administrator if you are unsure how your facility is billed.
- **An Open Play block still appears after you deleted it here.** Delete Open Play blocks from the Open Play list instead. The **X** in that list also removes the block's listing on Find a Game.

**Related flows:** Confirm a Booking, Remove an Open Play Block.

---

## Block Court Time for Staff

**Goal:** Stop players from booking a court at certain hours, for staff practice, lessons, league play, or maintenance. Blocked hours show as **STAFF RESERVED** to players.

**Who this is for:** Staff who plan the court schedule.

**Where:** **Admin** tab, then the **Staff Reserved Hours** tab in the Admin Console.

The tab has two parts:

- **Weekly Pattern** sets a recurring block for each day of the week. It applies every week until you change it.
- **Date Overrides** changes only the hours you pick for one specific date. Other hours on that date still follow the weekly pattern.

**Steps: set a weekly pattern**

1. Unlock the Admin area and open **Staff Reserved Hours**.
2. If you have more than one court, select the court's tab at the top.
3. Under **Weekly Pattern**, select the day name you want to change. The day opens and shows its hours.
4. Select each hour you want blocked. Select an hour again to unblock it.
5. Check the line under the day name. It shows how many hours are reserved.

**Steps: change one date only**

1. Unlock the Admin area and open **Staff Reserved Hours**.
2. If you have more than one court, select the court's tab at the top.
3. Under **Date Overrides**, select the date in the calendar. Use the arrows to move between months.
4. In the panel that opens, select an hour to turn it on or off for that date.
5. To remove all changes for that date and return to the weekly pattern, select **Clear override**.

**What you should see when it worked:**

- Blocked hours show as unavailable on the Book tab, marked **STAFF RESERVED**.
- A small dot appears on any calendar date that has a date override.
- The weekly pattern line shows the new count, for example "3 hrs reserved".

**If something goes wrong:**

- **Players can still book an hour you blocked.** Check whether a date override for that day turned that hour back off. Clear the override to return to the weekly pattern.
- **The block is on the wrong court.** Make sure you selected the correct court tab before you changed the hours. Each court has its own pattern.
- **The block did not change for a particular day.** The date override controls that day. Clear the override if you want the weekly pattern to apply.
- **Billing.** Staff-reserved hours block the court for players the same way a booking does. If your platform bills usage, these hours may be billed at a reduced rate. Check with your platform administrator.

**Related flows:** Set Operating Hours, Create an Open Play Block.

---

## Add, Rename, or Retire a Court

**Goal:** Add a new court, rename one, take a court out of service, change when it opens for booking, or remove it.

**Who this is for:** Staff who manage the facility's courts.

**Where:** **Admin** tab, then **Court Management** in the Admin Console.

**Steps: add a court**

1. Unlock the Admin area and open **Court Management**.
2. Select **Add Court**.
3. In the box, type the court's name. The box starts with "Court" and a number. You can change it.
4. Select **OK**.

**Steps: rename a court**

1. In **Court Management**, select the **Rename** button (pencil icon) on the court's row.
2. Type the new name and select **OK**.

**Steps: take a court out of service**

1. In **Court Management**, turn off the switch on the court's row. The label changes to **Maintenance**.
2. To return it to service, turn the switch back on. The label changes to **Active**.

**Steps: change a court's start hour**

1. In **Court Management**, open the start-hour menu on the court's row.
2. Choose the hour. The choices run from 5:00 AM to 10:00 PM.

**Steps: delete a court**

1. In **Court Management**, select the delete button on the court's row (it appears only when you have more than one court), then select **OK**.

**What you should see when it worked:**

- A short message confirms the change, for example "Court renamed to ..." or "... set to maintenance".
- The court's row shows its new label.

**If something goes wrong:**

- **You cannot delete a court.** You must keep at least one court. Add a second court first if you need to retire the original.
- **The Maintenance court still shows to players.** Refresh the Book page. Courts in Maintenance are hidden from the public booking flow.
- **Bookings on a deleted court.** The confirmation says those bookings will show on all courts instead of one. Check the booking list after you delete a court.

**Related flows:** Set Court Pricing, Set Operating Hours.

---

## Set Court Pricing

**Goal:** Set the default hourly rate for a court, and charge a different rate for specific hours, such as prime evening slots.

**Who this is for:** Staff who manage rates.

**Where:** **Admin** tab, then the **Pricing** tab in the Admin Console.

**Steps: set the default rate**

1. Unlock the Admin area and open **Pricing**.
2. If you have more than one court, select the court's tab at the top.
3. In **Default Rate (all hours)**, type the hourly rate.
4. Select **Save**.

**Steps: set a rate for specific hours**

1. In **Pricing**, select the court's tab if you have more than one court.
2. Select the hours you want to change in the hour grid. Select **Select All** to choose every hour, or **Clear Selection** to remove your selection.
3. In **Rate for Selected Hours**, type the new rate.
4. Select **Apply**.

**Steps: remove a rate for specific hours**

1. Select the hours you want to reset in the hour grid, then select **Clear**. Those hours return to the default rate.

**What you should see when it worked:**

- A short message confirms the change, for example "Default rate saved" or "Rate applied to selected hours".
- The hours you changed show the new rate in the grid.

**If something goes wrong:**

- **"Enter a valid non-negative rate."** The rate box must contain a number of zero or more.
- **"Select at least one hour first."** Select one or more hours in the grid before you select **Apply** or **Clear**.
- **A booking charged a different amount than you expected.** Check the hour-specific rates for that court. The charge follows the rate for the exact hour that was booked.

**Related flows:** Add, Rename, or Retire a Court.

---

## Set Operating Hours

**Goal:** Set the hours your facility is open for walk-ins, bookings, and closing.

**Who this is for:** Staff who manage when the facility is open.

**Where:** **Admin** tab, then the **Operating Hours** tab in the Admin Console.

The four settings are:

- **Queue Start** and **Queue End**: the walk-in window.
- **Booking Start**: when hourly bookings open.
- **Close**: when the facility closes.

**Steps**

1. Unlock the Admin area and open **Operating Hours**.
2. If you have more than one court, choose one of the tabs at the top:
   - **Facility Default** sets the hours every court uses unless it has its own hours.
   - A court's tab sets hours for that court only.
3. Type each time as a whole number from 0 to 24. For example, 7 means 7:00 AM, 22 means 10:00 PM, and 24 means midnight.
4. Make sure **Booking Start** is earlier than **Close**.
5. Select **Save**.
6. For a court tab that has its own hours, you can select **Reset to Facility Default** to make that court follow the facility hours again.

**What you should see when it worked:**

- A short message confirms the change, for example "Facility default hours saved" or "Court hours saved".
- The schedule on the Book tab reflects the new hours.

**If something goes wrong:**

- **"Enter hours between 0 and 24."** One of the four boxes is empty or outside the range.
- **"Booking Start must be before Close."** Move Booking Start earlier, or move Close later.
- **One court shows different hours than the others.** That court has its own hours. Open its tab and select **Reset to Facility Default** if that was not intended.

**Related flows:** Block Court Time for Staff, Create an Open Play Block.

---

## Create an Open Play Block

**Goal:** Block a time window for a community or open-play event. The block shows as **Reserved — Open Play** on the schedule. If you allow online joining, it also appears on Find a Game, where players can join and pay.

**Who this is for:** Staff who run open-play events.

**Where:** **Admin** tab, then the **Create Open Play Entry** tab in the Admin Console.

For recurring blocks, use **Staff Reserved Hours** instead.

**Steps**

1. Unlock the Admin area and open **Create Open Play Entry**.
2. Choose the **Date**.
3. If you have more than one court, choose the **Court**.
4. Choose the **Start** and **End** times. The end time must be after the start time. The block cannot start in the break between Queue End and Booking Start, and it cannot cross that break.
5. Choose the **Game Mode**: Doubles (4 players) or Singles (2 players).
6. Choose the **Rotation Rule** from the list.
7. Type the **Rate per person**. This is what each person pays to join online.
8. Choose **Public Joining**:
   - **Allowed** lets players join and pay online.
   - **Restricted** shows the block as "Walk-ins only". Players can see it, but they cannot join online.
9. Select **Add Open Play Block**.

**What you should see when it worked:**

- A short message confirms "Open play block added".
- The block appears in the Open Play list on the right side of the Admin tab.
- The block appears as a row in **Confirm & Tag Bookings** with the status **OpenPlay**.
- The block appears on **Find a Game** with a **Public Joining** tag (Allowed) or a **Walk-ins only** tag (Restricted).

**If something goes wrong:**

- **"Select date."** Choose a date first.
- **"End must be after start."** Change the end time.
- **"Overlaps with ..."** Another booking, block, or staff-reserved hour already uses that time on that court. Choose a different time or court.
- **"... break not allowed" or "Cannot cross ... break".** The time falls in the break between Queue End and Booking Start. Choose a time outside the break.

**Related flows:** Remove an Open Play Block, Confirm a Booking.

---

## Remove an Open Play Block

**Goal:** Remove an Open Play block and its listing on Find a Game.

**Who this is for:** Staff who manage open-play events.

**Where:** **Admin** tab, then the Open Play list on the right side of the Admin tab (below **Create Open Play Entry**).

**Steps**

1. Unlock the Admin area and find the block in the Open Play list.
2. Select the **X** button on that block's row.

**What you should see when it worked:**

- The block disappears from the Open Play list.
- The block's listing disappears from Find a Game.
- A short message confirms "Open play removed".

**If something goes wrong:**

- **The block disappeared immediately.** There is no confirmation step on this list. Create a new block if you removed one by mistake.
- **The block still shows on Find a Game.** Refresh Find a Game. If it still shows, delete the block again from the Open Play list.
- **Players have already joined and paid.** Removing the block does not refund anyone. Handle refunds outside the app.

**Related flows:** Create an Open Play Block, Delete a Booking.

---

## Change the Admin PIN

**Goal:** Replace the shared Admin PIN.

**Who this is for:** Staff who manage the facility's access. Do this as your first step after the facility goes live.

**Where:** **Admin** tab, then the **Security** tab in the Admin Console.

**Steps**

1. Unlock the Admin area and open **Security**.
2. Type the new PIN in the **New PIN** box. Use at least 3 characters and no more than 8.
3. Select **Save PIN**.

**What you should see when it worked:**

- A short message says "PIN updated & synced".
- The new PIN opens the Admin area from now on.
- The Tournament Admin page uses the same Admin PIN, so the new PIN also works there.

**If something goes wrong:**

- **"PIN too short."** Use at least 3 characters.
- **The Tournament Admin page still rejects the PIN.** Save the PIN once more on this screen, then try again on the Tournament Admin page.
- **Other staff devices still accept the old PIN.** Wait a moment for the change to sync, or refresh those devices.
- **Anyone who is unlocked can change it.** This screen does not ask for the current PIN. Only change the PIN on a device you control.
- **The Store PIN is separate.** Change it from the Store (see "Change the Store PIN").

**Related flows:** Unlock the Admin Area, Change the Store PIN.

---

## Create a Walk-In Queue Session

**Goal:** Set up a queue session for a group of players who rotate on your courts.

**Who this is for:** Staff who run walk-in rotations for the facility.

**Where:** The **Queue** tab, under the **Create Queue Session** form. This tab is available only after you unlock the Admin area.

**Note on queue access:** Your facility's **Queue** tab is for staff. Each session has its own 4-digit lock PIN, which you set when you create it. Players who open the separate **Walk-in Queue** card on the facility picker page do not need any PIN. That queue is a standalone tool, and it is not connected to your Admin PIN or to your facility's sessions.

**Steps**

1. Unlock the Admin area and open the **Queue** tab.
2. In **Session Name / Group**, type a name for the session.
3. If you have more than one court, select one or more courts under **Court(s)**.
4. Choose the **Game Mode**: Doubles or Singles.
5. Choose the **Rotation Rule**:
   - Winner Stays
   - Four Off, Four On
   - Fixed Rotation
   - Timed Rotation
   - Partner Rotation (doubles only)
   - Fixed Pairs League (doubles only; partners never change)
6. Choose **Points to Win** (11, 15, 21, or Custom from 1 to 50), and **Win Condition** (Win by 2 or Sudden Death).
7. Type a **Lock PIN** with exactly 4 digits. Write it down. You need it to open the session later.
8. Choose **Public Joining**:
   - **Allowed** lets players add names to the session.
   - **Restricted** blocks adding names from the session's dashboard.
9. Optional: type **Initial Players**, one name per line.
10. Optional: open **Advanced: overall winner** to set the **Ranking order** and **Min. games to qualify for winner**.
11. Select **Generate Queue Board**.

**What you should see when it worked:**

- The new session appears under **Active Sessions Today**.
- The session is marked with its mode, rotation rule, and court (if any).

**If something goes wrong:**

- **"PIN must be exactly 4 digits."** Type exactly four digits in the **Lock PIN** box.
- **The custom points target is rejected.** Enter a whole number from 1 to 50.
- **You forgot the Lock PIN.** The session cannot be opened without it. Create a new session if you cannot recover the PIN.

**Related flows:** Open a Queue Session and Add Players, Record Scores in a Queue Session, End or Reset a Queue Session.

---

## Open a Queue Session and Add Players

**Goal:** Open an existing session and add walk-in players to its waiting line.

**Who this is for:** Staff who run the session.

**Where:** The **Queue** tab, then the session under **Active Sessions Today**.

**Steps**

1. Unlock the Admin area and open the **Queue** tab.
2. Select the session you want to open.
3. In the box that asks for the PIN, type the session's 4-digit Lock PIN and select **OK**.
4. In the **Add Player(s) to Queue** card, type **Player 1 Name**.
5. If the session is doubles, type **Player 2 Name (Optional Partner)**. For a Fixed Pairs League, the partner name is required.
6. Select **Add Player(s)**.

**What you should see when it worked:**

- The new names appear in the waiting line.
- The session's total count of active players goes up.

**If something goes wrong:**

- **"Incorrect PIN."** The Lock PIN does not match. Try again.
- **A message says public joining is restricted.** The session was created with **Public Joining** set to **Restricted**. You cannot add names from this card for that session.

**Related flows:** Create a Walk-In Queue Session, Record Scores in a Queue Session.

---

## Record Scores in a Queue Session

**Goal:** Record a finished game so the queue rotates the next players onto the court.

**Who this is for:** Staff who run the session.

**Where:** The session dashboard, in the card for the court that played the game.

**Steps: use the live scoreboard**

1. Open the session (see "Open a Queue Session and Add Players").
2. On the court's card, select **Live score (tap points)**.
3. Tap the points as the game is played. The scoreboard tracks the score and the server.
4. When the game ends, the scores are recorded and the queue rotates.

**Steps: enter final scores**

1. Open the session.
2. On the court's card, type the final score in both score boxes.
3. Select **Submit & Rotate Queue →**.

**What you should see when it worked:**

- The game is added to that session's match history.
- The court's card shows the next match, with the next players.
- The **played** count for the session goes up.

**If something goes wrong:**

- **The wrong players are on court.** Use the controls on that court's card to change who is on court or who serves first. The rotation decides who plays next. You can always correct who is on court right now.
- **Submit does nothing.** Make sure both score boxes contain numbers.
- **The live scoreboard closed before you finished.** Reopen **Live score (tap points)** on the same court. The game picks up where it stopped.

**Related flows:** Create a Walk-In Queue Session, View Queue Stats.

---

## End or Reset a Queue Session

**Goal:** Reset a session to start over, or delete it when you are finished.

**Who this is for:** Staff who run the session.

**Where:** The session dashboard, using the buttons at the top right: **Reset Queue** and **Delete Session**.

**Steps**

1. Open the session.
2. Select **Reset Queue** to clear the scoreboard and court rotation and start over. Or select **Delete Session** to remove the session permanently.
3. Select **OK** in the confirmation box.
4. When the winner screen appears, read the overall winner.
5. Optional: select the stats download button to save the session's stats.

**What you should see when it worked:**

- The winner screen shows the overall winner, when there are matches to rank.
- The stats download opens a printable page you can save as a PDF.

**If something goes wrong:**

- **You canceled by mistake.** Nothing changes. Select the button again if you still want to reset or delete.
- **The winner screen did not appear.** No games were played, so there is no winner to show.
- **You deleted a session by mistake.** Deleting is permanent. Create a new session. If you needed the stats, download them before you delete.

**Related flows:** Create a Walk-In Queue Session, View Queue Stats.

---

## View Queue Stats

**Goal:** See the results for a queue session: players, teams, match history, and head-to-head records.

**Who this is for:** Staff who review session results.

**Where:** The **Stats** tab, under **Live Analytics**.

**Steps**

1. Unlock the Admin area and open the **Stats** tab.
2. Select the session from **Select a session...**.
3. Scroll through the sections: the summary numbers, the win bars, the top performers, the players table, the teams table, the match list, and head-to-head.

**What you should see when it worked:**

- The summary shows the number of matches and players in the session.
- Each table lists the results for every player or team.

**If something goes wrong:**

- **Nothing appears after you select a session.** The session has no matches yet. Record a game first.

**Related flows:** Record Scores in a Queue Session, End or Reset a Queue Session.

---

## Unlock the Store

**Goal:** Open the Store point-of-sale and inventory tools.

**Who this is for:** Staff who work at the Store.

**Where:** In the Admin Console, the **Pickle Court Store** card, then **Go to Store →**. The Store opens in a new browser tab.

**Steps**

1. Unlock the Admin area.
2. Select **Go to Store →** on the **Pickle Court Store** card.
3. In the Store window, type the **Store PIN**.
4. Select **Unlock Store →**.

**What you should see when it worked:**

- The Store opens to the **POS** tab.
- The tabs along the top are **POS**, **Products**, **Inventory**, **Reports**, **Credit**, and **Settings**.

**If something goes wrong:**

- **"Incorrect PIN."** The Store PIN does not match. The Admin PIN does not open the Store.
- **"Failed to verify PIN."** The Store could not check the PIN. Check your internet connection and try again.
- **Shared devices.** Select **Lock** in the Store's header when you are finished, so the next person must enter the PIN.

**Related flows:** Sell Items at the Store, Change the Store PIN.

---

## Sell Items at the Store

**Goal:** Ring up a sale at the Store.

**Who this is for:** Staff at the Store counter.

**Where:** The Store's **POS** tab.

**Steps**

1. Unlock the Store and open **POS**.
2. Optional: type in **Search products...** or select a category to narrow the list.
3. Select a product to add it to the cart.
4. To change a quantity, use the **−** and **+** buttons next to the item in the cart.
5. Choose the **Payment Method**: Cash, GCash, Maya, Bank Transfer, Card, Credit / Pay Later, or Other.
6. If you chose **Credit / Pay Later**, type the customer's name in the box that appears.
7. Select **Complete Sale**. On a phone, select **Review & Pay ↓** first to see the cart.

**What you should see when it worked:**

- A short message says "Sale completed".
- The cart clears.
- The stock for each product drops by the quantity sold.
- For a credit sale, the message says the sale needs sign-off in the **Credit** tab. Sign-off is a separate review step; the sale is recorded and stock goes down right away.

**If something goes wrong:**

- **"Only N ... in stock."** You cannot add more than the available stock.
- **"Enter who this credit is for."** Type the customer's name before you complete a credit sale.
- **"Not enough stock for ..."** Another sale used the last units first. Check the cart and try again.
- **"Could not complete the sale."** Check your connection and try again. The sale is not recorded unless it completes.

**Related flows:** Receive and Adjust Stock, Review Sales and Void a Sale.

---

## Add or Edit a Product

**Goal:** Add a product to the Store's catalog, or change its price, cost, or details.

**Who this is for:** Staff who manage the product list.

**Where:** The Store's **Products** tab.

**Steps: add a product**

1. Open **Products**.
2. Select **+ Add Product**.
3. Fill in the fields:
   - **Name**
   - **SKU** (optional)
   - **Category** (optional, for example "Drinks")
   - **Unit** (optional, for example "bottle" or "pack")
   - **Selling Price (₱)**
   - **Unit Cost (₱)**
   - **Starting Stock**
   - **Low-Stock Threshold** (defaults to 5)
   - **Active (visible in POS)**, which is checked by default
   - **Description** (optional)
4. Select **Save Product**.

**Steps: edit a product**

1. Open **Products**.
2. Select **Edit** on the product's row.
3. Change the fields you need and select **Save Product**.

**Steps: delete a product**

1. Open **Products**, select **Delete** on the product's row, and select **OK**.

**What you should see when it worked:**

- The product appears in the list. If **Active** is checked, it also appears in POS.
- A short message confirms the save or deletion.

**If something goes wrong:**

- **Starting Stock is grayed out when you edit a product.** Stock changes are made from the **Inventory** tab, not here.
- **A product does not appear in POS.** Check that **Active (visible in POS)** is checked.
- **Deleting a product.** The confirmation says past sales are not affected. The product is removed from the catalog only.

**Related flows:** Receive and Adjust Stock, Sell Items at the Store.

---

## Receive and Adjust Stock

**Goal:** Record stock you received from a supplier, or correct a stock count for damage, expiry, loss, or a miscount.

**Who this is for:** Staff who manage inventory.

**Where:** The Store's **Inventory** tab. Each product has its own **Receive Stock** and **Adjust** buttons.

**Steps: receive stock**

1. Open **Inventory**.
2. Find the product and select **Receive Stock**.
3. Type the **Quantity Received**.
4. Type the **Unit Cost Paid (₱)**.
5. Select **Confirm**.

**Steps: adjust stock**

1. Open **Inventory**.
2. Find the product and select **Adjust**.
3. Type the **Quantity Change (+/-)**. Use a plus sign to add stock and a minus sign to remove it.
4. Choose a **Reason**: Damaged, Expired, Lost, Stock Count Correction, or Other.
5. Select **Confirm**.

**What you should see when it worked:**

- A short message confirms "Stock adjusted", or the matching message for receiving stock.
- The product's stock count changes.
- The change appears in **Recent Movements** with its reason.

**If something goes wrong:**

- **Stock does not go below zero.** If you enter a removal larger than the current stock, the stock stops at zero.
- **The product's cost changed after a receipt.** The unit cost is recalculated as a weighted average of the stock on hand and the new stock. This is expected.
- **The change does not appear in Recent Movements.** Select **Refresh** in that section.

**Related flows:** Add or Edit a Product, Review Sales and Void a Sale.

---

## Review Sales and Void a Sale

**Goal:** Look up sales for the month, see sales by product, and void a sale that was entered by mistake.

**Who this is for:** Staff who review sales or correct errors.

**Where:** The Store's **Reports** tab.

**Steps: review sales**

1. Open **Reports**.
2. Review the monthly summary at the top.
3. Review **Sales by Product** for the totals by item.
4. Review **Sales History** for each sale.
5. Select **Refresh** on **Sales History** to reload the list.

**Steps: void a sale**

1. Open **Reports** and find the sale in **Sales History**.
2. Select **Void** on that sale.
3. Type the reason for the void. A reason is required.
4. Confirm the void.

**What you should see when it worked:**

- The sale shows as voided in **Sales History**.
- The stock for each item in that sale goes back to the stock count before the sale.

**If something goes wrong:**

- **You left the reason blank.** A reason is required. If the reason box is empty, the sale is not voided.
- **"Already voided."** The sale was voided before. Nothing else changes.
- **A credit sale was voided.** Voided credit sales are removed from the **Credit** tab.

**Related flows:** Sell Items at the Store.

---

## Change the Store PIN

**Goal:** Replace the Store PIN.

**Who this is for:** Staff who manage Store access.

**Where:** The Store's **Settings** tab.

**Steps**

1. Unlock the Store and open **Settings**.
2. Under **Change Store PIN**, type the new PIN in the **New PIN** box.
3. Select **Save**.

**What you should see when it worked:**

- A short message says "Store PIN updated".
- The new PIN unlocks the Store from now on.

**If something goes wrong:**

- **"Enter a new PIN."** The box was empty. Type a PIN and try again.
- **"Failed:" followed by a message.** The change could not be saved. Read the message, check your connection, and try again.
- **The Store PIN is separate.** Changing it does not change the Admin PIN, and the Admin PIN does not change it.
- **Anyone who is unlocked can change it.** This screen does not ask for the current PIN. Only change the PIN on a device you control.

**Related flows:** Unlock the Store, Change the Admin PIN.
