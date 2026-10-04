/**
 * 高原研学资源兑现：事件信封校验 + 事件流不变量校验 + 读模型投影。
 *
 * 三类硬边界：
 * 1. 预约必须在同一事务内通过作物、人员、空间、安全四维校验；
 * 2. 替代方案必须带逐目标等值说明，并由学校授权人确认；
 * 3. 费用只为真实提供的资源结算：每行兑现项必须能追溯到已核验的环节证据或学校已确认的替代。
 */

const envelopeRequired = [
  "event_id",
  "event_type",
  "aggregate_type",
  "aggregate_id",
  "occurred_at",
  "version",
  "summary",
];

export const EVENT_TYPES = [
  "PROGRAM_PUBLISHED",
  "PROGRAM_BOOKED",
  "INSTRUCTOR_QUALIFIED",
  "BOOKING_REQUESTED",
  "STAFF_DUTY_ASSIGNED",
  "HEALTH_GUIDANCE_ISSUED",
  "RESOURCE_WINDOW_DECLARED",
  "RESOURCE_BLOCKED",
  "RESERVATION_REJECTED",
  "RESOURCE_RESERVED",
  "CONSENT_RECORDED",
  "SUBSTITUTION_PROPOSED",
  "SUBSTITUTION_ACCEPTED",
  "SUBSTITUTION_REJECTED",
  "ACTIVITY_RECORDED",
  "OFFLINE_BATCH_SYNCHRONIZED",
  "ACTIVITY_VERIFIED",
  "LABOR_RECORDED",
  "LABOR_SETTLED",
  "BOOKING_CANCELLED",
  "FEE_SETTLED",
];

export const AGGREGATE_TYPES = [
  "curriculum_revision",
  "personnel_profile",
  "study_booking",
  "resource_window",
  "resource_reservation",
  "privacy_consent",
  "substitution",
  "activity_evidence",
  "labor_settlement",
  "fee_settlement",
];

/** 事件类型允许归属的聚合。 */
const EVENT_AGGREGATE = {
  PROGRAM_PUBLISHED: ["curriculum_revision"],
  PROGRAM_BOOKED: ["curriculum_revision"],
  INSTRUCTOR_QUALIFIED: ["personnel_profile"],
  BOOKING_REQUESTED: ["study_booking"],
  STAFF_DUTY_ASSIGNED: ["study_booking"],
  HEALTH_GUIDANCE_ISSUED: ["study_booking"],
  BOOKING_CANCELLED: ["study_booking"],
  RESOURCE_WINDOW_DECLARED: ["resource_window"],
  RESOURCE_BLOCKED: ["resource_window"],
  RESOURCE_RESERVED: ["resource_reservation"],
  RESERVATION_REJECTED: ["resource_reservation"],
  CONSENT_RECORDED: ["privacy_consent"],
  SUBSTITUTION_PROPOSED: ["substitution"],
  SUBSTITUTION_ACCEPTED: ["substitution"],
  SUBSTITUTION_REJECTED: ["substitution"],
  ACTIVITY_RECORDED: ["activity_evidence"],
  OFFLINE_BATCH_SYNCHRONIZED: ["activity_evidence"],
  ACTIVITY_VERIFIED: ["activity_evidence"],
  LABOR_RECORDED: ["labor_settlement"],
  LABOR_SETTLED: ["labor_settlement"],
  FEE_SETTLED: ["fee_settlement"],
};

const RESOURCE_KINDS = ["crop_field", "greenhouse", "vehicle", "instructor"];
const DIMENSIONS = ["crop", "personnel", "space", "safety"];
const ACTIVITY_TYPES = ["seed_observation", "soilless_culture", "picking", "workshop", "field_tour"];
const EVIDENCE_TYPES = ["observation_sheet", "photo", "group_signature", "harvest_record", "sensor_reading"];

