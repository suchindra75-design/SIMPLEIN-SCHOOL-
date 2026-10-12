"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionState } from "@/app/admin/actions";

export interface FieldDef {
  name: string;
  label: string;
  type?:
    | "text"
    | "email"
    | "password"
    | "date"
    | "number"
    | "tel"
    | "file"
    | "select"
    | "textarea"
    | "checkbox";
  required?: boolean;
  options?: { value: string; label: string }[];
  defaultValue?: string;
  placeholder?: string;
  checked?: boolean;
}

type FormAction = (
  prev: ActionState,
  form: FormData,
) => Promise<ActionState>;

/** Reusable create/edit form: error state, pending state, redirect on success. */
export function SmartForm({
  action,
  fields,
  submitLabel,
  redirectTo,
}: {
  action: FormAction;
  fields: FieldDef[];
  submitLabel: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, {});
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    if (state.success === true && redirectTo !== undefined) {
      setIsRedirecting(true);
      router.push(redirectTo);
    }
  }, [state.success, redirectTo, router]);

  return (
    <form action={formAction} className="max-w-lg space-y-4">
      {state.error !== undefined && (
        <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {fields.map((f) => (
        <div key={f.name}>
          <label htmlFor={f.name} className="mb-1 block text-sm font-medium text-[#191919]">
            {f.label}
            {f.required === true ? " *" : ""}
          </label>
          {f.type === "select" ? (
            <select
              id={f.name}
              name={f.name}
              required={f.required}
              defaultValue={f.defaultValue ?? ""}
              className="w-full rounded-md border border-[#DCDCE0] bg-[#F1F1F2] px-3 py-2 text-xs text-[#191919] focus:outline-hidden focus:border-[#191919] focus:bg-[#F8F8F9]"
            >
              <option value="">Select…</option>
              {(f.options ?? []).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : f.type === "textarea" ? (
            <textarea
              id={f.name}
              name={f.name}
              required={f.required}
              defaultValue={f.defaultValue ?? ""}
              placeholder={f.placeholder}
              rows={3}
              className="w-full rounded-md border border-[#DCDCE0] bg-[#F1F1F2] px-3 py-2 text-xs text-[#191919] focus:outline-hidden focus:border-[#191919] focus:bg-[#F8F8F9]"
            />
          ) : f.type === "checkbox" ? (
            <input
              id={f.name}
              name={f.name}
              type="checkbox"
              defaultChecked={f.checked}
              className="h-4 w-4 rounded border-[#DCDCE0] accent-[#191919]"
            />
          ) : (
            <input
              id={f.name}
              name={f.name}
              type={f.type ?? "text"}
              required={f.required}
              defaultValue={f.defaultValue ?? ""}
              placeholder={f.placeholder}
              className="w-full rounded-md border border-[#DCDCE0] bg-[#F1F1F2] px-3 py-2 text-xs text-[#191919] focus:outline-hidden focus:border-[#191919] focus:bg-[#F8F8F9]"
            />
          )}
        </div>
      ))}
      <button
        type="submit"
        disabled={pending || isRedirecting}
        className="rounded-md bg-[#191919] hover:bg-[#2D2D30] px-4 py-2 text-xs font-semibold text-white shadow-xs btn-interactive disabled:opacity-50 cursor-pointer"
      >
        {pending ? "Saving…" : isRedirecting ? "Redirecting…" : submitLabel}
      </button>
    </form>
  );
}

/** Destructive/sensitive action with native confirmation. */
export function ConfirmButton({
  label,
  confirmMessage,
  run,
}: {
  label: string;
  confirmMessage: string;
  run: () => Promise<ActionState>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      className="rounded-md border border-[#DCDCE0] bg-[#F8F8F9] hover:bg-red-50 hover:border-red-300 hover:text-red-700 px-2.5 py-1 text-xs font-medium text-zinc-700 btn-interactive cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      onClick={() => {
        if (window.confirm(confirmMessage)) {
          startTransition(async () => {
            const state = await run();
            if (state.error !== undefined) {
              window.alert(state.error);
            } else {
              router.refresh();
            }
          });
        }
      }}
    >
      {isPending ? "Processing…" : label}
    </button>
  );
}

