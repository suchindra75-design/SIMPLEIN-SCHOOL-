"use client";

/** Fetches a short-lived signed PYQ URL, then opens the file in a new tab. */
export function PyqFileLink({
  pyqId,
  label,
  kind = "question",
}: {
  pyqId: string;
  label: string;
  kind?: "question" | "solution" | "answerKey";
}) {
  return (
    <button
      type="button"
      className="underline text-blue-700"
      onClick={() => {
        void fetch(`/api/v1/pyqs/${pyqId}/file?kind=${kind}`)
          .then((r) => r.json())
          .then((body: { data?: { url: string }; error?: { message: string } }) => {
            if (body.data?.url !== undefined) {
              window.open(body.data.url, "_blank", "noreferrer");
            } else {
              window.alert(body.error?.message ?? "Download failed");
            }
          })
          .catch(() => window.alert("Download failed"));
      }}
    >
      {label}
    </button>
  );
}
