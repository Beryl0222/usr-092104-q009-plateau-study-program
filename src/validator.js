/** 已登记的聚合类型。 */
export const AGGREGATE_TYPES = [
  "curriculum_revision",
  "school_team",
  "resource_window",
  "capacity_pool",
  "mentor_assignment",
  "substitution_proposal",
  "activity_evidence",
  "offline_sync_batch",
  "fee_settlement",
  "labor_settlement",
  "consent_record",
];

/** 已登记的事件类型。 */
export const EVENT_TYPES = [
  "PROGRAM_BOOKED",
  "TEAM_REGISTERED",
  "WINDOW_UPDATED",
  "RESOURCE_RESERVED",
  "CAPACITY_ADJUSTED",
  "MENTOR_ASSIGNED",
  "SUBSTITUTION_PROPOSED",
  "SUBSTITUTION_ACCEPTED",
  "SUBSTITUTION_DECLINED",
  "ACTIVITY_VERIFIED",
  "OFFLINE_RECORD_SYNCED",
  "PROGRAM_CANCELLED",
  "FEE_SETTLED",
  "LABOR_SETTLED",
  "CONSENT_GRANTED",
  "CONSENT_REVOKED",
];

/** 事件类型允许挂载的聚合类型。 */
export const EVENT_AGGREGATE = {
  PROGRAM_BOOKED: "curriculum_revision",
  TEAM_REGISTERED: "school_team",
  WINDOW_UPDATED: "resource_window",
  RESOURCE_RESERVED: "resource_window",
  CAPACITY_ADJUSTED: "capacity_pool",
  MENTOR_ASSIGNED: "mentor_assignment",
  SUBSTITUTION_PROPOSED: "substitution_proposal",
  SUBSTITUTION_ACCEPTED: "substitution_proposal",
  SUBSTITUTION_DECLINED: "substitution_proposal",
  ACTIVITY_VERIFIED: "activity_evidence",
  OFFLINE_RECORD_SYNCED: "offline_sync_batch",
  PROGRAM_CANCELLED: "curriculum_revision",
  FEE_SETTLED: "fee_settlement",
  LABOR_SETTLED: "labor_settlement",
  CONSENT_GRANTED: "consent_record",
  CONSENT_REVOKED: "consent_record",
};

const required = ["event_id", "event_type", "aggregate_type", "aggregate_id", "occurred_at", "version", "summary"];

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

export function validateEvent(record) {
  const errors = required.filter((name) => !(name in record)).map((name) => `缺少字段：${name}`);
  if ("event_id" in record && !isNonEmptyString(record.event_id)) errors.push("event_id 必须是非空字符串");
  if ("aggregate_id" in record && !isNonEmptyString(record.aggregate_id)) errors.push("aggregate_id 必须是非空字符串");
  if ("summary" in record && !isNonEmptyString(record.summary)) errors.push("summary 必须是非空字符串");
  if ("event_type" in record && !EVENT_TYPES.includes(record.event_type)) errors.push(`未登记的事件类型：${record.event_type}`);
  if ("aggregate_type" in record && !AGGREGATE_TYPES.includes(record.aggregate_type)) errors.push(`未登记的聚合类型：${record.aggregate_type}`);
  if (
    "event_type" in record &&
    "aggregate_type" in record &&
    EVENT_TYPES.includes(record.event_type) &&
    EVENT_AGGREGATE[record.event_type] !== record.aggregate_type
  ) {
    errors.push(`事件 ${record.event_type} 应挂载聚合 ${EVENT_AGGREGATE[record.event_type]}`);
  }
  if ("occurred_at" in record && (typeof record.occurred_at !== "string" || Number.isNaN(Date.parse(record.occurred_at)))) {
    errors.push("occurred_at 必须是可解析的时间字符串");
  }
  if ("version" in record && (!Number.isInteger(record.version) || record.version < 1)) errors.push("version 必须是正整数");
  return errors;
}