/** 各事件载荷的必填字段。 */
const PAYLOAD_REQUIRED = {
  PROGRAM_PUBLISHED: ["curriculum_id", "revision", "stage_targets", "activities"],
  INSTRUCTOR_QUALIFIED: ["staff_id", "qualification_codes", "valid_from", "valid_until", "activity_types"],
  BOOKING_REQUESTED: [
    "booking_id",
    "school_id",
    "curriculum_id",
    "revision",
    "scheduled_date",
    "groups",
    "participant_counts",
    "authorized_confirmer_ids",
  ],
  STAFF_DUTY_ASSIGNED: ["booking_id", "assignments"],
  HEALTH_GUIDANCE_ISSUED: ["booking_id", "tips", "acknowledged_by_school"],
  RESOURCE_WINDOW_DECLARED: ["resource_id", "kind", "capacity_per_slot", "slot_start", "slot_end", "accessible"],
  RESOURCE_BLOCKED: ["resource_id", "reason", "starts_at"],
  RESERVATION_REJECTED: ["reservation_id", "booking_id", "failed_dimensions"],
  RESOURCE_RESERVED: ["reservation_id", "booking_id", "slot_start", "slot_end", "checks", "allocations"],
  CONSENT_RECORDED: ["consent_id", "booking_id", "scope", "granted", "purposes", "granted_by", "granted_at"],
  SUBSTITUTION_PROPOSED: [
    "substitution_id",
    "booking_id",
    "replaces",
    "replacement",
    "objective_codes",
    "equivalence_note",
  ],
  SUBSTITUTION_ACCEPTED: ["substitution_id", "booking_id", "confirmed_by", "confirmed_at"],
  SUBSTITUTION_REJECTED: ["substitution_id", "booking_id", "rejected_by", "reason", "rejected_at"],
  ACTIVITY_RECORDED: [
    "evidence_id",
    "booking_id",
    "group_id",
    "activity_code",
    "resource_id",
    "started_at",
    "ended_at",
    "evidence_types",
    "recorded_offline",
  ],
  OFFLINE_BATCH_SYNCHRONIZED: ["batch_id", "booking_id", "synced_at", "items"],
  ACTIVITY_VERIFIED: ["evidence_id", "booking_id", "group_id", "activity_code", "status", "verified_by"],
  LABOR_RECORDED: [
    "labor_record_id",
    "booking_id",
    "worker_id",
    "contractor_id",
    "activity_code",
    "work_minutes",
    "rate_per_hour",
    "recorded_offline",
  ],
  LABOR_SETTLED: ["settlement_id", "worker_id", "contractor_id", "booking_id", "lines", "total_minutes", "total_amount", "settled_at"],
  BOOKING_CANCELLED: ["booking_id", "reason", "cancelled_at"],
  FEE_SETTLED: [
    "settlement_id",
    "booking_id",
    "charged_amount",
    "delivered",
    "canceled",
    "payable_amount",
    "refund_amount",
    "accounting_ref",
    "settled_at",
  ],
};

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const round2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

/** 信封级校验（保留原有函数签名）。 */
export function validateEvent(record) {
  const errors = envelopeRequired
    .filter((name) => !(name in record))
    .map((name) => `缺少字段：${name}`);
  if ("version" in record && (!Number.isInteger(record.version) || record.version < 1)) {
    errors.push("version 必须是正整数");
  }
  if ("event_type" in record && !EVENT_TYPES.includes(record.event_type)) {
    errors.push(`未知事件类型：${record.event_type}`);
  }
  if ("aggregate_type" in record && !AGGREGATE_TYPES.includes(record.aggregate_type)) {
    errors.push(`未知聚合类型：${record.aggregate_type}`);
  }
  if (
    "event_type" in record &&
    "aggregate_type" in record &&
    EVENT_AGGREGATE[record.event_type] &&
    !EVENT_AGGREGATE[record.event_type].includes(record.aggregate_type)
  ) {
    errors.push(`事件 ${record.event_type} 不能归属聚合 ${record.aggregate_type}`);
  }
  if ("payload" in record) errors.push(...validatePayloadShape(record.event_type, record.payload));
  return errors;
}

