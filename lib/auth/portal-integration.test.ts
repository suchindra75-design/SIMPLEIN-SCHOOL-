import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import {
  isRoleAllowedForPortal,
  validateSafeRedirect,
} from "./portal";

describe("Portal Host Routing Middleware", () => {
  it("redirects family route on staff host to family portal base URL", async () => {
    const req = new NextRequest("http://staff.simplinschool.com/parent/attendance", {
      headers: {
        host: "staff.simplinschool.com",
      },
    });

    const res = await middleware(req);
    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toBe("https://family.simplinschool.com/parent/attendance");
  });

  it("redirects student route on staff host to family portal base URL", async () => {
    const req = new NextRequest("http://staff.simplinschool.com/student/timetable?term=1", {
      headers: {
        host: "staff.simplinschool.com",
      },
    });

    const res = await middleware(req);
    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toBe("https://family.simplinschool.com/student/timetable?term=1");
  });

  it("redirects admin route on family host to staff portal base URL", async () => {
    const req = new NextRequest("http://family.simplinschool.com/admin/students", {
      headers: {
        host: "family.simplinschool.com",
      },
    });

    const res = await middleware(req);
    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toBe("https://staff.simplinschool.com/admin/students");
  });

  it("redirects teacher route on family host to staff portal base URL", async () => {
    const req = new NextRequest("http://family.simplinschool.com/teacher/marks", {
      headers: {
        host: "family.simplinschool.com",
      },
    });

    const res = await middleware(req);
    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toBe("https://staff.simplinschool.com/teacher/marks");
  });

  it("supports local development subdomains with port preservation", async () => {
    const req = new NextRequest("http://staff.localhost:3000/parent/fees", {
      headers: {
        host: "staff.localhost:3000",
      },
    });

    const res = await middleware(req);
    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toBe("http://family.localhost:3000/parent/fees");
  });

  it("redirects branded subdomain root '/' to '/login'", async () => {
    const staffReq = new NextRequest("http://staff.simplinschool.com/", {
      headers: {
        host: "staff.simplinschool.com",
      },
    });
    const staffRes = await middleware(staffReq);
    expect(staffRes.status).toBe(307);
    expect(staffRes.headers.get("location")).toBe("http://staff.simplinschool.com/login");

    const familyReq = new NextRequest("http://family.simplinschool.com/", {
      headers: {
        host: "family.simplinschool.com",
      },
    });
    const familyRes = await middleware(familyReq);
    expect(familyRes.status).toBe(307);
    expect(familyRes.headers.get("location")).toBe("http://family.simplinschool.com/login");
  });

  it("sets unified portal context and does not cross-redirect in unified localhost mode", async () => {
    const adminReq = new NextRequest("http://localhost:3000/admin", {
      headers: {
        host: "localhost:3000",
      },
    });
    const adminRes = await middleware(adminReq);
    // Does not redirect to external staff or family domain
    const location = adminRes.headers.get("location");
    if (location) {
      expect(location).not.toContain("family.simplinschool.com");
      expect(location).not.toContain("staff.simplinschool.com");
    }

    const parentReq = new NextRequest("http://localhost:3000/parent", {
      headers: {
        host: "localhost:3000",
      },
    });
    const parentRes = await middleware(parentReq);
    const parentLocation = parentRes.headers.get("location");
    if (parentLocation) {
      expect(parentLocation).not.toContain("family.simplinschool.com");
      expect(parentLocation).not.toContain("staff.simplinschool.com");
    }
  });
});

describe("Portal Role Boundary Enforcement", () => {
  it("strictly enforces roles per portal", () => {
    expect(isRoleAllowedForPortal("staff", ["SCHOOL_ADMIN"])).toBe(true);
    expect(isRoleAllowedForPortal("staff", ["TEACHER"])).toBe(true);
    expect(isRoleAllowedForPortal("staff", ["PARENT"])).toBe(false);
    expect(isRoleAllowedForPortal("staff", ["STUDENT"])).toBe(false);

    expect(isRoleAllowedForPortal("family", ["PARENT"])).toBe(true);
    expect(isRoleAllowedForPortal("family", ["STUDENT"])).toBe(true);
    expect(isRoleAllowedForPortal("family", ["SCHOOL_ADMIN"])).toBe(false);
    expect(isRoleAllowedForPortal("family", ["TEACHER"])).toBe(false);

    // Unified allows all
    expect(isRoleAllowedForPortal("unified", ["PARENT"])).toBe(true);
    expect(isRoleAllowedForPortal("unified", ["SCHOOL_ADMIN"])).toBe(true);
  });
});

describe("Open Redirect & Safe Navigation Defenses", () => {
  it("prevents arbitrary external host redirects", () => {
    expect(validateSafeRedirect("http://evil.com/phish", "/login")).toBe("/login");
    expect(validateSafeRedirect("https://attacker.org", "/login")).toBe("/login");
    expect(validateSafeRedirect("//attacker.org/test", "/login")).toBe("/login");
    expect(validateSafeRedirect("/\\attacker.org", "/login")).toBe("/login");
    expect(validateSafeRedirect("javascript:alert(1)", "/login")).toBe("/login");
  });

  it("permits verified internal routes", () => {
    expect(validateSafeRedirect("/admin/teachers", "/login")).toBe("/admin/teachers");
    expect(validateSafeRedirect("/parent/results?examId=123", "/login")).toBe(
      "/parent/results?examId=123",
    );
  });
});
