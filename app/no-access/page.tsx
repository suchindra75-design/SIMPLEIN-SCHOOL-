import { UserX } from "lucide-react";
import { LogoutButton } from "@/app/components/LogoutButton";
import { StatusScreen } from "@/components/shell/StatusScreen";

export const metadata = { title: "Account not set up" };

/** Shown when a signed-in identity has no usable profile or school. */
export default function NoAccessPage() {
  return (
    <StatusScreen
      icon={UserX}
      eyebrow="Account not set up"
      title="Your account isn't linked to a school yet"
      description="Your login works, but no active school profile is linked to it. Please contact your school administrator."
    >
      <LogoutButton />
    </StatusScreen>
  );
}
