"use client";

/** Browser print for the on-screen report card. */
export function PrintButton() {
  return (
    <button
      type="button"
      className="ui-btn ui-btn-secondary"
      onClick={() => window.print()}
    >
      Print
    </button>
  );
}

/** Download the generated PDF via a short-lived signed URL. */
export function DownloadPdfButton({ reportCardId }: { reportCardId: string | null }) {
  if (reportCardId === null) {
    return (
      <span className="text-xs text-gray-500">
        PDF available after generation (admin).
      </span>
    );
  }
  return (
    <a
      href={`/api/v1/report-cards/${reportCardId}/pdf`}
      target="_blank"
      rel="noreferrer"
      className="ui-btn ui-btn-primary ui-btn-sm"
    >
      Download PDF
    </a>
  );
}
