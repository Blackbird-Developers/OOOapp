# Setting up "Out of office" calendar events for Whooo

**Who this is for:** a Google Workspace super admin for blackbird.marketing, and someone with access to the Google Cloud project that holds the Whooo service account. That may be one person or two.

**How long it takes:** about 5 minutes.

---

## Why we need this

When leave is approved, Whooo currently emails the person a calendar invite. Google turns that into an ordinary meeting, so Slack's Google Calendar app shows the person as being in a call (with the Google Meet icon) for the whole of their leave.

The fix is for Whooo to put the leave straight into the person's Google Calendar as a real **"Out of office"** event, the same kind you get by choosing *Out of office* when creating an event in Google Calendar yourself. Slack reads that as "away", not as a meeting.

To do that, Whooo needs permission to add events to calendars. It already has a similar permission for the Gmail auto-reply, so this extends that existing setup. Nothing new has to be created.

---

## Step 1: Enable the Google Calendar API

**Who:** anyone with *Owner* or *Editor* access to the Google Cloud project that holds the Whooo service account. That's the same project the Gmail API was enabled on for the auto-reply.

The project is **Blackbird Leave** (project ID `blackbird-leave`).

1. Open **https://console.cloud.google.com/apis/library/calendar-json.googleapis.com?project=blackbird-leave** and sign in. This goes straight to the Google Calendar API page inside the Blackbird Leave project.
   - Or go there by hand: choose **Blackbird Leave** in the project picker at the top, then **APIs & Services → Library**, and search for **Google Calendar API**.
2. Check the project picker at the top says **Blackbird Leave**.
3. Click **Enable**. If it says **Manage** instead, it's already enabled and you're done with this step.

---

## Step 2: Add the calendar permission to the domain-wide delegation

**Who:** a **Google Workspace super admin**. Regular accounts can't see this page.

1. Go to **https://admin.google.com** and sign in.
2. Go to **Security → Access and data control → API controls**.
3. Scroll to **Domain-wide delegation** and click **Manage domain-wide delegation**.
4. Find the Whooo service account's entry. It's the one whose scopes already include:
   ```
   https://www.googleapis.com/auth/gmail.settings.basic
   ```
   The **Client ID** column shows a long number (the service account's *Unique ID*).
5. Hover over that row and click **Edit**.
6. In **OAuth scopes**, **keep the existing Gmail scope** and add the calendar scope after it, separated by a comma, so the field reads exactly:
   ```
   https://www.googleapis.com/auth/gmail.settings.basic,https://www.googleapis.com/auth/calendar.events
   ```
7. Click **Authorize**.

> **Don't remove the Gmail scope.** Removing it would switch off the Gmail out-of-office auto-reply.

Google says a change can take a few minutes, and occasionally up to 24 hours, to take effect.

---

## What this permission allows

`https://www.googleapis.com/auth/calendar.events` lets Whooo **create, change and delete calendar events** in people's calendars on blackbird.marketing.

It **can't** read or send email, change calendar sharing or settings, or touch anything outside Google Calendar. In practice Whooo only ever touches the "Out of office" events it creates for approved leave.

---

## What changes for the team once it's done

- Approved leave appears in the person's Google Calendar as **"Out of office"**. The title never says what kind of leave it is.
- Slack's Google Calendar app shows them as **out of office**, not in a meeting, and no Google Meet icon. Each person can choose the emoji for that status in the Google Calendar app's settings in Slack.
- **New** meeting invites sent for times during their leave are declined automatically, with a short "on leave" note. Meetings already in their calendar are left alone.
- Half days are respected: a morning off blocks only the morning.
- If the leave is withdrawn or cancelled, the event is removed.
- People stop receiving the "Out of office" invite email from Whooo, because the event is added directly.

Leave approved **before** this was set up keeps its old calendar invite. Only newly approved leave gets the new event.

---

## Checking it works

1. Book a short test leave in Whooo and approve it.
2. Open that person's Google Calendar. You should see an **Out of office** block (shown with Google's out-of-office styling), and **no** invite email should arrive.
3. During that time, Slack should show them as out of office.
4. Withdraw or reject the test leave and check the event disappears.

### If an invite email arrives instead

Whooo falls back to the old invite whenever Google refuses, so leave never goes missing. That means one of the steps above hasn't taken effect yet. The app's server logs (Vercel → Logs) will contain a line starting `[calendar] could not place Out of office event`, followed by Google's reason:

| The log mentions | Fix |
| --- | --- |
| the API being disabled / "has not been used" / "enable" | Step 1: the Google Calendar API isn't enabled on the right project. |
| `unauthorized_client`, or a 403 naming `calendar.events` | Step 2: the scope isn't on the delegation yet, or was added to the wrong client ID. Wait a few minutes after adding it, then try again. |
| `invalid_grant` | That person has no Google account in the blackbird.marketing Workspace. |

Nothing breaks while setup is incomplete: until both steps are done, Whooo keeps sending the invite email exactly as it does today.
