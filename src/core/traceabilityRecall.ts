export type TraceabilityEventType =
  | "RECEIPT"
  | "PRODUCTION"
  | "PACKING"
  | "RELEASE"
  | "DISTRIBUTION"
  | "HOLD"
  | "WITHDRAWAL"
  | "RECALL";

export type TraceabilityStatus = "COMPLETE" | "INCOMPLETE" | "HOLD";

export interface TraceabilityLink {
  fromType: string;
  fromId: string;
  toType: string;
  toId: string;
  eventType: TraceabilityEventType;
  eventDate?: string;
  evidenceIds: string[];
}

export interface RecallCase {
  recallId: string;
  productId: string;
  affectedBatchLots: string[];
  reason: string;
  status: "OPEN" | "ASSESSMENT" | "ACTION" | "VERIFICATION" | "CLOSED";
  linkedNonconformityId?: string;
  linkedCapaId?: string;
  evidenceIds: string[];
}

export function validateTraceability(
  links: TraceabilityLink[],
  requiredNodeIds: string[],
): { status: TraceabilityStatus; missingNodeIds: string[] } {
  const linkedIds = new Set(
    links.flatMap((link) => [link.fromId, link.toId]),
  );
  const missingNodeIds = requiredNodeIds.filter((id) => !linkedIds.has(id));

  return {
    status: missingNodeIds.length ? "INCOMPLETE" : "COMPLETE",
    missingNodeIds,
  };
}
