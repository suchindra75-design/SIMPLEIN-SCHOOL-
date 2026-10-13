import { describe, expect, it } from "vitest";
import {
  detectPortal,
  getPortalBaseUrl,
  getPortalForPath,
  getPortalHome,
  isPathAllowedForPortal,
  isRoleAllowedForPortal,
  validateSafeRedirect,
} from "./portal";

describe("detectPortal", () => {
  it("detects staff portal from production subdomain", () => {
    expect(detectPortal("staff.simplinschool.com")).toBe("staff");
    expect(detectPortal("staff.simplinschool.com:443")).toBe("staff");
  });

  it("detects family portal from production subdomain", () => {
    expect(detectPortal("family.simplinschool.com")).toBe("family");
    expect(detectPortal("family.simplinschool.com:443")).toBe("family");
  });

  it("detects local subdomains without modifying /etc/hosts", () => {
    expect(detectPortal("staff.localhost:3000")).toBe("staff");
    expect(detectPortal("family.localhost:3000")).toBe("family");
    expect(detectPortal("staff.localhost")).toBe("staff");
    expect(detectPortal("family.localhost")).toBe("family");
  });

  it("falls back to unified mode for plain localhost and root domains", () => {
    expect(detectPortal("localhost:3000")).toBe("unified");
    expect(detectPortal("127.0.0.1:3000")).toBe("unified");
    expect(detectPortal("simplinschool.com")).toBe("unified");
    expect(detectPortal(null)).toBe("unified");
    expect(detectPortal(undefined)).toBe("unified");
  });

  it("supports query parameter override in local development", () => {
    expect(detectPortal("localhost:3000", "staff")).toBe("staff");
    expect(detectPortal("localhost:3000", "family")).toBe("family");
    expect(detectPortal("localhost:3000", "invalid")).toBe("unified");
  });
});

describe("isRoleAllowedForPortal", () => {
  it("restricts staff portal to SCHOOL_ADMIN and TEACHER only", () => {
    expect(isRoleAllowedForPortal("staff", ["SCHOOL_ADMIN"])).toBe(true);
    expect(isRoleAllowedForPortal("staff", ["TEACHER"])).toBe(true);
    expect(isRoleAllowedForPortal("staff", ["SCHOOL_ADMIN", "TEACHER"])).toBe(true);
    expect(isRoleAllowedForPortal("staff", ["PARENT"])).toBe(false);
    expect(isRoleAllowedForPortal("staff", ["STUDENT"])).toBe(false);
    expect(isRoleAllowedForPortal("staff", [])).toBe(false);
  });

  it("restricts family portal to PARENT and STUDENT only", () => {
    expect(isRoleAllowedForPortal("family", ["PARENT"])).toBe(true);
    expect(isRoleAllowedForPortal("family", ["STUDENT"])).toBe(true);
    expect(isRoleAllowedForPortal("family", ["PARENT", "STUDENT"])).toBe(true);
    expect(isRoleAllowedForPortal("family", ["SCHOOL_ADMIN"])).toBe(false);
    expect(isRoleAllowedForPortal("family", ["TEACHER"])).toBe(false);
    expect(isRoleAllowedForPortal("family", [])).toBe(false);
  });

  it("allows all roles in unified development mode", () => {
    expect(isRoleAllowedForPortal("unified", ["SCHOOL_ADMIN"])).toBe(true);
    expect(isRoleAllowedForPortal("unified", ["TEACHER"])).toBe(true);
    expect(isRoleAllowedForPortal("unified", ["PARENT"])).toBe(true);
    expect(isRoleAllowedForPortal("unified", ["STUDENT"])).toBe(true);
  });
});