/** 单事件载荷的结构校验（跨事件不变量在 validateStream 中检查）。 */
export function validatePayloadShape(eventType, p) {
  const errors = [];
  if (p === null || typeof p !== "object" || Array.isArray(p)) return ["payload 必须是对象"];
  const required = PAYLOAD_REQUIRED[eventType];
  if (!required) return errors; // 例如遗留的 PROGRAM_BOOKED：仅信封
  for (const key of required) if (!(key in p)) errors.push(`${eventType}.payload 缺少字段：${key}`);

  const check = (cond, msg) => !cond && errors.push(msg);
  switch (eventType) {
    case "PROGRAM_PUBLISHED":
      check(Number.isInteger(p.revision) && p.revision >= 1, "revision 必须是正整数");
      check(Array.isArray(p.stage_targets) && p.stage_targets.length > 0, "stage_targets 不能为空");
      check(Array.isArray(p.activities) && p.activities.length > 0, "activities 不能为空");
      p.activities?.forEach?.((a, i) => {
        if (!ACTIVITY_TYPES.includes(a.activity_type)) errors.push(`activities[${i}].activity_type 非法`);
        if (!Array.isArray(a.needs) || a.needs.length === 0) errors.push(`activities[${i}].needs 至少一项资源`);
        if (!a.needs?.every?.((k) => RESOURCE_KINDS.includes(k))) errors.push(`activities[${i}].needs 含非法资源类型`);
      });
      break;
    case "INSTRUCTOR_QUALIFIED":
      check(Array.isArray(p.qualification_codes) && p.qualification_codes.length > 0, "qualification_codes 不能为空");
      check(p.activity_types?.every?.((t) => ACTIVITY_TYPES.includes(t)), "activity_types 含非法值");
      break;
    case "BOOKING_REQUESTED":
      check(Array.isArray(p.groups) && p.groups.length > 0, "groups 不能为空");
      check(
        p.authorized_confirmer_ids?.length > 0,
        "authorized_confirmer_ids 至少一名学校授权确认人"
      );
      check(isNum(p.participant_counts?.students) && p.participant_counts.students >= 1, "学生人数必须为正整数");
      break;
    case "RESOURCE_WINDOW_DECLARED":
      check(RESOURCE_KINDS.includes(p.kind), "kind 非法");
      check(Number.isInteger(p.capacity_per_slot) && p.capacity_per_slot >= 0, "capacity_per_slot 必须是非负整数");
      check(typeof p.accessible === "boolean", "accessible 必须是布尔值");
      break;
    case "RESERVATION_REJECTED":
      check(Array.isArray(p.failed_dimensions) && p.failed_dimensions.length > 0, "failed_dimensions 至少一维");
      check(p.failed_dimensions?.every?.((d) => DIMENSIONS.includes(d)), "failed_dimensions 含非法维度");
      break;
    case "RESOURCE_RESERVED": {
      check(DIMENSIONS.every((d) => p.checks?.[d] === "passed"), "作物、人员、空间、安全四维必须全部 passed");
      check(Array.isArray(p.allocations) && p.allocations.length > 0, "allocations 不能为空");
      p.allocations?.forEach?.((a, i) => {
        if (!RESOURCE_KINDS.includes(a.resource_kind)) errors.push(`allocations[${i}].resource_kind 非法`);
        if (!(a.capacity_used >= 1)) errors.push(`allocations[${i}].capacity_used 必须为正`);
        if (!(a.capacity_limit >= a.capacity_used)) errors.push(`allocations[${i}] 占用超过容量上限`);
      });
      break;
    }
    case "CONSENT_RECORDED":
      check(["media_usage", "child_data_on_duty"].includes(p.scope), "scope 非法");
      check(Array.isArray(p.purposes) && p.purposes.length > 0, "purposes 不能为空（影像须按用途另行同意）");
      check(["guardian", "school"].includes(p.granted_by), "granted_by 非法");
      break;
    case "SUBSTITUTION_PROPOSED":
      check(RESOURCE_KINDS.includes(p.replaces?.resource_kind), "replaces.resource_kind 非法");
      check(RESOURCE_KINDS.includes(p.replacement?.resource_kind), "replacement.resource_kind 非法");
      check(Array.isArray(p.objective_codes) && p.objective_codes.length > 0, "替代方案必须逐目标给出等值说明");
      check(typeof p.equivalence_note === "string" && p.equivalence_note.length > 0, "equivalence_note 不能为空");
      break;
    case "ACTIVITY_RECORDED":
      check(Array.isArray(p.evidence_types) && p.evidence_types.length > 0, "每个环节必须保留自己的证据");
      check(p.evidence_types?.every?.((t) => EVIDENCE_TYPES.includes(t)), "evidence_types 含非法值");
      check(new Date(p.ended_at) > new Date(p.started_at), "ended_at 必须晚于 started_at");
      check(typeof p.recorded_offline === "boolean", "recorded_offline 必须是布尔值");
      if (p.recorded_offline) check(!!p.client_record_id, "离线记录必须带 client_record_id 幂等键");
      break;
    case "OFFLINE_BATCH_SYNCHRONIZED":
      check(Array.isArray(p.items) && p.items.length > 0, "items 不能为空");
      p.items?.forEach?.((it, i) => {
        if (!["activity", "labor"].includes(it.record_type)) errors.push(`items[${i}].record_type 非法`);
        if (!["accepted", "duplicate"].includes(it.result)) errors.push(`items[${i}].result 非法`);
      });
      break;
    case "ACTIVITY_VERIFIED":
      check(["verified", "disputed"].includes(p.status), "status 非法");
      break;
    case "LABOR_RECORDED":
      check(Number.isInteger(p.work_minutes) && p.work_minutes > 0, "work_minutes 必须是正整数");
      check(isNum(p.rate_per_hour) && p.rate_per_hour >= 0, "rate_per_hour 必须是非负数");
      if (p.recorded_offline) check(!!p.client_record_id, "离线劳务必须带 client_record_id 幂等键");
      break;
    case "LABOR_SETTLED":
      check(Array.isArray(p.lines), "lines 必须是数组");
      check(isNum(p.total_minutes) && isNum(p.total_amount), "合计字段必须是数字");
      break;
    case "FEE_SETTLED":
      check(isNum(p.charged_amount) && p.charged_amount >= 0, "charged_amount 必须是非负数");
      check(Array.isArray(p.delivered) && Array.isArray(p.canceled), "delivered/canceled 必须是数组");
      break;
    default:
      break;
  }
  return errors;
}

// ---------------- 事件流投影 ----------------

/**
 * 把事件流归约为履约状态。离线记录按 client_record_id 去重，
 * 重复回传不会重复计算课时或工资。
 */
