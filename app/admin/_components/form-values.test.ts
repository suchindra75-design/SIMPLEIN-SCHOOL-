import { describe, expect, it } from "vitest";
import type { FieldDef } from "@/app/admin/_components/forms";
import {
  captureSubmittedValues,
  initialChecked,
  initialValue,
} from "@/app/admin/_components/form-values";

const fields: FieldDef[] = [
  { name: "email", label: "Email", type: "email", defaultValue: "old@example.com" },
  { name: "fullName", label: "Full name" },
  { name: "password", label: "Password", type: "password" },
  { name: "role", label: "Role", type: "select", options: [{ value: "TEACHER", label: "Teacher" }] },
  { name: "notes", label: "Notes", type: "textarea" },
  { name: "amount", label: "Amount", type: "number" },
  { name: "photo", label: "Photo", type: "file" },
  { name: "isActive", label: "Active", type: "checkbox", checked: true },
  { name: "isPrimary", label: "Primary", type: "checkbox" },
];

function submit(entries: [string, string | Blob][]): FormData {
  const form = new FormData();
  for (const [k, v] of entries) form.append(k, v);
  return form;
}

describe("captureSubmittedValues", () => {
  it("keeps text, select, textarea, number and checked checkbox values", () => {
    const values = captureSubmittedValues(
      fields,
      submit([
        ["email", "new@example.com"],
        ["fullName", "Asha Rao"],
        ["role", "TEACHER"],
        ["notes", "line 1\nline 2"],
        ["amount", "1500"],
        ["isPrimary", "on"],
      ]),
    );
    expect(values).toEqual({
      email: "new@example.com",
      fullName: "Asha Rao",
      role: "TEACHER",
      notes: "line 1\nline 2",
      amount: "1500",
      isPrimary: "on",
    });
  });

  it("never keeps passwords or files", () => {
    const values = captureSubmittedValues(
      fields,
      submit([
        ["password", "hunter2-secret"],
        ["photo", new Blob(["x"], { type: "image/png" })],
        ["fullName", "Asha Rao"],
      ]),
    );
    expect(values).toEqual({ fullName: "Asha Rao" });
    expect(JSON.stringify(values)).not.toContain("hunter2");
  });

  it("ignores entries that are not declared fields", () => {
    const values = captureSubmittedValues(
      fields,
      submit([
        ["$ACTION_ID_abc", ""],
        ["fullName", "Asha Rao"],
      ]),
    );
    expect(values).toEqual({ fullName: "Asha Rao" });
  });

  it("leaves unchecked checkboxes out", () => {
    const values = captureSubmittedValues(fields, submit([["fullName", "A"]]));
    expect(values).not.toHaveProperty("isActive");
    expect(values).not.toHaveProperty("isPrimary");
  });
});

describe("initialValue", () => {
  const email = fields[0]!;
  const fullName = fields[1]!;
  const password = fields[2]!;

  it("uses the field default before any failed submit", () => {
    expect(initialValue(email, null)).toBe("old@example.com");
    expect(initialValue(fullName, null)).toBe("");
  });

  it("uses the submitted value after a failed submit, even if blank", () => {
    expect(initialValue(email, { email: "new@example.com" })).toBe("new@example.com");
    expect(initialValue(email, { email: "" })).toBe("");
    expect(initialValue(fullName, {})).toBe("");
  });

  it("always leaves password fields empty after a failed submit", () => {
    expect(initialValue(password, { password: "hunter2-secret" })).toBe("");
  });
});

describe("initialChecked", () => {
  const isActive = fields[7]!;
  const isPrimary = fields[8]!;

  it("uses the field default before any failed submit", () => {
    expect(initialChecked(isActive, null)).toBe(true);
    expect(initialChecked(isPrimary, null)).toBe(false);
  });

  it("restores what the user ticked or unticked", () => {
    expect(initialChecked(isActive, {})).toBe(false);
    expect(initialChecked(isPrimary, { isPrimary: "on" })).toBe(true);
  });
});
