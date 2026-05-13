import Link from "next/link";
import type { Profile } from "@/lib/auth";

export default function TopBar({ profile }: { profile: Profile }) {
  const isAdmin = profile.role === "admin";
  return (
    <header className="bg-brand text-white">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
        <Link href={isAdmin ? "/admin" : "/dashboard"} className="font-semibold tracking-tight">
          BBM Leave
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {isAdmin ? (
            <>
              <Link href="/admin" className="hover:text-indigo-200">Calendar</Link>
              <Link href="/admin/requests" className="hover:text-indigo-200">Requests</Link>
              <Link href="/admin/employees" className="hover:text-indigo-200">Employees</Link>
              <Link href="/admin/invites" className="hover:text-indigo-200">Invites</Link>
              <Link href="/admin/holidays" className="hover:text-indigo-200">Holidays</Link>
            </>
          ) : (
            <>
              <Link href="/dashboard" className="hover:text-indigo-200">Who's off</Link>
              <Link href="/dashboard/request" className="hover:text-indigo-200">Request leave</Link>
              <Link href="/dashboard/my-requests" className="hover:text-indigo-200">My requests</Link>
            </>
          )}
          <span className="text-slate-300">·</span>
          <span className="text-slate-300">{profile.full_name}</span>
          <form action="/api/auth/logout" method="post">
            <button className="text-indigo-200 hover:text-white">Sign out</button>
          </form>
        </nav>
      </div>
    </header>
  );
}
