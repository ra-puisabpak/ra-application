export type DeadlineType =
  | 'FDA_QUERY'
  | 'CAPA'
  | 'CHANGE_CONTROL'
  | 'APPROVAL'
  | 'DOCUMENT_REVIEW'
  | 'RA_TASK';

export type DeadlineStatus = 'UPCOMING' | 'DUE_TODAY' | 'OVERDUE' | 'COMPLETED' | 'CANCELLED';

export type DeadlineRecord = {
  id: string;
  type: DeadlineType;
  recordId: string;
  title: string;
  ownerId: string;
  dueAt: string;
  completedAt?: string;
  status: DeadlineStatus;
};

export type NotificationPriority = 'INFO' | 'WARNING' | 'HIGH' | 'CRITICAL';

export type Notification = {
  id: string;
  recipientUserId: string;
  deadlineId: string;
  priority: NotificationPriority;
  title: string;
  message: string;
  createdAt: string;
  readAt?: string;
};

export const calculateDeadlineStatus = (
  dueAt: string,
  now: string,
  completedAt?: string,
): DeadlineStatus => {
  if (completedAt) return 'COMPLETED';
  const due = new Date(dueAt).getTime();
  const current = new Date(now).getTime();
  if (due < current) return 'OVERDUE';
  const dueDay = new Date(dueAt).toISOString().slice(0, 10);
  const nowDay = new Date(now).toISOString().slice(0, 10);
  if (dueDay === nowDay) return 'DUE_TODAY';
  return 'UPCOMING';
};

export const priorityForDeadline = (status: DeadlineStatus): NotificationPriority => {
  if (status === 'OVERDUE') return 'HIGH';
  if (status === 'DUE_TODAY') return 'WARNING';
  return 'INFO';
};
