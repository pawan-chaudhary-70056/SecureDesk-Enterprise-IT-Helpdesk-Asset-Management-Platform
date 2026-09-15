/**
 * SecureDesk seed: roles + permissions from constants, starter categories,
 * a default SLA policy, and one user per role for immediate testing.
 *
 * Run: npm run db:seed  (inside backend/)
 */
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import { PERMISSIONS, ROLE_NAMES, ROLE_PERMISSIONS, ROLES } from "../src/common/constants";
import type { PermissionName, RoleName } from "../common/constants";

const prisma = new PrismaClient();
const ArgonOpts = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

async function main(): Promise<void> {
  console.log("Seeding roles & permissions...");
  for (const name of ROLE_NAMES) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name, description: `${name} system role` } });
  }

  for (const name of Object.values(PERMISSIONS)) {
    await prisma.permission.upsert({ where: { name }, update: {}, create: { name } });
  }

  for (const roleName of ROLE_NAMES) {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
    const perms = ROLE_PERMISSIONS[roleName];
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    const permissionRows = await prisma.permission.findMany({ where: { name: { in: perms } } });
    await prisma.rolePermission.createMany({
      data: permissionRows.map((p) => ({ roleId: role.id, permissionId: p.id })),
    });
  }

  console.log("Seeding categories...");
  const categorySeed = [
    { name: "Hardware", description: "Laptops, monitors, peripherals" },
    { name: "Software", description: "Applications and licenses" },
    { name: "Network", description: "VPN, connectivity, firewalls" },
    { name: "Access", description: "Account and permission requests" },
  ];
  for (const c of categorySeed) {
    await prisma.category.upsert({ where: { name: c.name }, update: {}, create: c });
  }

  console.log("Seeding default SLA policy...");
  await prisma.slaPolicy.upsert({
    where: { name: "Standard" },
    update: {},
    create: { name: "Standard", firstResponseMinutes: 240, resolutionMinutes: 2880, isActive: true },
  });
  await prisma.slaPolicy.upsert({
    where: { name: "Hardware Priority" },
    update: {},
    create: { name: "Hardware Priority", categoryId: (await prisma.category.findUniqueOrThrow({ where: { name: "Hardware" } })).id, firstResponseMinutes: 60, resolutionMinutes: 1440, isActive: true },
  });

  console.log("Seeding demo users (password: Password123!)...");
  const demoPassword = await argon2.hash("Password123!", ArgonOpts);
  const users: Array<{ email: string; name: string; role: RoleName }> = [
    { email: "admin@securedesk.local", name: "Ada Admin", role: ROLES.ADMIN },
    { email: "agent@securedesk.local", name: "Sam Support", role: ROLES.IT_SUPPORT },
    { email: "manager@securedesk.local", name: "Morgan Manager", role: ROLES.MANAGER },
    { email: "employee@securedesk.local", name: "Eve Employee", role: ROLES.EMPLOYEE },
  ];
  const ids: Record<string, string> = {};
  for (const u of users) {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: u.role } });
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { roleId: role.id },
      create: { email: u.email, name: u.name, passwordHash: demoPassword, roleId: role.id },
    });
    ids[u.role] = user.id;
  }

  console.log("Seeding demo assets...");
  const hardware = await prisma.category.findUniqueOrThrow({ where: { name: "Hardware" } });
  await prisma.asset.upsert({
    where: { assetTag: "LT-0001" },
    update: {},
    create: {
      assetTag: "LT-0001",
      name: 'MacBook Pro 14"',
      serialNumber: "C02X12345678",
      categoryId: hardware.id,
      assignedToId: ids[ROLES.EMPLOYEE],
      status: "ASSIGNED",
      history: { create: { actorId: ids[ROLES.ADMIN], action: "REGISTERED" } },
    },
  });
  await prisma.asset.upsert({
    where: { assetTag: "MN-0001" },
    update: {},
    create: { assetTag: "MN-0001", name: 'Dell UltraSharp 27"', categoryId: hardware.id, status: "AVAILABLE" },
  });

  console.log("Seed complete.");
  console.log("  admin@securedesk.local / Password123!  (ADMIN)");
  console.log("  agent@securedesk.local / Password123!  (IT_SUPPORT)");
  console.log("  manager@securedesk.local / Password123!  (MANAGER)");
  console.log("  employee@securedesk.local / Password123!  (EMPLOYEE)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
