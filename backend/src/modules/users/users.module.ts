import {
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { PrismaService } from "../../database/prisma.service";
import { JwtAuthGuard, PermissionsGuard, RequirePermissions } from "../../common/guards/auth.guard";
import type { RequestUser } from "../../common/guards/auth.guard";
import { AuditService } from "../../audit/audit.service";
import { AuditModule } from "../../audit/audit.module";
import { AUDIT_ACTIONS, ROLES } from "../../common/constants";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import argon2 from "argon2";

const ArgonOpts = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

const listUsersQuery = z.object({
  q: z.string().max(200).optional(),
  role: z.string().max(64).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(2).max(120),
  password: z.string().min(10).max(128),
  role: z.enum([ROLES.EMPLOYEE, ROLES.IT_SUPPORT, ROLES.MANAGER, ROLES.ADMIN]),
});

const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  role: z.enum([ROLES.EMPLOYEE, ROLES.IT_SUPPORT, ROLES.MANAGER, ROLES.ADMIN]).optional(),
  isActive: z.boolean().optional(),
});

const updateRoleSchema = z.object({
  description: z.string().trim().max(500).optional(),
  permissionNames: z.array(z.string().min(1)).max(200).optional(),
});

const createRoleSchema = z.object({
  name: z.string().trim().regex(/^[A-Z_]{2,64}$/, "Use UPPERCASE letters and underscores"),
  description: z.string().trim().max(500).optional(),
});

@Injectable()
export class UsersAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listUsers(q: { q?: string; role?: string; page: number; pageSize: number }) {
    const where = {
      ...(q.q ? { OR: [{ email: { contains: q.q } }, { name: { contains: q.q } }] } : {}),
      ...(q.role ? { role: { name: q.role } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: {
          id: true, email: true, name: true, isActive: true, lastLoginAt: true, createdAt: true,
          role: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  async createUser(dto: { email: string; name: string; password: string; role: string }, actorId: string) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException("Email already registered");
    const role = await this.prisma.role.findUnique({ where: { name: dto.role } });
    if (!role) throw new NotFoundException("Role not found");
    const user = await this.prisma.user.create({
      data: { email: dto.email, name: dto.name, passwordHash: await argon2.hash(dto.password, ArgonOpts), roleId: role.id },
      select: { id: true, email: true, name: true, isActive: true, role: { select: { name: true } } },
    });
    await this.audit.record({ actorId, action: AUDIT_ACTIONS.USER_CREATED, entityType: "User", entityId: user.id, detail: { role: dto.role } });
    return user;
  }

  async updateUser(id: string, dto: { name?: string; role?: string; isActive?: boolean }, actorId: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, include: { role: true } });
    if (!user) throw new NotFoundException("User not found");
    let roleId: string | undefined;
    if (dto.role) {
      const role = await this.prisma.role.findUnique({ where: { name: dto.role } });
      if (!role) throw new NotFoundException("Role not found");
      roleId = role.id;
    }
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(roleId ? { roleId } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      select: { id: true, email: true, name: true, isActive: true, role: { select: { name: true } } },
    });
    // Deactivating a user immediately kills their sessions.
    if (dto.isActive === false) {
      await this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    if (dto.role && dto.role !== user.role.name) {
      await this.audit.record({ actorId, action: AUDIT_ACTIONS.ROLE_CHANGED, entityType: "User", entityId: id, detail: { from: user.role.name, to: dto.role } });
    } else {
      await this.audit.record({ actorId, action: AUDIT_ACTIONS.USER_UPDATED, entityType: "User", entityId: id });
    }
    return updated;
  }

  listRoles() {
    return this.prisma.role.findMany({
      include: { permissions: { include: { permission: { select: { name: true } } } } },
      orderBy: { name: "asc" },
    });
  }

  listPermissions() {
    return this.prisma.permission.findMany({ orderBy: { name: "asc" } });
  }

  async createRole(dto: { name: string; description?: string }, actorId: string) {
    const exists = await this.prisma.role.findUnique({ where: { name: dto.name } });
    if (exists) throw new ConflictException("Role already exists");
    const role = await this.prisma.role.create({ data: { name: dto.name, description: dto.description } });
    await this.audit.record({ actorId, action: AUDIT_ACTIONS.ADMIN_ACTION, entityType: "Role", entityId: role.id, detail: "created" });
    return role;
  }

  async updateRole(id: string, dto: { description?: string; permissionNames?: string[] }, actorId: string) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException("Role not found");
    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.permissionNames) {
        const perms = await tx.permission.findMany({ where: { name: { in: dto.permissionNames } } });
        if (perms.length !== new Set(dto.permissionNames).size) throw new NotFoundException("Unknown permission in list");
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        await tx.rolePermission.createMany({ data: perms.map((p) => ({ roleId: id, permissionId: p.id })) });
      }
      return tx.role.update({ where: { id }, data: { description: dto.description ?? role.description } });
    });
    // Audit AFTER the transaction: AuditService writes via the global client (a
    // separate connection). Inside the transaction it would block on the lock
    // the transaction itself holds and trip the 5s P2028 timeout.
    await this.audit.record({ actorId, action: AUDIT_ACTIONS.PERMISSION_CHANGED, entityType: "Role", entityId: id, detail: dto.permissionNames ? "permissions_replaced" : "updated" });
    return updated;
  }
}

@Controller("users")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions("user:manage")
export class UsersController {
  constructor(private readonly users: UsersAdminService) {}

  @Get()
  list(@Query(new ZodValidationPipe(listUsersQuery)) q: unknown) {
    return this.users.listUsers(q as never);
  }

  @Post()
  create(@CurrentUser() actor: RequestUser, @Body(new ZodValidationPipe(createUserSchema)) dto: { email: string; name: string; password: string; role: string }) {
    return this.users.createUser(dto, actor.id);
  }

  @Patch(":id")
  update(@CurrentUser() actor: RequestUser, @Param("id") id: string, @Body(new ZodValidationPipe(updateUserSchema)) dto: { name?: string; role?: string; isActive?: boolean }) {
    return this.users.updateUser(id, dto, actor.id);
  }
}

@Controller("roles")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RolesController {
  constructor(private readonly users: UsersAdminService) {}

  @Get()
  @RequirePermissions("role:manage", "user:manage")
  list() {
    return this.users.listRoles();
  }

  @Get("permissions")
  @RequirePermissions("role:manage", "permission:manage", "user:manage")
  listPermissions() {
    return this.users.listPermissions();
  }

  @Post()
  @RequirePermissions("role:manage")
  create(@CurrentUser() actor: RequestUser, @Body(new ZodValidationPipe(createRoleSchema)) dto: { name: string; description?: string }) {
    return this.users.createRole(dto, actor.id);
  }

  @Patch(":id")
  @RequirePermissions("role:manage")
  update(@CurrentUser() actor: RequestUser, @Param("id") id: string, @Body(new ZodValidationPipe(updateRoleSchema)) dto: { description?: string; permissionNames?: string[] }) {
    return this.users.updateRole(id, dto, actor.id);
  }
}

@Module({
  imports: [AuditModule],
  controllers: [UsersController, RolesController],
  providers: [UsersAdminService],
})
export class UsersModule {}
