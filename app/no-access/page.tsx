import { LogoutButton } from "@/app/components/LogoutButton";

/** Shown when a signed-in identity has no usable profile or school. */
export default function NoAccessPage() {
  return (
    <main className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-xl font-bold">Account not provisioned</h1>
      <p className="mt-2 text-sm text-gray-600">
        Your login works, but no active school profile is linked to it yet.
        Please contact your school administrator.
      </p>
      <div className="mt-6 flex justify-center">
        <LogoutButton />
      </div>
    </main>
  );
}
