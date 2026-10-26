import { audit, checkPassword, checkUnknownPassword, createSession, jsonError, safeUser, serverError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) { checkUnknownPassword(password); return jsonError("Email or password is incorrect.", 401); }
    if (!checkPassword(password, user.passwordHash)) return jsonError("Email or password is incorrect.", 401);
    await createSession(user.id);
    await audit(user.id, user.role, "ACCOUNT_LOGIN", user.id);
    return Response.json({ user: safeUser(user) });
  } catch (error) { return serverError(error); }
}