export function buildProjection(events) {
  const state = {
    programs: new Map(), // curriculum_id#revision -> 最新 PROGRAM_PUBLISHED 载荷
    instructors: new Map(), // staff_id -> [资质]
    bookings: new Map(), // booking_id -> { 请求、健康确认、当班、取消 }
    windows: new Map(), // resource_id -> 最新窗口
    blockages: [], // {resource_id, reason, starts_at, ends_at}
    reservations: [], // 预约载荷
    rejections: [],
    consents: [],
    substitutions: new Map(), // substitution_id -> {proposal, accepted, rejected}
    activities: new Map(), // evidence_id -> 记录载荷（去重后）
    verifications: new Map(), // evidence_id -> 核验载荷
    labor: new Map(), // labor_record_id -> 记录（去重后）
    laborSettlements: [],
    feeSettlements: [],
    batches: [],
    seenClientRecords: new Set(),
    duplicateClientRecords: [],
  };

  for (const e of events) {
    const p = e.payload;
    if (!p) continue;
    switch (e.event_type) {
      case "PROGRAM_PUBLISHED":
        state.programs.set(`${p.curriculum_id}#${p.revision}`, p);
        break;
      case "INSTRUCTOR_QUALIFIED":
        if (!state.instructors.has(p.staff_id)) state.instructors.set(p.staff_id, []);
        state.instructors.get(p.staff_id).push(p);
        break;
      case "BOOKING_REQUESTED": {
        state.bookings.set(p.booking_id, {
          request: p,
          healthAcknowledged: false,
          duty: [],
          cancelledAt: null,
        });
        break;
      }
      case "STAFF_DUTY_ASSIGNED":
        if (state.bookings.has(p.booking_id)) state.bookings.get(p.booking_id).duty.push(...p.assignments);
        break;
      case "HEALTH_GUIDANCE_ISSUED":
        if (state.bookings.has(p.booking_id) && p.acknowledged_by_school) {
          state.bookings.get(p.booking_id).healthAcknowledged = true;
        }
        break;
      case "BOOKING_CANCELLED":
        if (state.bookings.has(p.booking_id)) state.bookings.get(p.booking_id).cancelledAt = p.cancelled_at;
        break;
      case "RESOURCE_WINDOW_DECLARED":
        state.windows.set(p.resource_id, p);
        break;
      case "RESOURCE_BLOCKED":
        state.blockages.push(p);
        if (state.windows.has(p.resource_id)) state.windows.get(p.resource_id).accessible = false;
        break;
      case "RESOURCE_RESERVED":
        state.reservations.push(p);
        break;
      case "RESERVATION_REJECTED":
        state.rejections.push(p);
        break;
      case "CONSENT_RECORDED":
        state.consents.push(p);
        break;
      case "SUBSTITUTION_PROPOSED":
        state.substitutions.set(p.substitution_id, { proposal: p, accepted: null, rejected: null });
        break;
      case "SUBSTITUTION_ACCEPTED": {
        const s = state.substitutions.get(p.substitution_id);
        if (s) s.accepted = p;
        break;
      }
      case "SUBSTITUTION_REJECTED": {
        const s = state.substitutions.get(p.substitution_id);
        if (s) s.rejected = p;
        break;
      }
      case "ACTIVITY_RECORDED": {
        const key = p.recorded_offline && p.client_record_id ? `activity:${p.client_record_id}` : null;
        if (key && state.seenClientRecords.has(key)) {
          state.duplicateClientRecords.push(key);
          break; // 重复回传：不重复计课时
        }
        if (key) state.seenClientRecords.add(key);
        state.activities.set(p.evidence_id, p);
        break;
      }
      case "OFFLINE_BATCH_SYNCHRONIZED":
        state.batches.push(p);
        break;
      case "ACTIVITY_VERIFIED":
        state.verifications.set(p.evidence_id, p);
        break;
      case "LABOR_RECORDED": {
        const key = p.recorded_offline && p.client_record_id ? `labor:${p.client_record_id}` : null;
        if (key && state.seenClientRecords.has(key)) {
          state.duplicateClientRecords.push(key);
          break; // 重复回传：不重复计工资
        }
        if (key) state.seenClientRecords.add(key);
        state.labor.set(p.labor_record_id, p);
        break;
      }
      case "LABOR_SETTLED":
        state.laborSettlements.push(p);
        break;
      case "FEE_SETTLED":
        state.feeSettlements.push(p);
        break;
      default:
        break;
    }
  }
  return state;
}

const overlaps = (aStart, aEnd, bStart, bEnd) => new Date(aStart) < new Date(bEnd) && new Date(bStart) < new Date(aEnd);

function blockageOverlaps(state, resourceId, slotStart, slotEnd) {
  return state.blockages.find(
    (b) =>
      b.resource_id === resourceId &&
      new Date(b.starts_at) < new Date(slotEnd) &&
      (!b.ends_at || new Date(b.ends_at) > new Date(slotStart))
  );
}

function instructorValid(state, staffId, at, activityType) {
  const quals = state.instructors.get(staffId) || [];
  return quals.some(
    (q) =>
      new Date(q.valid_from) <= new Date(at) &&
      new Date(at) < new Date(q.valid_until) &&
      q.activity_types.includes(activityType)
  );
}

