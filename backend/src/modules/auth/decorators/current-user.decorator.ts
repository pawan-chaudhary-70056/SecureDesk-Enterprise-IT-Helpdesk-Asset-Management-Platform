import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { RequestUser } from "../../../common/guards/auth.guard";

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestUser => {
  const req = ctx.switchToHttp().getRequest();
  return req.user;
});
