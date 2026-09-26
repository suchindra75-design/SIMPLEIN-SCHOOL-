"use client";

/** Fetches a short-lived signed URL, then opens the file in a new tab. */
export function AttachmentLink({
  homeworkId,
  attachmentId,
  label,
}: {
  homeworkId: string;
  attachmentId: string;
  label: string;
}) {
  return (
    <button
      type="button"
      className="underline text-blue-700"
      onClick={() => {
        void fetch(`/api/v1/homework/${homeworkId}/attachments/${attachmentId}`)
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