/** 事件流级不变量校验。返回 { errors, warnings, state }。 */
export function validateStream(events) {
  const errors = [];
  const warnings = [];

  // 1. 逐条信封与载荷
  events.forEach((e, i) => {
    for (const msg of validateEvent(e)) errors.push(`事件#${i}（${e.event_id ?? "无id"}）：${msg}`);
  });

  // 2. event_id 唯一
  const ids = new Set();
  for (const e of events) {
    if (ids.has(e.event_id)) errors.push(`event_id 重复：${e.event_id}`);
    ids.add(e.event_id);
  }

  // 3. 同一聚合版本号：从 1 开始、单调递增、不复用
  const byAggregate = new Map();
  for (const e of events) {
    const key = `${e.aggregate_type}/${e.aggregate_id}`;
    if (!byAggregate.has(key)) byAggregate.set(key, []);
    byAggregate.get(key).push(e);
  }
  for (const [key, list] of byAggregate) {
    const sorted = [...list].sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at));
    const versions = sorted.map((e) => e.version);
    if (versions[0] !== 1) errors.push(`聚合 ${key} 版本必须从 1 开始`);
    if (new Set(versions).size !== versions.length) errors.push(`聚合 ${key} 版本号重复`);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].version <= sorted[i - 1].version) {
        errors.push(`聚合 ${key} 版本必须随 occurred_at 单调递增`);
        break;
      }
    }
  }

  const state = buildProjection(events);
  const programOf = (booking) => state.programs.get(`${booking.curriculum_id}#${booking.revision}`);

  // 已被学校接受的替代方案：被替代资源在原预约中的禁入/阻断不再判错，
  // 费用也只能沿替代后的证据兑现。
  const acceptedSubKeys = new Set(
    [...state.substitutions.values()]
      .filter((s) => s.accepted)
      .map((s) => `${s.proposal.booking_id}|${s.proposal.replaces.resource_id ?? ""}|${s.proposal.replaces.activity_code}`)
  );
  const substituted = (bookingId, resourceId, activityCode) =>
    acceptedSubKeys.has(`${bookingId}|${resourceId}|${activityCode}`);

  // 4. 预约四维同事务校验的语义完整性
  for (const r of state.reservations) {
    const booking = state.bookings.get(r.booking_id);
    if (!booking) {
      errors.push(`预约 ${r.reservation_id} 引用了不存在的团队预约 ${r.booking_id}`);
      continue;
    }
    if (!booking.healthAcknowledged) {
      errors.push(`预约 ${r.reservation_id}：健康与监护提示未经学校知悉确认，不得锁定资源`);
    }
    if (booking.cancelledAt) {
      errors.push(`预约 ${r.reservation_id}：团队预约已取消，不能再锁定资源`);
    }
    const program = programOf(booking.request);
    const at = r.slot_start;
    const participants =
      booking.request.participant_counts.students +
      booking.request.participant_counts.teachers +
      booking.request.participant_counts.chaperones;
    let vehicleSeats = 0;

    for (const a of r.allocations) {
      const win = state.windows.get(a.resource_id);
      if (!win) {
        errors.push(`预约 ${r.reservation_id}：资源 ${a.resource_id} 未申报生长/开放窗口`);
        continue;
      }
      const isReplaced = substituted(r.booking_id, a.resource_id, a.activity_code);
      // 空间维度：时间必须落在窗口内（替代只换资源，不改时段约束）
      if (!overlaps(r.slot_start, r.slot_end, win.slot_start, win.slot_end)) {
        errors.push(`预约 ${r.reservation_id}：资源 ${a.resource_id} 时段不在开放窗口内`);
      }
      // 作物维度：禁入阶段 / 道路或农事阻断 / 采摘必须果实成熟
      // 已由学校确认等值替代的资源不再视为违约。
      if (!win.accessible && !isReplaced) {
        errors.push(`预约 ${r.reservation_id}：资源 ${a.resource_id} 处于禁入或关闭状态（作物/空间校验失败）`);
      }
      const block = blockageOverlaps(state, a.resource_id, r.slot_start, r.slot_end);
      if (block && !isReplaced) {
        errors.push(`预约 ${r.reservation_id}：资源 ${a.resource_id} 在该时段被阻断（${block.reason}），必须先走替代方案`);
      }
      const spec = program?.activities.find((x) => x.activity_code === a.activity_code);
      if (!isReplaced && a.resource_kind === "crop_field" && spec?.activity_type === "picking") {
        const day = new Date(at).toISOString().slice(0, 10);
        const ripe =
          win.crop_stage === "ripe" &&
          (!win.growth_window_start || day >= win.growth_window_start) &&
          (!win.growth_window_end || day <= win.growth_window_end);
        if (!ripe) errors.push(`预约 ${r.reservation_id}：采摘田块 ${a.resource_id} 果实尚未进入成熟窗口`);
      }
      // 人员维度：讲解员资质有效且覆盖该环节类型
      if (a.resource_kind === "instructor") {
        if (!instructorValid(state, a.resource_id, at, spec?.activity_type)) {
          errors.push(`预约 ${r.reservation_id}：讲解员 ${a.resource_id} 资质无效或不覆盖该环节`);
        }
      }
      if (a.resource_kind === "vehicle") vehicleSeats += a.capacity_used;
    }
    // 安全容量：车辆座位必须能载下全体师生
    if (vehicleSeats > 0 && vehicleSeats < participants) {
      errors.push(`预约 ${r.reservation_id}：车辆座位 ${vehicleSeats} 少于全员 ${participants} 人，安全容量不通过`);
    }
  }

  // 5. 跨团队容量冲突：同一资源（含讲解员）时段重叠不得超容量
  const allocations = state.reservations.flatMap((r) =>
    r.allocations.map((a) => ({ ...a, slot_start: r.slot_start, slot_end: r.slot_end, reservation: r.reservation_id }))
  );
  for (let i = 0; i < allocations.length; i++) {
    for (let j = i + 1; j < allocations.length; j++) {
      const x = allocations[i];
      const y = allocations[j];
      if (x.resource_id !== y.resource_id) continue;
      if (!overlaps(x.slot_start, x.slot_end, y.slot_start, y.slot_end)) continue;
      const win = state.windows.get(x.resource_id);
      const cap = win?.capacity_per_slot ?? Math.min(x.capacity_limit, y.capacity_limit);
      if (x.capacity_used + y.capacity_used > cap) {
        errors.push(
          `容量冲突：资源 ${x.resource_id} 在重叠时段被 ${x.reservation} 与 ${y.reservation} 合计占用 ${x.capacity_used + y.capacity_used}，上限 ${cap}`
        );
      }
    }
  }

  // 6. 替代方案：先提议、带等值说明，且只能由学校授权人确认一次
  for (const [id, s] of state.substitutions) {
    const booking = state.bookings.get(s.proposal.booking_id);
    if (!booking) {
      errors.push(`替代方案 ${id} 引用不存在的预约 ${s.proposal.booking_id}`);
      continue;
    }
    const program = programOf(booking.request);
    const known = new Set(program?.stage_targets.map((t) => t.objective_code) ?? []);
    for (const code of s.proposal.objective_codes) {
      if (program && !known.has(code)) errors.push(`替代方案 ${id} 的等值目标 ${code} 不在课程版本中`);
    }
    // 替代资源本身必须真实可接待，否则替代无法兑现
    const replacement = state.windows.get(s.proposal.replacement.resource_id);
    if (!replacement) {
      errors.push(`替代方案 ${id} 的替代资源 ${s.proposal.replacement.resource_id} 未申报窗口`);
    } else {
      const req = booking.request;
      const day = `${req.scheduled_date}T23:59:59+08:00`;
      const dayStart = `${req.scheduled_date}T00:00:00+08:00`;
      if (!replacement.accessible) errors.push(`替代方案 ${id} 的替代资源 ${replacement.resource_id} 处于禁入/关闭状态`);
      if (!overlaps(dayStart, day, replacement.slot_start, replacement.slot_end)) {
        errors.push(`替代方案 ${id} 的替代资源 ${replacement.resource_id} 在团队日期不开放`);
      }
      if (blockageOverlaps(state, replacement.resource_id, dayStart, day)) {
        warnings.push(`替代方案 ${id} 的替代资源 ${replacement.resource_id} 当日存在阻断记录，需现场确认`);
      }
    }
    if (s.accepted) {
      if (!booking.request.authorized_confirmer_ids.includes(s.accepted.confirmed_by)) {
        errors.push(`替代方案 ${id} 必须由学校授权确认人接受，${s.accepted.confirmed_by} 不在授权名单`);
      }
    }
    if (s.accepted && s.rejected) errors.push(`替代方案 ${id} 不能同时被接受和拒绝`);
    // 被替代资源在替代生效后仍被直接核销，交给费用校验处理
  }

  // 7. 环节证据：引用完整、不能用一次签到覆盖全部环节、取消后不得补记录
  for (const [evidenceId, a] of state.activities) {
    const booking = state.bookings.get(a.booking_id);
    if (!booking) {
      errors.push(`环节证据 ${evidenceId} 引用不存在的预约 ${a.booking_id}`);
      continue;
    }
    if (booking.cancelledAt && new Date(a.started_at) >= new Date(booking.cancelledAt)) {
      errors.push(`环节证据 ${evidenceId}：课程取消后不得再记录实践环节`);
    }
    const program = programOf(booking.request);
    const spec = program?.activities.find((x) => x.activity_code === a.activity_code);
    if (program && !spec) errors.push(`环节证据 ${evidenceId} 的 ${a.activity_code} 不在所订课程版本中`);
    if (!booking.request.groups.some((g) => g.group_id === a.group_id)) {
      errors.push(`环节证据 ${evidenceId} 引用了不存在的小组 ${a.group_id}`);
    }
    // 影像证据必须另有影像用途同意；营销用途不得从活动记录推定
    if (a.evidence_types.includes("photo")) {
      const consent = state.consents.find(
        (c) =>
          c.booking_id === a.booking_id &&
          c.scope === "media_usage" &&
          c.granted &&
          c.purposes.includes("activity_evidence")
      );
      if (!consent) errors.push(`环节证据 ${evidenceId} 含影像，但未取得影像用途同意（media_usage/activity_evidence）`);
    }
  }
  for (const [evidenceId, v] of state.verifications) {
    if (!state.activities.has(evidenceId)) {
      errors.push(`核验 ${evidenceId} 没有对应的环节记录，不能凭空核验`);
      continue;
    }
    const a = state.activities.get(evidenceId);
    if (v.booking_id !== a.booking_id || v.group_id !== a.group_id || v.activity_code !== a.activity_code) {
      errors.push(`核验 ${evidenceId} 与环节记录的预约/小组/活动不一致`);
    }
  }

  // 8. 离线批次引用的幂等键必须真实存在
  const knownClientIds = state.seenClientRecords;
  for (const b of state.batches) {
    for (const it of b.items) {
      if (!knownClientIds.has(`${it.record_type}:${it.client_record_id}`)) {
        errors.push(`离线批次 ${b.batch_id} 引用了不存在的 ${it.record_type} 记录 ${it.client_record_id}`);
      }
    }
  }
  if (state.duplicateClientRecords.length > 0) {
    warnings.push(`检测到 ${state.duplicateClientRecords.length} 条重复离线回传，已按 client_record_id 去重，不重复计课时或工资`);
  }

  // 9. 劳务结算：只认真实记录（去重后），金额与工时一致
  const settledLaborIds = new Set();
  for (const s of state.laborSettlements) {
    let sumMinutes = 0;
    let sumAmount = 0;
    for (const line of s.lines) {
      if (settledLaborIds.has(line.labor_record_id)) {
        errors.push(`劳务结算 ${s.settlement_id}：工时记录 ${line.labor_record_id} 已被重复结算`);
      }
      settledLaborIds.add(line.labor_record_id);
      const rec = state.labor.get(line.labor_record_id);
      if (!rec) {
        errors.push(`劳务结算 ${s.settlement_id}：引用不存在或已去重的工时记录 ${line.labor_record_id}`);
        continue;
      }
      if (rec.worker_id !== s.worker_id) errors.push(`劳务结算 ${s.settlement_id}：工时记录 ${line.labor_record_id} 工人不一致`);
      if (line.work_minutes !== rec.work_minutes) errors.push(`劳务结算 ${s.settlement_id}：${line.labor_record_id} 工时与记录不符`);
      const expect = round2((rec.work_minutes / 60) * rec.rate_per_hour);
      if (round2(line.amount) !== expect) {
        errors.push(`劳务结算 ${s.settlement_id}：${line.labor_record_id} 金额应为 ${expect}（工时×单价）`);
      }
      sumMinutes += line.work_minutes;
      sumAmount += line.amount;
    }
    if (sumMinutes !== s.total_minutes) errors.push(`劳务结算 ${s.settlement_id}：total_minutes 与明细不符`);
    if (round2(sumAmount) !== round2(s.total_amount)) errors.push(`劳务结算 ${s.settlement_id}：total_amount 与明细不符`);
  }

  // 10. 费用结算：只结算真实提供的资源
  const verifiedEvidence = new Set(
    [...state.verifications.values()].filter((v) => v.status === "verified").map((v) => v.evidence_id)
  );
  const acceptedSubstitutions = new Set(
    [...state.substitutions.values()].filter((s) => s.accepted).map((s) => s.proposal.substitution_id)
  );
  const feeSettlementBooking = new Set();
  for (const f of state.feeSettlements) {
    if (feeSettlementBooking.has(f.booking_id)) errors.push(`费用结算：预约 ${f.booking_id} 被重复结算`);
    feeSettlementBooking.add(f.booking_id);
    if (!state.bookings.has(f.booking_id)) errors.push(`费用结算 ${f.settlement_id} 引用不存在的预约 ${f.booking_id}`);

    const deliveredSum = round2(f.delivered.reduce((n, l) => n + l.amount, 0));
    const canceledSum = round2(f.canceled.reduce((n, l) => n + l.amount, 0));
    if (round2(deliveredSum + canceledSum) !== round2(f.charged_amount)) {
      errors.push(`费用结算 ${f.settlement_id}：已兑现 ${deliveredSum} + 未兑现 ${canceledSum} 不等于已收费 ${f.charged_amount}`);
    }
    if (round2(f.payable_amount) !== deliveredSum) errors.push(`费用结算 ${f.settlement_id}：应付额必须等于已兑现明细合计`);
    if (round2(f.refund_amount) !== canceledSum) errors.push(`费用结算 ${f.settlement_id}：退款额必须等于未兑现明细合计`);

    for (const line of f.delivered) {
      const basis = line.basis ?? {};
      const evidenceOk = basis.evidence_id && verifiedEvidence.has(basis.evidence_id);
      const substitutionOk =
        basis.substitution_id && acceptedSubstitutions.has(basis.substitution_id);
      if (!evidenceOk && !substitutionOk) {
        errors.push(
          `费用结算 ${f.settlement_id}：收费项 ${line.item_code} 没有已核验证据或学校已确认的替代，不能结算`
        );
        continue;
      }
      if (basis.evidence_id) {
        const a = state.activities.get(basis.evidence_id);
        if (a && a.booking_id !== f.booking_id) errors.push(`费用结算 ${f.settlement_id}：证据 ${basis.evidence_id} 不属于本预约`);
        if (a && line.activity_code && a.activity_code !== line.activity_code) {
          errors.push(`费用结算 ${f.settlement_id}：收费项 ${line.item_code} 的活动与证据环节不一致`);
        }
        if (a && line.group_id && a.group_id !== line.group_id) {
          errors.push(`费用结算 ${f.settlement_id}：收费项 ${line.item_code} 的小组与证据小组不一致，不得跨组兑现`);
        }
      }
    }
    // 已核验完成的环节不得列为未兑现
    for (const line of f.canceled) {
      const hasVerified = [...verifiedEvidence].some((id) => {
        const a = state.activities.get(id);
        return (
          a &&
          a.booking_id === f.booking_id &&
          (!line.activity_code || a.activity_code === line.activity_code) &&
          (!line.group_id || a.group_id === line.group_id)
        );
      });
      if (hasVerified) errors.push(`费用结算 ${f.settlement_id}：${line.item_code} 已有核验完成的证据，不得列为未兑现退款项`);
    }
  }

  return { errors, warnings, state };
}

