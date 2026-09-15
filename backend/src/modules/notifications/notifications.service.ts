import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { logger } from "../../common/middleware/http-logger.middleware";

export interface NotifyInput {
  userIds: string[];
  type: string;
  title: string;
  body: string;
  ticketId?: string;
}

/**
 * Creates in-app notifications for users who have in-app enabled, and "sends"
 * email for those with email enabled (logged in dev; wired to SMTP/email
 * provider in production by swapping deliverEmail()).
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async notify(input: NotifyInput): Promise<void> {
    if (input.userIds.length === 0) return;
    const unique = [...new Set(input.userIds)];
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique }, isActive: true },
      include: { notificationPrefs: true },
    });

    const inApp = users.filter((u) => u.notificationPrefs?.inAppEnabled ?? true);
    if (inApp.length > 0) {
      await this.prisma.notification.createMany({
        data: inApp.map((u) => ({
          userId: u.id,
          type: input.type,
          title: input.title,
          body: input.body,
          ticketId: input.ticketId,
        })),
      });
    }

    for (const u of users) {
      if (u.notificationPrefs?.emailEnabled ?? true) {
        this.deliverEmail(u.email, input.title, input.body);
      }
    }
  }

  /** Email delivery placeholder — plug SMTP/email provider here in production. */
  private deliverEmail(email: string, title: string, body: string): void {
    logger.info({ event: "email.sent", to: email, title, body });
  }

  listMine(userId: string, unreadOnly: boolean, page: number, pageSize: number) {
    return this.prisma.notification.findMany({
      where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
  }

  countMine(userId: string): Promise<{ total: number; unread: number }> {
    return this.prisma.notification
      .aggregate({
        where: { userId },
        _count: { _all: true },
      })
      .then(async (total) => {
        const unread = await this.prisma.notification.count({ where: { userId, readAt: null } });
        return { total: total._count._all, unread };
      });
  }

  async markRead(userId: string, ids: string[]): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { id: { in: ids }, userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  }

  getPreferences(userId: string) {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
  }

  async updatePreferences(userId: string, data: { emailEnabled: boolean; inAppEnabled: boolean }) {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });
  }
}
