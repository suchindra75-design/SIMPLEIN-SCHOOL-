"use client";

import { logoutAction } from "@/app/auth-actions";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className="rounded border px-3 py-1 text-sm hover:bg-gray-100"
      >
        Logout
      </button>
    </form>
  );
}