describe("getPortalForPath & isPathAllowedForPortal", () => {
  it("correctly identifies staff routes", () => {
    expect(getPortalForPath("/admin")).toBe("staff");
    expect(getPortalForPath("/admin/students")).toBe("staff");
    expect(getPortalForPath("/teacher")).toBe("staff");
    expect(getPortalForPath("/teacher/marks")).toBe("staff");
  });

  it("correctly identifies family routes", () => {
    expect(getPortalForPath("/parent")).toBe("family");
    expect(getPortalForPath("/parent/attendance")).toBe("family");
    expect(getPortalForPath("/student")).toBe("family");
    expect(getPortalForPath("/student/timetable")).toBe("family");
  });

  it("identifies shared / public routes as null", () => {
    expect(getPortalForPath("/login")).toBeNull();
    expect(getPortalForPath("/api/v1/auth/login")).toBeNull();
    expect(getPortalForPath("/unauthorized")).toBeNull();
  });

  it("enforces path boundaries per portal", () => {
    expect(isPathAllowedForPortal("staff", "/admin")).toBe(true);
    expect(isPathAllowedForPortal("staff", "/teacher/marks")).toBe(true);
    expect(isPathAllowedForPortal("staff", "/parent")).toBe(false);
    expect(isPathAllowedForPortal("staff", "/student")).toBe(false);
    expect(isPathAllowedForPortal("staff", "/login")).toBe(true);

    expect(isPathAllowedForPortal("family", "/parent")).toBe(true);
    expect(isPathAllowedForPortal("family", "/student/results")).toBe(true);
    expect(isPathAllowedForPortal("family", "/admin")).toBe(false);
    expect(isPathAllowedForPortal("family", "/teacher")).toBe(false);
    expect(isPathAllowedForPortal("family", "/login")).toBe(true);
  });
});

describe("getPortalHome", () => {
  it("returns appropriate dashboard for staff portal", () => {
    expect(getPortalHome("staff", ["SCHOOL_ADMIN"])).toBe("/admin");
    expect(getPortalHome("staff", ["TEACHER"])).toBe("/teacher");
    expect(getPortalHome("staff", ["PARENT"])).toBe("/unauthorized");
  });

  it("returns appropriate dashboard for family portal", () => {
    expect(getPortalHome("family", ["PARENT"])).toBe("/parent");
    expect(getPortalHome("family", ["STUDENT"])).toBe("/student");
    expect(getPortalHome("family", ["TEACHER"])).toBe("/unauthorized");
  });
});

describe("getPortalBaseUrl", () => {
  it("handles production domains", () => {
    expect(getPortalBaseUrl("staff", "simplinschool.com")).toBe(
      "https://staff.simplinschool.com",
    );
    expect(getPortalBaseUrl("family", "simplinschool.com")).toBe(
      "https://family.simplinschool.com",
    );
  });

  it("handles local development subdomains with ports preserved", () => {
    expect(getPortalBaseUrl("staff", "family.localhost:3000")).toBe(
      "http://staff.localhost:3000",
    );
    expect(getPortalBaseUrl("family", "staff.localhost:3000")).toBe(
      "http://family.localhost:3000",
    );
  });
});

describe("validateSafeRedirect", () => {
  it("permits safe internal relative paths", () => {
    expect(validateSafeRedirect("/admin", "/")).toBe("/admin");
    expect(validateSafeRedirect("/teacher/attendance?date=2026-10-11", "/")).toBe(
      "/teacher/attendance?date=2026-10-11",
    );
    expect(validateSafeRedirect("/parent", "/")).toBe("/parent");
  });

  it("rejects open redirects and external URLs", () => {
    expect(validateSafeRedirect("https://evil.example.com", "/")).toBe("/");
    expect(validateSafeRedirect("http://evil.example.com", "/")).toBe("/");
    expect(validateSafeRedirect("//evil.example.com", "/")).toBe("/");
    expect(validateSafeRedirect("/\\evil.example.com", "/")).toBe("/");
    expect(validateSafeRedirect("javascript:alert(1)", "/")).toBe("/");
    expect(validateSafeRedirect(null, "/fallback")).toBe("/fallback");
    expect(validateSafeRedirect(undefined, "/fallback")).toBe("/fallback");
    expect(validateSafeRedirect("", "/fallback")).toBe("/fallback");
  });
});
