export type MasterDataStatus = 'ACTIVE' | 'INACTIVE' | 'OBSOLETE';

export type MasterDataEntityType =
  | 'PRODUCT'
  | 'INGREDIENT'
  | 'SUPPLIER'
  | 'DOCUMENT'
  | 'REGULATION'
  | 'CODE_LIST';

export type MasterDataRef = {
  id: string;
  code: string;
  name: string;
  entityType: MasterDataEntityType;
  status: MasterDataStatus;
  revision?: string;
  effectiveDate?: string;
  obsoleteDate?: string;
};

export type CodeListItem = {
  code: string;
  label: string;
  active: boolean;
  sortOrder?: number;
};

export type ReferenceDataSet = {
  key: string;
  version: string;
  effectiveDate: string;
  items: CodeListItem[];
};

export const isUsableMasterData = (item: MasterDataRef): boolean =>
  item.status === 'ACTIVE' &&
  (!item.effectiveDate || !!item.effectiveDate);

export const hasDuplicateCodes = (items: MasterDataRef[]): boolean => {
  const seen = new Set<string>();
  for (const item of items) {
    const key = item.entityType + ':' + item.code;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
};
