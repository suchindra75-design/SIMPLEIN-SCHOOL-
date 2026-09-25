"use client";

import { useActionState, useEffect } from "react";
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
  useEffect(() => {
    if (state.success === true && redirectTo !== undefined) {
      router.push(redirectTo);
      router.refresh();
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
          <label htmlFor={f.name} className="mb-1 block text-sm font-medium">
            {f.label}
            {f.required === true ? " *" : ""}
          </label>
          {f.type === "select" ? (
            <select
              id={f.name}
              name={f.name}
              required={f.required}
              defaultValue={f.defaultValue ?? ""}
              className="w-full rounded border px-3 py-2"
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
              className="w-full rounded border px-3 py-2"
            />
          ) : f.type === "checkbox" ? (
            <input
              id={f.name}
              name={f.name}
              type="checkbox"
              defaultChecked={f.checked}
              className="h-4 w-4"
            />
          ) : (
            <input
              id={f.name}
              name={f.name}
              type={f.type ?? "text"}
              required={f.required}
              defaultValue={f.defaultValue ?? ""}
              placeholder={f.placeholder}
              className="w-full rounded border px-3 py-2"
            />
          )}
        </div>
      ))}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
      >
        {pending ? "Saving…" : submitLabel}
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
  return (
    <button
      type="button"
      className="rounded border px-2 py-1 text-sm text-red-700 hover:bg-red-50"
      onClick={() => {
        if (window.confirm(confirmMessage)) {
          void run().then((state) => {
            if (state.error !== undefined) {
              window.alert(state.error);
            } else {
              window.location.reload();
            }
          });
        }
      }}
    >
      {label}
    </button>
  );
}
