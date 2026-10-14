"use client";

import { useFormStatus } from "react-dom";
import { logoutAction } from "@/app/auth-actions";

function SubmitLogoutButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="ui-btn ui-btn-secondary"
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
