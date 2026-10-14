"use client";

import {
  Fragment,
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck, Loader2 } from "lucide-react";
import type { ActionState } from "@/app/admin/actions";
import {
  captureSubmittedValues,
  initialChecked,
  initialValue,
  type SubmittedValues,
} from "@/app/admin/_components/form-values";

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

interface SmartFormState {
  result: ActionState;
  /** The user's input from the last submit, kept only when it failed. */
  submitted: SubmittedValues | null;
  /** Bumped per completed submit so fields remount with fresh defaults. */
  submission: number;
}

const INITIAL_STATE: SmartFormState = { result: {}, submitted: null, submission: 0 };

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
  const formId = useId();
  // React resets uncontrolled forms after a function action completes, which
  // would wipe the user's input when the action fails. On error, keep what
  // was submitted and remount the fields with it as their defaults.
  const [state, formAction, pending] = useActionState<SmartFormState, FormData>(
    async (prev, form) => {
      const result = await action(prev.result, form);
      return {
        result,
        submitted: result.error !== undefined ? captureSubmittedValues(fields, form) : null,
        submission: prev.submission + 1,
      };
    },
    INITIAL_STATE,
  );
  const { result, submitted } = state;
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    if (result.success === true && redirectTo !== undefined) {
      setIsRedirecting(true);
      router.push(redirectTo);
    }
  }, [result.success, redirectTo, router]);

  // The fields remount after each submit and the submit button is disabled
  // while pending, so keyboard focus would fall back to <body>. Return it to
  // where the user submitted from: the field (Enter key) or the submit button.
  const formRef = useRef<HTMLFormElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const submittedFrom = useRef<string | null>(null);

  useEffect(() => {
    if (state.submission === 0) return;
    if (state.result.success === true && redirectTo !== undefined) return;
    const active = document.activeElement;
    if (active !== null && active !== document.body) return;
    const name = submittedFrom.current;
    const field = name !== null ? formRef.current?.elements.namedItem(name) : null;
    if (field instanceof HTMLElement) field.focus();
    else submitRef.current?.focus();
  }, [state, redirectTo]);

  const busy = pending || isRedirecting;

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={(e) => {
        const active = document.activeElement;
        submittedFrom.current =
          (active instanceof HTMLInputElement ||
            active instanceof HTMLSelectElement ||
            active instanceof HTMLTextAreaElement) &&
          e.currentTarget.contains(active)
            ? active.name
            : null;
      }}
      className="max-w-lg space-y-4"
    >
      {result.error !== undefined && !pending && (
        <div role="alert" className="ui-alert ui-alert-error animate-fade-in">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p>{result.error}</p>
        </div>
      )}
      <Fragment key={state.submission}>
        {fields.map((f) => {
          const id = `${formId}-${f.name}`;
          const marker = f.required === true && !f.label.trim().endsWith("*");
          const label = (
            <>
              {f.label}
              {marker ? (
                <span aria-hidden="true" className="text-muted-foreground">
                  {" "}
                  *
                </span>
              ) : null}
            </>
          );

          if (f.type === "checkbox") {
            return (
              <div key={f.name} className="flex items-center gap-2.5">
                <input
                  id={id}
                  name={f.name}
                  type="checkbox"
                  defaultChecked={initialChecked(f, submitted)}
                  className="size-4 rounded border-input accent-[#191919]"
                />
                <label htmlFor={id} className="text-sm font-medium text-foreground">
                  {label}
                </label>
              </div>
            );
          }

          return (
            <div key={f.name}>
              <label htmlFor={id} className="ui-label">
                {label}
              </label>
              {f.type === "select" ? (
                <select
                  id={id}
                  name={f.name}
                  required={f.required}
                  defaultValue={initialValue(f, submitted)}
                  className="ui-input"
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
                  id={id}
                  name={f.name}
                  required={f.required}
                  defaultValue={initialValue(f, submitted)}
                  placeholder={f.placeholder}
                  rows={3}
                  className="ui-input"
                />
              ) : (
                <input
                  id={id}
                  name={f.name}
                  type={f.type ?? "text"}
                  required={f.required}
                  defaultValue={initialValue(f, submitted)}
                  placeholder={f.placeholder}
                  className={
                    f.type === "file"
                      ? "ui-input file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-foreground"
                      : "ui-input"
                  }
                />
              )}
            </div>
          );
        })}
      </Fragment>
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button ref={submitRef} type="submit" disabled={busy} className="ui-btn ui-btn-primary">
          {busy ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
          {pending ? "Saving…" : isRedirecting ? "Opening…" : submitLabel}
        </button>
        <p aria-live="polite" className="text-sm text-success">
          {result.success === true && redirectTo === undefined && !pending ? (
            <span className="inline-flex animate-fade-in items-center gap-1.5">
              <CircleCheck aria-hidden="true" className="size-4" />
              Saved
            </span>
          ) : null}
        </p>
      </div>
    </form>
  );
}

/** One-click server action (non-destructive): pending state + inline error. */
export function ActionButton({
  label,
  pendingLabel,
  run,
}: {
  label: string;
  pendingLabel?: string;
  run: () => Promise<ActionState>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>(undefined);

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={isPending}
        className="ui-btn ui-btn-secondary ui-btn-sm"
        onClick={() => {
          setError(undefined);
          startTransition(async () => {
            const state = await run();
            if (state.error !== undefined) {
              setError(state.error);
            } else {
              router.refresh();
            }
          });
        }}
      >
        {isPending ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin" /> : null}
        {isPending ? (pendingLabel ?? "Working…") : label}
      </button>
      {error !== undefined ? (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}

/** Destructive/sensitive action guarded by an accessible confirmation dialog. */
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>(undefined);

  const open = () => {
    setError(undefined);
    dialogRef.current?.showModal();
  };
  const close = () => dialogRef.current?.close();

  const confirm = () => {
    setError(undefined);
    startTransition(async () => {
      const state = await run();
      if (state.error !== undefined) {
        setError(state.error);
      } else {
        close();
        router.refresh();
      }
    });
  };

  return (
    <>
      <button
        type="button"
        disabled={isPending}
        onClick={open}
        className="ui-btn ui-btn-secondary ui-btn-sm"
      >
        {isPending ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin" /> : null}
        {isPending ? "Processing…" : label}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="ui-dialog"
        onCancel={(e) => {
          if (isPending) e.preventDefault();
        }}
        onClick={(e) => {
          // Clicking the backdrop (the dialog element itself) dismisses it.
          if (e.target === e.currentTarget && !isPending) close();
        }}
      >
        <div className="p-6">
          <h2 id={titleId} className="text-base font-semibold text-foreground">
            {label}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">{confirmMessage}</p>
          {error !== undefined ? (
            <div role="alert" className="ui-alert ui-alert-error mt-4">
              <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <p>{error}</p>
            </div>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-border bg-surface-muted px-6 py-3">
          <button type="button" onClick={close} disabled={isPending} className="ui-btn ui-btn-ghost">
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={isPending}
            className="ui-btn ui-btn-primary"
          >
            {isPending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
            {isPending ? "Working…" : "Confirm"}
          </button>
        </div>
      </dialog>
    </>
  );
}
