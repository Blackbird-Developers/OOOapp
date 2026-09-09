/**
 * One-click subscribe URLs for a personal out-of-office feed.
 *
 * Pure string work with no server dependencies, so the account page can import
 * it into the browser and the email builders can use the very same code. One
 * definition of what "subscribe" means, rather than two that drift apart the
 * first time either is touched.
 */

export type SubscribeLinks = {
  /** Hands the feed to Apple Calendar on macOS and iOS. */
  webcal: string;
  /** Google's own "add calendar" confirmation screen. */
  google: string;
};

export function subscribeLinks(feedUrl: string): SubscribeLinks {
  // webcal:// is not a real transport — the client swaps it straight back to
  // https:// before fetching. Its whole job is to be a scheme the operating
  // system hands to Calendar instead of to a browser, so only the scheme
  // changes here and the rest of the URL is left exactly as issued.
  const webcal = feedUrl.replace(/^https?:/i, "webcal:");

  return {
    webcal,
    // Google takes the feed as ?cid= and shows its own confirmation before
    // subscribing. It is given the webcal form because that is the one Google
    // documents for adding an external calendar by URL.
    google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`,
  };
}
