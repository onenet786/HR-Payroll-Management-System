import type { Employee, LeaveRequest, StatutoryConfig } from '../types';

export type LeaveType = LeaveRequest['leaveType'];
export const PAID_LEAVE_TYPES: LeaveType[] = ['Annual', 'Casual', 'Sick', 'Maternity', 'Paternity', 'Hajj'];

// Starting points modelled on Pakistani labour law practice; every value is editable under statutory change control.
export const DEFAULT_LEAVE_ENTITLEMENTS: Record<Exclude<LeaveType, 'Unpaid'>, number> = {
  Annual: 14, Casual: 10, Sick: 16, Maternity: 90, Paternity: 0, Hajj: 0,
};

export function leaveEntitlementFor(config: Pick<StatutoryConfig, 'leaveEntitlements' | 'annualLeaveDaysPerYear'> | undefined, type: LeaveType): number {
  if (type === 'Unpaid') return 0;
  if (type === 'Annual') return config?.leaveEntitlements?.Annual ?? config?.annualLeaveDaysPerYear ?? DEFAULT_LEAVE_ENTITLEMENTS.Annual;
  return config?.leaveEntitlements?.[type] ?? DEFAULT_LEAVE_ENTITLEMENTS[type];
}

export interface LeaveBalance { type: LeaveType; entitled: number; taken: number; pending: number; remaining: number }

const overlapDays = (leave: LeaveRequest, from: string, to: string) => {
  const start = leave.startDate > from ? leave.startDate : from;
  const end = leave.endDate < to ? leave.endDate : to;
  return end < start ? 0 : Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
};

/**
 * Calendar-year balances. Annual and casual leave accrue pro-rata for staff who joined during the year;
 * event-based leave (sick, maternity, paternity, Hajj) is available in full once employed.
 */
export function leaveBalances(employee: Employee, leaves: LeaveRequest[], year: number, config?: Pick<StatutoryConfig, 'leaveEntitlements' | 'annualLeaveDaysPerYear'>, excludeRequestId?: string): LeaveBalance[] {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const joinedThisYear = employee.dateOfJoining > from && employee.dateOfJoining <= to;
  const serviceShare = joinedThisYear ? (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${employee.dateOfJoining}T00:00:00Z`)) / (365 * 86_400_000) : employee.dateOfJoining > to ? 0 : 1;
  const mine = leaves.filter(leave => leave.employeeId === employee.id && leave.id !== excludeRequestId);
  return PAID_LEAVE_TYPES.map(type => {
    const full = leaveEntitlementFor(config, type);
    const entitled = type === 'Annual' || type === 'Casual' ? Math.floor(full * serviceShare) : (serviceShare > 0 ? full : 0);
    const days = (status: LeaveRequest['status']) => mine.filter(leave => leave.leaveType === type && leave.status === status).reduce((sum, leave) => sum + overlapDays(leave, from, to), 0);
    const taken = days('Approved');
    const pending = days('Pending');
    return { type, entitled, taken, pending, remaining: Math.max(0, entitled - taken - pending) };
  });
}

/** Returns a reason when a paid leave request exceeds the employee's remaining balance. */
export function leaveBalanceError(request: Pick<LeaveRequest, 'id' | 'employeeId' | 'leaveType' | 'startDate' | 'endDate'>, employee: Employee, leaves: LeaveRequest[], config?: Pick<StatutoryConfig, 'leaveEntitlements' | 'annualLeaveDaysPerYear'>): string | undefined {
  if (request.leaveType === 'Unpaid') return undefined;
  const years = new Set([Number(request.startDate.slice(0, 4)), Number(request.endDate.slice(0, 4))]);
  for (const year of years) {
    const balance = leaveBalances(employee, leaves, year, config, request.id).find(item => item.type === request.leaveType);
    const requested = overlapDays(request as LeaveRequest, `${year}-01-01`, `${year}-12-31`);
    if (balance && requested > balance.remaining) {
      return `${request.leaveType} leave balance for ${year} is ${balance.remaining} day(s) (entitled ${balance.entitled}, taken ${balance.taken}, pending ${balance.pending}); ${requested} requested. Apply the excess as Unpaid leave.`;
    }
  }
  return undefined;
}
