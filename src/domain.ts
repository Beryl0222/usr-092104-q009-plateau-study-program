/**
 * 高原研学资源兑现领域类型。
 *
 * 设计约定：
 * - 事件是跨主体（运营方、学校、承包方、农户）同步的唯一事实来源。
 * - 事件只携带履约所需的最小信息；学生个人资料不进入事件流（见 PrivacyNotice）。
 * - 枚举值与 contracts/domain.schema.json 保持一致，新增事件只能追加。
 */

// ---------- 枚举 ----------

export type EventType =
  | "PROGRAM_PUBLISHED"
  | "PROGRAM_BOOKED"
  | "INSTRUCTOR_QUALIFIED"
  | "BOOKING_REQUESTED"
  | "STAFF_DUTY_ASSIGNED"
  | "HEALTH_GUIDANCE_ISSUED"
  | "RESOURCE_WINDOW_DECLARED"
  | "RESOURCE_BLOCKED"
  | "RESERVATION_REJECTED"
  | "RESOURCE_RESERVED"
  | "CONSENT_RECORDED"
  | "SUBSTITUTION_PROPOSED"
  | "SUBSTITUTION_ACCEPTED"
  | "SUBSTITUTION_REJECTED"
  | "ACTIVITY_RECORDED"
  | "OFFLINE_BATCH_SYNCHRONIZED"
  | "ACTIVITY_VERIFIED"
  | "LABOR_RECORDED"
  | "LABOR_SETTLED"
  | "BOOKING_CANCELLED"
  | "FEE_SETTLED";

export type AggregateType =
  | "curriculum_revision"
  | "personnel_profile"
  | "study_booking"
  | "resource_window"
  | "resource_reservation"
  | "privacy_consent"
  | "substitution"
  | "activity_evidence"
  | "labor_settlement"
  | "fee_settlement";

/** 预约必须同事务校验的四类资源：作物、空间（场馆）、车辆、人员。 */
export type ResourceKind = "crop_field" | "greenhouse" | "vehicle" | "instructor";

/** 四维校验：作物成熟与禁入、人员资质与占用、场馆车辆容量、高原安全容量。 */
export type CheckDimension = "crop" | "personnel" | "space" | "safety";

export type BlockageReason =
  | "road_closure"
  | "farming_no_entry"
  | "crop_unripe"
  | "personnel_occupied"
  | "venue_closed"
  | "safety_hazard";

export type ActivityType =
  | "seed_observation"
  | "soilless_culture"
  | "picking"
  | "workshop"
  | "field_tour";

/**
 * media_usage：影像用途同意，按用途逐项授权；
 * child_data_on_duty：儿童资料仅向当班人员开放。
 */
export type ConsentScope = "media_usage" | "child_data_on_duty";

export type ConsentPurpose =
  | "activity_evidence"
  | "school_report"
  | "marketing"
  | "safety_care";

export type EvidenceType =
  | "observation_sheet"
  | "photo"
  | "group_signature"
  | "harvest_record"
  | "sensor_reading";

/** 离线回传幂等结果：duplicate 不得再次计入课时或工资。 */
export type SyncResult = "accepted" | "duplicate";

export type VerificationStatus = "verified" | "disputed";

// ---------- 课程版本与学段目标 ----------

export interface StageTarget {
  stage: string;
  objective_code: `OBJ-${string}`;
  objective: string;
}

export interface ActivitySpec {
  activity_code: `ACT-${string}`;
  title: string;
  activity_type: ActivityType;
  /** 必修环节缺失时，对应费用不得结算，并在学校报告中列为缺失实践。 */
  required: boolean;
  needs: ResourceKind[];
  objective_codes: `OBJ-${string}`[];
}

export interface PriceItem {
  item_code: `PRICE-${string}`;
  title: string;
  unit_price: number;
  unit: "group" | "person" | "vehicle" | "session";
  activity_code?: `ACT-${string}`;
}

export interface ProgramPublishedPayload {
  curriculum_id: string;
  revision: number;
  title?: string;
  stage_targets: StageTarget[];
  activities: ActivitySpec[];
  price_items?: PriceItem[];
}

// ---------- 人员资质与当班 ----------

export interface InstructorQualifiedPayload {
  staff_id: string;
  name?: string;
  qualification_codes: string[];
  valid_from: string;
  valid_until: string;
  activity_types: ActivityType[];
}

export interface DutyAssignment {
  staff_id: string;
  name?: string;
  role: "lead_teacher" | "instructor" | "nurse" | "chaperone" | "driver";
  duty_start: string;
  duty_end: string;
}

export interface StaffDutyAssignedPayload {
  booking_id: string;
  assignments: DutyAssignment[];
}

// ---------- 学校团队、监护与健康提示 ----------

export interface GroupInfo {
  group_id: string;
  name: string;
}

