import { NextResponse, type NextRequest } from "next/server";
import { headers } from "next/headers";

import { auth } from "@/lib/auth/auth";

async function signOutAndRedirect(request: NextRequest) {
  await auth.api.signOut({
    headers: await headers(),
  });
  return NextResponse.redirect(new URL("/", request.nextUrl.origin).toString());
}

export async function POST(request: NextRequest) {
  return signOutAndRedirect(request);
}

export async function GET(request: NextRequest) {
  return signOutAndRedirect(request);
}