// ---------------- 读模型 ----------------

/** 教师视角：每组对照学段目标，看完成、争议与缺失的实践。 */
export function groupActivityReport(state, bookingId) {
  const booking = state.bookings.get(bookingId);
  if (!booking) throw new Error(`未知预约：${bookingId}`);
  const program = state.programs.get(`${booking.request.curriculum_id}#${booking.request.revision}`);
  const specs = new Map((program?.activities ?? []).map((a) => [a.activity_code, a]));

  return booking.request.groups.map((g) => {
    const completed = [];
    const disputed = [];
    for (const [evidenceId, a] of state.activities) {
      if (a.booking_id !== bookingId || a.group_id !== g.group_id) continue;
      const v = state.verifications.get(evidenceId);
      if (v?.status === "verified") {
        const spec = specs.get(a.activity_code);
        completed.push({
          activity_code: a.activity_code,
          title: spec?.title ?? a.activity_code,
          objective_codes: spec?.objective_codes ?? [],
          evidence_ids: [evidenceId],
        });
      } else if (v?.status === "disputed") {
        disputed.push({ activity_code: a.activity_code, evidence_id: evidenceId, note: v.note });
      }
    }
    const doneCodes = new Set(completed.map((c) => c.activity_code));
    const missing = [...specs.values()]
      .filter((spec) => spec.required && !doneCodes.has(spec.activity_code))
      .map((spec) => ({
        activity_code: spec.activity_code,
        title: spec.title,
        objective_codes: spec.objective_codes,
        required: spec.required,
      }));
    return { group_id: g.group_id, group_name: g.name, completed, missing, disputed };
  });
}

