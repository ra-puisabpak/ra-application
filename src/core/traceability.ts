export type TraceNodeType =
  | 'PRODUCT'
  | 'REGULATORY_FILE'
  | 'FORMULA'
  | 'PROCESS'
  | 'HACCP'
  | 'SPECIFICATION'
  | 'LABEL'
  | 'REGISTRATION'
  | 'ARTWORK'
  | 'CHANGE_CONTROL'
  | 'CAPA'
  | 'AUDIT'
  | 'EVIDENCE';

export type TraceLink = {
  fromType: TraceNodeType;
  fromId: string;
  toType: TraceNodeType;
  toId: string;
  relation:
    | 'HAS'
    | 'REFERENCES'
    | 'APPROVED_BY'
    | 'SUPPORTED_BY'
    | 'IMPACTS'
    | 'RESULTED_IN'
    | 'VERIFIED_BY';
  revision?: string;
};

export type TraceabilityGraph = {
  productId: string;
  links: TraceLink[];
};

export const missingRequiredTraceLinks = (
  graph: TraceabilityGraph,
  requiredRelations: Array<Pick<TraceLink, 'fromType' | 'toType' | 'relation'>>,
): Array<Pick<TraceLink, 'fromType' | 'toType' | 'relation'>> =>
  requiredRelations.filter((required) =>
    !graph.links.some((link) =>
      link.fromType === required.fromType &&
      link.toType === required.toType &&
      link.relation === required.relation,
    ),
  );
