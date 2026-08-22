import "server-only";
import { cookies } from "next/headers";
import crypto from "node:crypto";

const COOKIE = "envplan_session";
const MAX_AGE = 60 * 60 * 12; // 12시간

/**
 * 슈퍼관리자 — 일반 관리자 위에 한 겹 더.
 *
 * 메뉴 노출처럼 "사이트 전체가 한 번에 바뀌는" 설정만 여기서 다룬다.
 * 쿠키가 별도이고 수명이 짧아서(30분) 관리자 로그인 상태여도 그 창이 지나면 다시 물어본다.
 * 일반 관리자 세션이 없으면 승격 자체가 불가능하다(isSuperAdmin이 둘 다 검사).
 */
const SUPER_COOKIE = "envplan_super";
const SUPER_MAX_AGE = 60 * 30; // 30분

function secret() {
  return process.env.SESSION_SECRET || "dev-only-insecure-secret";
}

function sign(payload: string) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("hex");
}

function makeToken(who: "admin" | "super", maxAge: number) {
  const exp = Date.now() + maxAge * 1000;
  const payload = `${who}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token: string | undefined, role: "admin" | "super" = "admin"): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [who, expStr, sig] = parts;
  if (who !== role) return false;
  const payload = `${who}.${expStr}`;
  const expected = sign(payload);
  if (sig.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  const exp = Number(expStr);
  return Number.isFinite(exp) && Date.now() < exp;
}

/** 길이가 달라도 타이밍이 새지 않도록 해시를 비교한다 */
function samePassword(given: string, expected: string): boolean {
  if (!expected) return false;
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

/** 비밀번호 확인 후 세션 쿠키 발급 */
export async function login(password: string): Promise<boolean> {
  if (!samePassword(password, process.env.ADMIN_PASSWORD ?? "")) return false;

  const store = await cookies();
  store.set(COOKIE, makeToken("admin", MAX_AGE), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
  return true;
}

export async function logout() {
  const store = await cookies();
  store.delete(COOKIE);
}

export async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get(COOKIE)?.value);
}

/** 서버 액션 맨 앞에서 호출 — 인증 안 됐으면 예외 */
export async function requireAdmin() {
  if (!(await isAdmin())) throw new Error("관리자 인증이 필요합니다. 다시 로그인해 주세요.");
}

/** 관리자 로그인 상태에서 한 번 더 — 슈퍼관리자 승격 */
export async function superLogin(password: string): Promise<boolean> {
  if (!(await isAdmin())) return false;
  if (!samePassword(password, process.env.SUPER_ADMIN_PASSWORD ?? "")) return false;

  const store = await cookies();
  store.set(SUPER_COOKIE, makeToken("super", SUPER_MAX_AGE), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SUPER_MAX_AGE,
  });
  return true;
}

export async function superLogout() {
  const store = await cookies();
  store.delete(SUPER_COOKIE);
}

export async function isSuperAdmin(): Promise<boolean> {
  const store = await cookies();
  if (!verifyToken(store.get(COOKIE)?.value, "admin")) return false;
  return verifyToken(store.get(SUPER_COOKIE)?.value, "super");
}

export async function requireSuperAdmin() {
  if (!(await isSuperAdmin())) throw new Error("슈퍼관리자 인증이 필요합니다. 다시 로그인해 주세요.");
}

/** 슈퍼관리자 세션 남은 시간(초). 인증 안 됐으면 0 */
export async function superSessionRemaining(): Promise<number> {
  const store = await cookies();
  const t = store.get(SUPER_COOKIE)?.value;
  if (!(await isSuperAdmin()) || !t) return 0;
  const exp = Number(t.split(".")[1]);
  return Math.max(0, Math.floor((exp - Date.now()) / 1000));
}
