import { feedUrl, getOrCreateFeedToken } from "@/lib/calendar";
import { loadCalendarSettings } from "@/lib/calendar-settings";
import { emailCalendarSetup } from "@/lib/email";

/**
 * What every new account gets once it exists, however it came in: an invite,
 * a join link, an email domain or creating a company.
 *
 * Day one is the moment to connect a calendar, while somebody is already
 * setting the account up — and it is the earliest one available, because the
 * profile that owns a feed token did not exist until the account was made.
 *
 * Best-effort throughout: the account is created and usable, so a mail
 * failure must not turn a successful sign-up into an error the new person
 * sees. They can always subscribe from the account page instead.
 */
export async function welcomeNewMember(opts: {
  userId: string;
  orgId: string;
  email: string;
  fullName: string;
}): Promise<void> {
  try {
    const settings = await loadCalendarSettings(opts.orgId);
    if (settings.connected && settings.personalFeeds) {
      const token = await getOrCreateFeedToken(opts.userId);
      if (token) {
        await emailCalendarSetup({ to: opts.email, fullName: opts.fullName, feedUrl: feedUrl(token) });
      }
    }
  } catch (e) {
    console.warn("[onboarding] calendar setup email failed:", e);
  }
}
