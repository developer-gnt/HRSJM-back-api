import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Repository } from "typeorm";
import { SupportService } from "./support.service";
import { DocumentsService } from "../documents/documents.service";
import { SupportTicket, TicketStatus } from "./entities/support-ticket.entity";
import { SupportTicketMessage } from "./entities/support-ticket-message.entity";
import { UserRole } from "../users/entities/user.entity";

const member = { id: "u-member", email: "m@example.com", role: UserRole.MEMBER };
const admin = { id: "u-admin", email: "a@example.com", role: UserRole.ADMIN };
const stranger = { id: "u-stranger", email: "s@example.com", role: UserRole.DONOR };

const makeTicket = (overrides: Partial<SupportTicket> = {}): SupportTicket =>
  ({
    id: "t-1",
    userId: member.id,
    subject: "Cannot download certificate",
    description: "The button fails.",
    status: TicketStatus.SUBMITTED,
    resolvedBy: null,
    resolvedAt: null,
    ...overrides,
  }) as unknown as SupportTicket;

describe("SupportService", () => {
  let service: SupportService;
  let ticketsRepo: Record<string, jest.Mock>;
  let messagesRepo: Record<string, jest.Mock>;
  let documentsService: { upload: jest.Mock };

  beforeEach(() => {
    ticketsRepo = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => x),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    messagesRepo = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: "msg-1", ...x })),
      createQueryBuilder: jest.fn(),
    };
    documentsService = { upload: jest.fn(async () => ({ message: "ok", data: { id: "d-1" } })) };
    service = new SupportService(
      ticketsRepo as unknown as Repository<SupportTicket>,
      messagesRepo as unknown as Repository<SupportTicketMessage>,
      documentsService as unknown as DocumentsService,
    );
  });

  describe("create", () => {
    it("starts tickets as SUBMITTED", async () => {
      const result = await service.create(member, { subject: "Cannot download", description: "It fails" } as never);
      expect(result.data.status).toBe(TicketStatus.SUBMITTED);
    });
  });

  describe("getForActor (ownership)", () => {
    it("blocks strangers (403)", async () => {
      ticketsRepo.findOne.mockResolvedValue(makeTicket());
      await expect(service.getById(stranger, "t-1")).rejects.toThrow(ForbiddenException);
    });

    it("allows admins to view any ticket", async () => {
      ticketsRepo.findOne.mockResolvedValue(
        makeTicket({ user: { id: member.id, fullName: "M", email: "m@example.com" } as never }),
      );
      const result = await service.getById(admin, "t-1");
      expect((result.data as { owner?: { id: string } }).owner?.id).toBe(member.id);
    });
  });

  describe("addMessage", () => {
    it("owner can reply on the thread", async () => {
      ticketsRepo.findOne.mockResolvedValue(makeTicket());
      const result = await service.addMessage(member, "t-1", { body: "still failing" } as never);
      expect(result.data.body).toBe("still failing");
      expect(result.data.ticketStatus).toBe(TicketStatus.SUBMITTED);
    });

    it("first admin response auto-moves SUBMITTED -> UNDER_REVIEW", async () => {
      const ticket = makeTicket();
      ticketsRepo.findOne.mockResolvedValue(ticket);
      const result = await service.addMessage(admin, "t-1", { body: "looking into it" } as never);
      expect(ticket.status).toBe(TicketStatus.UNDER_REVIEW);
      expect(result.data.ticketStatus).toBe(TicketStatus.UNDER_REVIEW);
    });

    it("does not re-move tickets already under review", async () => {
      const ticket = makeTicket({ status: TicketStatus.UNDER_REVIEW });
      ticketsRepo.findOne.mockResolvedValue(ticket);
      await service.addMessage(admin, "t-1", { body: "update" } as never);
      expect(ticket.status).toBe(TicketStatus.UNDER_REVIEW);
    });

    it("blocks strangers from posting (403)", async () => {
      ticketsRepo.findOne.mockResolvedValue(makeTicket());
      await expect(service.addMessage(stranger, "t-1", { body: "hi" } as never)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe("updateStatus (lifecycle)", () => {
    it("admin resolves with note and stamps resolvedAt", async () => {
      ticketsRepo.findOne.mockResolvedValue(makeTicket({ status: TicketStatus.UNDER_REVIEW }));
      const result = await service.updateStatus(admin, "t-1", {
        status: TicketStatus.RESOLVED,
        note: "Fixed",
      } as never);
      expect(result.data.status).toBe(TicketStatus.RESOLVED);
      expect(result.data.resolvedAt).toBeDefined();
      expect(messagesRepo.create).toHaveBeenCalled(); // note stored as message
    });

    it("enforces transitions (CLOSED is terminal)", async () => {
      ticketsRepo.findOne.mockResolvedValue(makeTicket({ status: TicketStatus.CLOSED }));
      await expect(
        service.updateStatus(admin, "t-1", { status: TicketStatus.RESOLVED } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects backwards transitions (RESOLVED -> UNDER_REVIEW)", async () => {
      ticketsRepo.findOne.mockResolvedValue(makeTicket({ status: TicketStatus.RESOLVED }));
      await expect(
        service.updateStatus(admin, "t-1", { status: TicketStatus.UNDER_REVIEW } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws 404 for unknown tickets", async () => {
      ticketsRepo.findOne.mockResolvedValue(null);
      await expect(
        service.updateStatus(admin, "nope", { status: TicketStatus.CLOSED } as never),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("attachDocument", () => {
    it("links the attachment to the ticket", async () => {
      ticketsRepo.findOne.mockResolvedValue(makeTicket());
      const pdf = { originalname: "s.pdf", mimetype: "application/pdf", size: 10, buffer: Buffer.from("x") };
      await service.attachDocument(member, "t-1", pdf as never, {});
      const dto = documentsService.upload.mock.calls[0][2];
      expect(dto.relatedEntityType).toBe("SUPPORT_TICKET");
      expect(dto.relatedEntityId).toBe("t-1");
    });
  });
});