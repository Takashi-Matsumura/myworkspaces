import { prisma } from "./prisma";

export async function getUserNetworkIsolation(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { networkIsolated: true },
  });
  return u?.networkIsolated ?? false;
}

export async function setUserNetworkIsolation(
  userId: string,
  isolated: boolean,
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { networkIsolated: isolated },
  });
}
