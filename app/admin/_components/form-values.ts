import type { FieldDef } from "@/app/admin/_components/forms";

/** What the user entered in a SmartForm, keyed by field name. */
export type SubmittedValues = Record<string, string>;

/**
 * Snapshot the submitted values so a failed submit can show them again.
 * Passwords are never kept (secrets must not be echoed back into the DOM)
 * and files cannot be, since browsers refuse to pre-fill file inputs.
 * An unchecked checkbox is absent from FormData, so it is absent here too.
 */
export function captureSubmittedValues(
  fields: readonly FieldDef[],
  form: FormData,
): SubmittedValues {
  const values: SubmittedValues = {};
  for (const f of fields) {
    if (f.type === "password" || f.type === "file") continue;
    const v = form.get(f.name);
    if (typeof v === "string") values[f.name] = v;
  }
  return values;
}

/** Initial value of a text-like/select field: the failed submit's value, else its default. */
export function initialValue(f: FieldDef, submitted: SubmittedValues | null): string {
  if (submitted === null) return f.defaultValue ?? "";
  if (f.type === "password" || f.type === "file") return "";
  return submitted[f.name] ?? "";
}

/** Initial checked state of a checkbox: the failed submit's state, else its default. */
export function initialChecked(f: FieldDef, submitted: SubmittedValues | null): boolean {
  if (submitted === null) return f.checked === true;
  return submitted[f.name] !== undefined;
}
