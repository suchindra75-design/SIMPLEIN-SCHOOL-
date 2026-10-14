import React from "react";
import Link from "next/link";
import { LogIn, ShieldAlert } from "lucide-react";
import { StatusScreen } from "@/components/shell/StatusScreen";

export const metadata = { title: "Access denied" };

export default function UnauthorizedPage() {
  return (
    <StatusScreen
      icon={ShieldAlert}
      eyebrow="Error 403"
      title="You don't have access to this page"
      description="Your account doesn't have permission to view this area. Sign in with an account that does, or return to your dashboard."
    >
      <Link href="/login" className="ui-btn ui-btn-primary">
        <LogIn aria-hidden="true" className="size-4" />
        Sign in
      </Link>
      <Link href="/" className="ui-btn ui-btn-secondary">
        School home
      </Link>
    </StatusScreen>
  );
}