/** 农户视角：核对自己的工时与款项（跨承包方表格归一）。 */
export function workerLedger(state, workerId) {
  const lines = [];
  let contractorId = null;
  let workerName;
  for (const r of state.labor.values()) {
    if (r.worker_id !== workerId) continue;
    contractorId = r.contractor_id;
    workerName = r.worker_name;
    lines.push({
      labor_record_id: r.labor_record_id,
      activity_code: r.activity_code,
      work_minutes: r.work_minutes,
      amount: round2((r.work_minutes / 60) * r.rate_per_hour),
    });
  }
  const settlement = state.laborSettlements.find((s) => s.worker_id === workerId);
  return {
    worker_id: workerId,
    worker_name: workerName,
    contractor_id: contractorId,
    total_minutes: lines.reduce((n, l) => n + l.work_minutes, 0),
    total_amount: round2(lines.reduce((n, l) => n + l.amount, 0)),
    settled: !!settlement,
    lines,
  };
}

/**
 * 园区视角：承载瓶颈与就业收益。
 * 只输出聚合数字——学生个体表现不得进入分析或营销。
 */
export function capacityAnalysis(state) {
  const resources = [];
  for (const [resourceId, win] of state.windows) {
    const allocs = state.reservations.flatMap((r) => r.allocations.filter((a) => a.resource_id === resourceId));
    const used = Math.max(0, ...allocs.map((a) => a.capacity_used));
    const rejections = state.rejections.filter((rj) =>
      rj.reasons.some((x) => x.resource_id === resourceId)
    ).length;
    // 实际接待：已核验证据中使用该资源的小组数；替代场地据此反映真实承载
    const deliveredGroups = new Set(
      [...state.verifications.values()]
        .filter((v) => v.status === "verified")
        .map((v) => state.activities.get(v.evidence_id))
        .filter((a) => a && a.resource_id === resourceId)
        .map((a) => a.group_id)
    );
    const substitutionsIn = [...state.substitutions.values()].filter(
      (s) => s.accepted && s.proposal.replacement.resource_id === resourceId
    ).length;
    resources.push({
      resource_id: resourceId,
      kind: win.kind,
      capacity_per_slot: win.capacity_per_slot,
      used,
      utilization: win.capacity_per_slot ? round2(used / win.capacity_per_slot) : 0,
      delivered_groups: deliveredGroups.size,
      substitutions_in: substitutionsIn,
      rejections,
      blockages: state.blockages.filter((b) => b.resource_id === resourceId).map((b) => b.reason),
    });
  }
  const byContractor = new Map();
  for (const r of state.labor.values()) {
    if (!byContractor.has(r.contractor_id)) {
      byContractor.set(r.contractor_id, { contractor_id: r.contractor_id, worker_count: new Set(), total_minutes: 0, total_amount: 0 });
    }
    const row = byContractor.get(r.contractor_id);
    row.worker_count.add(r.worker_id);
    row.total_minutes += r.work_minutes;
    row.total_amount += (r.work_minutes / 60) * r.rate_per_hour;
  }
  const employment = [...byContractor.values()].map((x) => ({
    contractor_id: x.contractor_id,
    worker_count: x.worker_count.size,
    total_minutes: x.total_minutes,
    total_amount: round2(x.total_amount),
  }));
  return { resources, employment };
}

/**
 * 儿童资料访问边界：某一时点只有当班人员有权接触。
 * 访问控制服务应据此放行，事件流本身不携带任何学生身份资料。
 */
export function staffOnDuty(state, bookingId, at) {
  const booking = state.bookings.get(bookingId);
  if (!booking) throw new Error(`未知预约：${bookingId}`);
  const t = new Date(at);
  return booking.duty
    .filter((d) => new Date(d.duty_start) <= t && t <= new Date(d.duty_end))
    .map((d) => ({ staff_id: d.staff_id, name: d.name, role: d.role }));
}
