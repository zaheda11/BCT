import { audit, createSession, jsonError, passwordDigest, safeUser, serverError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const role = body.role === "BENEFICIARY" ? "BENEFICIARY" : "TESTATOR";
    if (name.length < 2 || name.length > 80) return jsonError("Enter a name between 2 and 80 characters.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return jsonError("Enter a valid email address.");
    if (password.length < 12 || password.length > 128) return jsonError("Password must be between 12 and 128 characters.");
    if (await prisma.user.findUnique({ where: { email } })) return jsonError("An account with that email already exists.", 409);
    const user = await prisma.user.create({ data: { name, email, role, passwordHash: passwordDigest(password) } });
    await createSession(user.id);
    await audit(user.id, role, "ACCOUNT_REGISTERED", user.id);
    return Response.json({ user: safeUser(user) }, { status: 201 });
  } catch (error) { return serverError(error); }
}
