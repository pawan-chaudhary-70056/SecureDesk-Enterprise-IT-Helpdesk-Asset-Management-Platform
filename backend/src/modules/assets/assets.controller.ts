import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard, PermissionsGuard, RequirePermissions } from "../../common/guards/auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { RequestUser } from "../../common/guards/auth.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import {
  assignAssetSchema,
  createAssetSchema,
  listAssetsQuerySchema,
  updateAssetSchema,
} from "./assets.schema";
import { AssetsService } from "./assets.service";

@Controller("assets")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  @RequirePermissions("asset:read:own", "asset:read:all")
  list(@CurrentUser() user: RequestUser, @Query(new ZodValidationPipe(listAssetsQuerySchema)) query: unknown) {
    return this.assets.list(user, query as never);
  }

  @Get(":id")
  @RequirePermissions("asset:read:own", "asset:read:all")
  getById(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.assets.getById(user, id);
  }

  @Post()
  @RequirePermissions("asset:manage")
  create(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(createAssetSchema)) dto: unknown) {
    return this.assets.create(user, dto as never);
  }

  @Patch(":id")
  @RequirePermissions("asset:manage")
  update(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body(new ZodValidationPipe(updateAssetSchema)) dto: unknown) {
    return this.assets.update(user, id, dto as never);
  }

  @Post(":id/assign")
  @RequirePermissions("asset:manage")
  assign(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body(new ZodValidationPipe(assignAssetSchema)) dto: unknown) {
    return this.assets.assign(user, id, dto as never);
  }

  @Post(":id/return")
  @RequirePermissions("asset:manage")
  returnAsset(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.assets.return(user, id);
  }

  @Post(":id/maintenance")
  @RequirePermissions("asset:manage")
  maintenance(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.assets.maintenance(user, id, false);
  }

  @Post(":id/maintenance/end")
  @RequirePermissions("asset:manage")
  endMaintenance(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.assets.maintenance(user, id, true);
  }

  @Post(":id/retire")
  @RequirePermissions("asset:manage")
  retire(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.assets.retire(user, id);
  }
}
