"use client";

import { useFormStatus } from "react-dom";
import { logoutAction } from "@/app/auth-actions";

function SubmitLogoutButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded border px-3 py-1 text-sm hover:bg-gray-100 disabled:opacity-50 cursor-pointer"
    >
      {pending ? "Signing out…" : "Logout"}
    </button>
  );
}

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <SubmitLogoutButton />
    </form>
  );
}