export interface ParticipantCounts {
  students: number;
  teachers: number;
  chaperones: number;
}

export interface BookingRequestedPayload {
  booking_id: string;
  school_id: string;
  school_name?: string;
  curriculum_id: string;
  revision: number;
  scheduled_date: string;
  slot?: string;
  groups: GroupInfo[];
  /** 只有人数，没有学生身份信息；儿童资料由独立同意聚合控制访问。 */
  participant_counts: ParticipantCounts;
  /** 有权代表学校确认替代方案与费用兑现的人员。 */
  authorized_confirmer_ids: string[];
  requirements?: string;
}

export interface HealthTip {
  code:
    | "altitude"
    | "allergy"
    | "medication"
    | "sun_exposure"
    | "chaperone_ratio"
    | "emergency_contact";
  text: string;
}

export interface HealthGuidanceIssuedPayload {
  booking_id: string;
  tips: HealthTip[];
  acknowledged_by_school: boolean;
  emergency_plan_ref?: string;
}

// ---------- 田块生长窗口、容量与阻断 ----------

export interface ResourceWindowDeclaredPayload {
  resource_id: string;
  kind: ResourceKind;
  title?: string;
  location?: string;
  capacity_per_slot: number;
  slot_start: string;
  slot_end: string;
  /** false 表示试验田处于禁入阶段等不可接待状态。 */
  accessible: boolean;
  crop_stage?: "sowing" | "growing" | "ripe" | "harvested" | "fallow";
  growth_window_start?: string;
  growth_window_end?: string;
}

export interface ResourceBlockedPayload {
  resource_id: string;
  reason: BlockageReason;
  starts_at: string;
  ends_at?: string | null;
  note?: string;
}

// ---------- 预约（四维同事务校验） ----------

export interface DimensionChecks {
  crop: "passed";
  personnel: "passed";
  space: "passed";
  safety: "passed";
}

export interface Allocation {
  resource_kind: ResourceKind;
  resource_id: string;
  activity_code?: string;
  capacity_used: number;
  capacity_limit: number;
}

export interface ResourceReservedPayload {
  reservation_id: string;
  booking_id: string;
  slot_start: string;
  slot_end: string;
  checks: DimensionChecks;
  allocations: Allocation[];
}

export interface ReservationRejectedPayload {
  reservation_id: string;
  booking_id: string;
  failed_dimensions: CheckDimension[];
  reasons: { dimension: CheckDimension; resource_id?: string; reason: string }[];
}

// ---------- 隐私同意 ----------

export interface ConsentRecordedPayload {
  consent_id: string;
  booking_id: string;
  scope: ConsentScope;
  granted: boolean;
  purposes: ConsentPurpose[];
  granted_by: "guardian" | "school";
  granted_at: string;
  note?: string;
}

// ---------- 替代方案（等值说明 + 学校确认） ----------

export interface SubstitutionProposedPayload {
  substitution_id: string;
  booking_id: string;
  reservation_id?: string;
  replaces: { resource_kind: ResourceKind; resource_id?: string; activity_code: string };
  replacement: { resource_kind: ResourceKind; resource_id: string };
  /** 逐学段目标说明替代如何等值兑现。 */
  objective_codes: `OBJ-${string}`[];
  equivalence_note: string;
  fee_delta_preview?: number;
}

export interface SubstitutionAcceptedPayload {
  substitution_id: string;
  booking_id: string;
  /** 必须是 BOOKING_REQUESTED.authorized_confirmer_ids 中的学校人员。 */
  confirmed_by: string;
  confirmed_at: string;
}

export interface SubstitutionRejectedPayload {
  substitution_id: string;
  booking_id: string;
  rejected_by: string;
  reason: string;
  rejected_at: string;
}

// ---------- 环节证据（不能用一次签到证明全部环节） ----------

export interface ActivityRecordedPayload {
  evidence_id: string;
  booking_id: string;
  group_id: string;
  activity_code: string;
  instructor_id?: string;
  resource_id: string;
  started_at: string;
  ended_at: string;
  evidence_types: EvidenceType[];
  recorded_offline: boolean;
  /** 离线记录幂等键。 */
  client_record_id?: string;
}

export interface OfflineSyncItem {
  record_type: "activity" | "labor";
  client_record_id: string;
  result: SyncResult;
}

export interface OfflineBatchSynchronizedPayload {
  batch_id: string;
  booking_id: string;
  synced_at: string;
  items: OfflineSyncItem[];
}

export interface ActivityVerifiedPayload {
  evidence_id: string;
  booking_id: string;
  group_id: string;
  activity_code: string;
  status: VerificationStatus;
  verified_by: string;
  note?: string;
}

// ---------- 农户劳务 ----------

