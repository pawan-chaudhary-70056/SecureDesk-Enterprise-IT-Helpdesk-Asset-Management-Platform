import { Body, Controller, Get, Injectable, Module, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { PrismaService } from "../../database/prisma.service";
import { JwtAuthGuard, PermissionsGuard, RequirePermissions } from "../../common/guards/auth.guard";
import { AuditService } from "../../audit/audit.service";
import { AuditModule } from "../../audit/audit.module";
import { AUDIT_ACTIONS } from "../../common/constants";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";

const createCategorySchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
});

const updateCategorySchema = createCategorySchema.partial();

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.category.findMany({ orderBy: { name: "asc" } });
  }

  async create(dto: { name: string; description?: string }) {
    const category = await this.prisma.category.create({ data: dto });
    await this.audit.record({ action: AUDIT_ACTIONS.ADMIN_ACTION, entityType: "Category", entityId: category.id, detail: "created" });
    return category;
  }

  async update(id: string, dto: { name?: string; description?: string }) {
    const category = await this.prisma.category.update({ where: { id }, data: dto });
    await this.audit.record({ action: AUDIT_ACTIONS.ADMIN_ACTION, entityType: "Category", entityId: id, detail: "updated" });
    return category;
  }
}

@Controller("categories")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  list() {
    // Categories are safe metadata for any authenticated user.
    return this.categories.list();
  }

  @Post()
  @RequirePermissions("category:manage")
  create(@Body(new ZodValidationPipe(createCategorySchema)) dto: { name: string; description?: string }) {
    return this.categories.create(dto);
  }

  @Patch(":id")
  @RequirePermissions("category:manage")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updateCategorySchema)) dto: { name?: string; description?: string }) {
    return this.categories.update(id, dto);
  }
}

@Module({
  imports: [AuditModule],
  controllers: [CategoriesController],
  providers: [CategoriesService],
})
export class CategoriesModule {}
