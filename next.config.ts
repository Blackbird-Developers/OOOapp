import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /**
   * Keep Nodemailer out of the bundler.
   *
   * It resolves several of its own modules with dynamic `require`s, which the
   * server bundler cannot follow — the build succeeds and then the package
   * throws the first time it is used at runtime. Because the calendar mailer
   * falls back to the HTTP API when SMTP fails, that failure is invisible:
   * approvals keep arriving, the .ics is merely an attachment again, and
   * Outlook goes back to ignoring it. Loading it from node_modules at runtime
   * instead is the supported fix.
   */
  serverExternalPackages: ["nodemailer"],
};

export default nextConfig;