export interface LaborRecordedPayload {
  labor_record_id: string;
  booking_id: string;
  worker_id: string;
  worker_name?: string;
  /** 承包方：工资散落在不同承包方表格中，事件将其归一到同一工人身份。 */
  contractor_id: string;
  activity_code: string;
  work_minutes: number;
  rate_per_hour: number;
  recorded_offline: boolean;
  client_record_id?: string;
}

export interface LaborSettlementLine {
  labor_record_id: string;
  work_minutes: number;
  amount: number;
}

export interface LaborSettledPayload {
  settlement_id: string;
  worker_id: string;
  contractor_id: string;
  booking_id: string;
  lines: LaborSettlementLine[];
  total_minutes: number;
  total_amount: number;
  settled_at: string;
}

// ---------- 取消与费用结算 ----------

export interface BookingCancelledPayload {
  booking_id: string;
  reason: string;
  cancelled_at: string;
  fee_handling_note?: string;
}

export interface FeeLine {
  item_code: string;
  activity_code?: string;
  /** 按小组兑现时填写；证据的 group_id 必须与本行一致，防止跨组冒兑。 */
  group_id?: string;
  resource_id?: string;
  quantity: number;
  amount: number;
  /** 兑现依据：已核验的环节证据，或学校已确认的替代方案。 */
  basis?: { evidence_id?: string; substitution_id?: string };
}

export interface CanceledFeeLine {
  item_code: string;
  activity_code?: string;
  group_id?: string;
  amount: number;
}

export interface FeeSettledPayload {
  settlement_id: string;
  booking_id: string;
  charged_amount: number;
  delivered: FeeLine[];
  canceled: CanceledFeeLine[];
  payable_amount: number;
  refund_amount: number;
  accounting_ref: string;
  settled_at: string;
}

// ---------- 事件信封与分发 ----------

export interface DomainEvent<P = unknown> {
  event_id: string;
  event_type: EventType;
  aggregate_type: AggregateType;
  aggregate_id: string;
  occurred_at: string;
  version: number;
  summary: string;
  payload?: P;
}

export interface EventPayloadMap {
  PROGRAM_PUBLISHED: ProgramPublishedPayload;
  INSTRUCTOR_QUALIFIED: InstructorQualifiedPayload;
  BOOKING_REQUESTED: BookingRequestedPayload;
  STAFF_DUTY_ASSIGNED: StaffDutyAssignedPayload;
  HEALTH_GUIDANCE_ISSUED: HealthGuidanceIssuedPayload;
  RESOURCE_WINDOW_DECLARED: ResourceWindowDeclaredPayload;
  RESOURCE_BLOCKED: ResourceBlockedPayload;
  RESERVATION_REJECTED: ReservationRejectedPayload;
  RESOURCE_RESERVED: ResourceReservedPayload;
  CONSENT_RECORDED: ConsentRecordedPayload;
  SUBSTITUTION_PROPOSED: SubstitutionProposedPayload;
  SUBSTITUTION_ACCEPTED: SubstitutionAcceptedPayload;
  SUBSTITUTION_REJECTED: SubstitutionRejectedPayload;
  ACTIVITY_RECORDED: ActivityRecordedPayload;
  OFFLINE_BATCH_SYNCHRONIZED: OfflineBatchSynchronizedPayload;
  ACTIVITY_VERIFIED: ActivityVerifiedPayload;
  LABOR_RECORDED: LaborRecordedPayload;
  LABOR_SETTLED: LaborSettledPayload;
  BOOKING_CANCELLED: BookingCancelledPayload;
  FEE_SETTLED: FeeSettledPayload;
}

// ---------- 读模型（供三类终端使用） ----------

/** 教师视角：每组对照学段目标的完成与缺失实践。 */
export interface GroupActivityReport {
  group_id: string;
  group_name: string;
  completed: { activity_code: string; title: string; objective_codes: string[]; evidence_ids: string[] }[];
  missing: { activity_code: string; title: string; objective_codes: string[]; required: boolean }[];
  disputed: { activity_code: string; evidence_id: string; note?: string }[];
}

/** 农户视角：自己的工时与款项。 */
export interface WorkerLedgerEntry {
  worker_id: string;
  worker_name?: string;
  contractor_id: string;
  total_minutes: number;
  total_amount: number;
  settled: boolean;
  lines: { labor_record_id: string; activity_code: string; work_minutes: number; amount: number }[];
}

/** 园区视角：承载瓶颈与就业收益（聚合数据，不含学生个体表现）。 */
export interface CapacityAnalysis {
  resources: {
    resource_id: string;
    kind: ResourceKind;
    capacity_per_slot: number;
    used: number;
    utilization: number;
    /** 已核验完成、实际在该资源活动的小组数（含替代场地）。 */
    delivered_groups: number;
    /** 作为学校已确认替代目标接待的次数。 */
    substitutions_in: number;
    rejections: number;
    blockages: BlockageReason[];
  }[];
  employment: { contractor_id: string; worker_count: number; total_minutes: number; total_amount: number }[];
}
