export default function HomePage() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">SIMPLEIN SCHOOL ERP</h1>
      <p className="mt-2 text-sm text-gray-600">
        V1 by SIMPLEIN SOLUTIONS LLP. Sign in to reach your role dashboard.
      </p>
      <ul className="mt-6 list-disc pl-6 text-sm">
        <li>
          <a className="underline" href="/login">
            Sign in
          </a>
        </li>
        <li>
          <a className="underline" href="/api/v1/health">
            API health
          </a>
        </li>
      </ul>
    </main>
  );
}
