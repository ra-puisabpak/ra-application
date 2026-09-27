export type ProductReleaseStatus =
  | "HOLD"
  | "READY_FOR_QA_RELEASE"
  | "RELEASED"
  | "REJECTED"
  | "WITHDRAWN";

export interface ProductReleaseContext {
  releaseId: string;
  productId: string;
  batchLotNo: string;
  regulatoryReleaseState: "NOT_READY" | "READY_FOR_RELEASE" | "RELEASED" | "BLOCKED" | "WITHDRAWN";
  qcEvidenceVerified: boolean;
  qaReviewCompleted: boolean;
  requiredRecordsComplete: boolean;
  unresolvedNonconformity: boolean;
  unresolvedCapa: boolean;
  traceabilityComplete: boolean;
  status: ProductReleaseStatus;
}

export interface ProductReleaseDecision {
  status: ProductReleaseStatus;
  blockers: string[];
}

export function validateProductRelease(
  context: ProductReleaseContext,
): ProductReleaseDecision {
  const blockers: string[] = [];

  if (!context.productId) blockers.push("PRODUCT_REQUIRED");
  if (!context.batchLotNo) blockers.push("BATCH_LOT_REQUIRED");
  if (context.regulatoryReleaseState !== "RELEASED") {
    blockers.push("REGULATORY_RELEASE_NOT_COMPLETED");
  }
  if (!context.qcEvidenceVerified) blockers.push("QC_EVIDENCE_NOT_VERIFIED");
  if (!context.qaReviewCompleted) blockers.push("QA_REVIEW_NOT_COMPLETED");
  if (!context.requiredRecordsComplete) blockers.push("REQUIRED_RECORDS_INCOMPLETE");
  if (context.unresolvedNonconformity) blockers.push("UNRESOLVED_NONCONFORMITY");
  if (context.unresolvedCapa) blockers.push("UNRESOLVED_CAPA");
  if (!context.traceabilityComplete) blockers.push("TRACEABILITY_INCOMPLETE");

  return blockers.length
    ? { status: "HOLD", blockers }
    : { status: "READY_FOR_QA_RELEASE", blockers: [] };
}
