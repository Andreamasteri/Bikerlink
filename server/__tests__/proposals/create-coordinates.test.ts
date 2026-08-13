import { describe, expect, it, vi, beforeEach } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";

vi.mock("../../lib/auth-middleware", () => ({
  requireAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock("../../db", () => ({
  db: {},
  withDbRetry: vi.fn(),
}));

vi.mock("@shared/db", () => ({
  motoClubMembers: {},
  proposalParticipants: {},
  users: {},
  userMotorcycles: {},
}));

vi.mock("../../storage", () => ({
  storage: {
    createProposal: vi.fn(),
  },
}));

vi.mock("../../matching-engine", () => ({
  triggerProposalCreatedMatching: vi.fn(),
}));

import proposalsRouter from "../../routes/proposals/crud";
import { storage } from "../../storage";
import { triggerProposalCreatedMatching } from "../../matching-engine";

const USER_ID = "proposal-test-user";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { session: { userId: USER_ID } });
    next();
  });
  app.use("/api/proposals", proposalsRouter);
  return app;
}

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    proposalType: "giro",
    searchType: "find_a_friend",
    searchTypes: ["find_a_friend"],
    title: "Giro di prova",
    departureAddress: "Milano",
    departureLatitude: 45.4642,
    departureLongitude: 9.19,
    ...overrides,
  };
}

describe("POST /api/proposals — coordinate contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(storage.createProposal).mockResolvedValue({
      id: "proposal-1",
      userId: USER_ID,
      departureLatitude: 45.4642,
      departureLongitude: 9.19,
    } as never);
  });

  it("accepts a biker proposal with valid departure coordinates", async () => {
    const res = await request(buildApp())
      .post("/api/proposals")
      .send(basePayload());

    expect(res.status).toBe(200);
    expect(storage.createProposal).toHaveBeenCalledOnce();
    expect(triggerProposalCreatedMatching).toHaveBeenCalledOnce();
    expect(vi.mocked(storage.createProposal).mock.calls[0][0]).toMatchObject({
      userId: USER_ID,
      status: "open",
      departureLatitude: 45.4642,
      departureLongitude: 9.19,
    });
  });

  it("rejects missing departure coordinates", async () => {
    const res = await request(buildApp())
      .post("/api/proposals")
      .send(basePayload({ departureLatitude: null }));

    expect(res.status).toBe(400);
    expect(storage.createProposal).not.toHaveBeenCalled();
    expect(triggerProposalCreatedMatching).not.toHaveBeenCalled();
  });

  it("rejects non-numeric departure coordinates", async () => {
    const res = await request(buildApp())
      .post("/api/proposals")
      .send(basePayload({ departureLongitude: "9.19" }));

    expect(res.status).toBe(400);
    expect(storage.createProposal).not.toHaveBeenCalled();
  });

  it("requires destination coordinates for hitchhiker proposals", async () => {
    const res = await request(buildApp())
      .post("/api/proposals")
      .send(basePayload({
        searchType: "hitchhiker",
        searchTypes: ["hitchhiker"],
        destinationAddress: "Roma",
      }));

    expect(res.status).toBe(400);
    expect(storage.createProposal).not.toHaveBeenCalled();
  });

  it("accepts a hitchhiker proposal with valid destination coordinates", async () => {
    const res = await request(buildApp())
      .post("/api/proposals")
      .send(basePayload({
        searchType: "hitchhiker",
        searchTypes: ["hitchhiker"],
        destinationAddress: "Roma",
        destinationLatitude: 41.9028,
        destinationLongitude: 12.4964,
      }));

    expect(res.status).toBe(200);
    expect(storage.createProposal).toHaveBeenCalledOnce();
    expect(vi.mocked(storage.createProposal).mock.calls[0][0]).toMatchObject({
      destinationLatitude: 41.9028,
      destinationLongitude: 12.4964,
    });
  });

  it("requires destination coordinates when extending a biker proposal", async () => {
    const res = await request(buildApp())
      .post("/api/proposals")
      .send(basePayload({ extendToDestination: true }));

    expect(res.status).toBe(400);
    expect(storage.createProposal).not.toHaveBeenCalled();
  });
});
