export type KpiPeriod = { from: string; to: string };

export type KpiValue = {
  key: string;
  period: KpiPeriod;
  value: number;
  unit: 'PERCENT' | 'COUNT' | 'DAYS' | 'HOURS';
  denominator?: number;
  numerator?: number;
  sourceRecordCount: number;
};

export type KpiSnapshot = {
  generatedAt: string;
  period: KpiPeriod;
  values: KpiValue[];
};

export type RegistrationKpiInput = {
  totalCompleted: number;
  completedOnTime: number;
  totalCycleDays: number;
  completedCount: number;
  resubmissions: number;
};

export const registrationKpis = (i: RegistrationKpiInput, period: KpiPeriod): KpiValue[] => [
  {
    key: 'registration_on_time_rate',
    period,
    value: i.totalCompleted ? (i.completedOnTime / i.totalCompleted) * 100 : 0,
    unit: 'PERCENT',
    numerator: i.completedOnTime,
    denominator: i.totalCompleted,
    sourceRecordCount: i.totalCompleted,
  },
  {
    key: 'registration_average_cycle_time',
    period,
    value: i.completedCount ? i.totalCycleDays / i.completedCount : 0,
    unit: 'DAYS',
    sourceRecordCount: i.completedCount,
  },
  {
    key: 'registration_resubmission_count',
    period,
    value: i.resubmissions,
    unit: 'COUNT',
    sourceRecordCount: i.completedCount,
  },
];

export type ComplianceKpiInput = {
  labelReviewed: number;
  labelPassed: number;
  regulatoryActions: number;
  overdueActions: number;
  approvedProducts: number;
  compliantApprovedProducts: number;
};

export const complianceKpis = (i: ComplianceKpiInput, period: KpiPeriod): KpiValue[] => [
  {
    key: 'label_compliance_rate',
    period,
    value: i.labelReviewed ? (i.labelPassed / i.labelReviewed) * 100 : 0,
    unit: 'PERCENT',
    numerator: i.labelPassed,
    denominator: i.labelReviewed,
    sourceRecordCount: i.labelReviewed,
  },
  {
    key: 'regulatory_action_overdue',
    period,
    value: i.overdueActions,
    unit: 'COUNT',
    sourceRecordCount: i.regulatoryActions,
  },
  {
    key: 'approved_product_compliance_rate',
    period,
    value: i.approvedProducts
      ? (i.compliantApprovedProducts / i.approvedProducts) * 100
      : 0,
    unit: 'PERCENT',
    numerator: i.compliantApprovedProducts,
    denominator: i.approvedProducts,
    sourceRecordCount: i.approvedProducts,
  },
];
