import React from "react";
import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { StatusScreen } from "@/components/shell/StatusScreen";

export default function NotFound() {
  return (
    <StatusScreen
      icon={FileQuestion}
      eyebrow="Error 404"
      title="Page not found"
      description="The page or record you're looking for doesn't exist or may have been moved."
    >
      <Link href="/login" className="ui-btn ui-btn-primary">
        Go to my dashboard
      </Link>
      <Link href="/" className="ui-btn ui-btn-secondary">
        School home
      </Link>
    </StatusScreen>
  );
}
