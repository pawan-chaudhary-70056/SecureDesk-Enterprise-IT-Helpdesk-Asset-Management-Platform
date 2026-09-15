import { BadRequestException, Injectable, PipeTransform } from "@nestjs/common";
import type { ZodTypeAny } from "zod";

/** Validates request bodies against a Zod schema; 400 with field details on failure. */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodTypeAny) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
      throw new BadRequestException({ message: "Validation failed", details });
    }
    return result.data;
  }
}
