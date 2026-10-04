/** 已登记的聚合类型。 */
export type AggregateType =
  | "curriculum_revision"
  | "school_team"
  | "resource_window"
  | "capacity_pool"
  | "mentor_assignment"
  | "substitution_proposal"
  | "activity_evidence"
  | "offline_sync_batch"
  | "fee_settlement"
  | "labor_settlement"
  | "consent_record";

/** 已登记的事件类型。 */
export type EventType =
  | "PROGRAM_BOOKED"
  | "TEAM_REGISTERED"
  | "WINDOW_UPDATED"
  | "RESOURCE_RESERVED"
  | "CAPACITY_ADJUSTED"
  | "MENTOR_ASSIGNED"
  | "SUBSTITUTION_PROPOSED"
  | "SUBSTITUTION_ACCEPTED"
  | "SUBSTITUTION_DECLINED"
  | "ACTIVITY_VERIFIED"
  | "OFFLINE_RECORD_SYNCED"
  | "PROGRAM_CANCELLED"
  | "FEE_SETTLED"
  | "LABOR_SETTLED"
  | "CONSENT_GRANTED"
  | "CONSENT_REVOKED";

/** 领域事件信封。 */
export interface DomainEvent {
  event_id: string;
  event_type: EventType;
  aggregate_type: AggregateType;
  aggregate_id: string;
  occurred_at: string;
  version: number;
  summary: string;
  /** 事件负载，键名约定见各事件定义。 */
  payload?: Record<string, unknown>;
}

/** 资源预约负载：四项容量校验须在同一事务内全部通过。 */
export interface ResourceReservedPayload {
  program_id: string;
  team_id: string;
  window_id: string;
  checks: {
    crop: boolean;
    personnel: boolean;
    space: boolean;
    safety: boolean;
  };
}

/** 替代方案负载：须附等值说明，学校确认后方可执行。 */
export interface SubstitutionProposedPayload {
  program_id: string;
  reason: string;
  affected_segments: string[];
  equivalence_note: string;
}

/** 活动证据负载：按环节与小组分别核验，单次签到不构成全程证明。 */
export interface ActivityVerifiedPayload {
  program_id: string;
  segment_id: string;
  group_id: string;
  evidence_refs: string[];
}

/** 离线回传负载：幂等键用于去重，重复回传不得重复计课时与工资。 */
export interface OfflineRecordSyncedPayload {
  idempotency_key: string;
  source_device: string;
  record_count: number;
}

/** 费用结算负载：只列真实提供并核验的资源行项。 */
export interface FeeSettledPayload {
  program_id: string;
  lines: Array<{ item: string; amount: number; evidence_event_id?: string }>;
}
