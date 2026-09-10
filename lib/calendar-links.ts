/**
 * One-click subscribe URLs for a personal out-of-office feed.
 *
 * Every one of these is an ordinary `https://` link back to this app, which
 * then redirects to whatever the chosen calendar actually wants. That
 * indirection is the whole point rather than an accident of layering:
 *
 * A `webcal://` href works fine in a browser and is silently destroyed in
 * email. Gmail, Outlook on the web and most mail clients sanitise anchors they
 * do not recognise, and a scheme that is not http or https is exactly what
 * they drop — the button survives as text, and clicking it does nothing. That
 * is the bug this shape fixes: the Apple button worked on the account page and
 * was dead in the approval email, for that reason and no other.
 *
 * Pure string work with no server dependencies, so the account page can import
 * it into the browser and the email builders can use the very same code. One
 * definition of what "subscribe" means, rather than two that drift apart the
 * first time either is touched. The vendor URL formats live behind the
 * redirect in app/api/calendar/[token]/subscribe/route.ts.
 */

export type SubscribeLinks = {
  /** Apple Calendar on macOS and iOS. */
  apple: string;
  /** Google's own "add calendar" confirmation screen. */
  google: string;
  /** Outlook and Teams on a work or school Microsoft 365 account. */
  outlook: string;
  /** Outlook.com, for a personal Microsoft account. */
  outlookPersonal: string;
  /**
   * The raw `webcal://` address.
   *
   * For showing and copying, not for linking — see above. Kept because a few
   * clients want the webcal form specifically when subscribing by hand.
   */
  webcal: string;
};

export function subscribeLinks(feedUrl: string): SubscribeLinks {
  const base = feedUrl.replace(/\/+$/, "");
  const via = (app: string) => `${base}/subscribe?app=${app}`;

  return {
    apple: via("apple"),
    google: via("google"),
    outlook: via("outlook"),
    outlookPersonal: via("outlook-personal"),
    // webcal:// is not a real transport — the client swaps it straight back to
    // https:// before fetching. Its whole job is to be a scheme the operating
    // system hands to Calendar instead of to a browser, so only the scheme
    // changes here and the rest of the URL is left exactly as issued.
    webcal: base.replace(/^https?:/i, "webcal:"),
  };
}
