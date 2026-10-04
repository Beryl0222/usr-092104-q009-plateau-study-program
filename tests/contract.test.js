import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateEvent,
  validatePayloadShape,
  validateStream,
  buildProjection,
  groupActivityReport,
  workerLedger,
  capacityAnalysis,
  staffOnDuty,
  EVENT_TYPES,
  AGGREGATE_TYPES,
} from "../src/validator.js";

const loadJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));

test("遗留信封样例符合领域约定", async () => {
  const sample = await loadJson("../data/sample.json");
  assert.deepEqual(validateEvent(sample), []);
});

test("契约 schema 可解析，且枚举与校验器一致", async () => {
  const schema = await loadJson("../contracts/domain.schema.json");
  assert.equal(schema.title, "高原研学资源兑现领域事件");
  assert.deepEqual([...schema.$defs.event_type.enum].sort(), [...EVENT_TYPES].sort());
  assert.deepEqual([...schema.$defs.aggregate_type.enum].sort(), [...AGGREGATE_TYPES].sort());
});

// ---------- 正样例 ----------

async function scenario() {
  return loadJson("../data/scenario.json");
}
const byId = (events, id) => events.find((e) => e.event_id === id);
const clone = (v) => JSON.parse(JSON.stringify(v));
const mutate = (events, id, fn) => {
  fn(byId(events, id));
  return events;
};
const without = (events, id) => events.filter((e) => e.event_id !== id);

test("全流程样例：流级不变量全部通过，仅报告离线重复去重", async () => {
  const result = validateStream(await scenario());
  assert.deepEqual(result.errors, [], result.errors.join("\n"));
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /重复离线回传/);
});

test("离线重发按 client_record_id 去重：课时5条、工资2条", async () => {
  const { state } = validateStream(await scenario());
  assert.equal(state.activities.size, 5);
  assert.equal(state.labor.size, 2);
  assert.ok(state.duplicateClientRecords.includes("activity:cr-act-gb-soil"));
  assert.ok(state.duplicateClientRecords.includes("labor:cr-labor-1"));
});

test("教师视角：一组三环节齐全，二组缺失必修采摘并对应 OBJ-3", async () => {
  const { state } = validateStream(await scenario());
  const [ga, gb] = groupActivityReport(state, "B-501");
  assert.deepEqual(ga.completed.map((c) => c.activity_code), ["ACT-SEED", "ACT-SOIL", "ACT-PICK"]);
  assert.deepEqual(ga.missing, []);
  assert.deepEqual(gb.completed.map((c) => c.activity_code), ["ACT-SEED", "ACT-SOIL"]);
  assert.deepEqual(gb.missing.map((m) => m.activity_code), ["ACT-PICK"]);
  assert.deepEqual(gb.missing[0].objective_codes, ["OBJ-3"]);
});

test("农户视角：央金重复工时只计一次，120分钟60元已结算", async () => {
  const { state } = validateStream(await scenario());
  const ledger = workerLedger(state, "W-01");
  assert.equal(ledger.lines.length, 1);
  assert.equal(ledger.total_minutes, 120);
  assert.equal(ledger.total_amount, 60);
  assert.equal(ledger.settled, true);
  const zhaxi = workerLedger(state, "W-02");
  assert.equal(zhaxi.contractor_id, "C-02");
  assert.equal(zhaxi.total_amount, 60);
});

test("园区视角：道路阻断被记录，替代温室实际接待1组，分析只含聚合数字", async () => {
  const { state } = validateStream(await scenario());
  const analysis = capacityAnalysis(state);
  const f101 = analysis.resources.find((r) => r.resource_id === "F-101");
  const g202 = analysis.resources.find((r) => r.resource_id === "G-202");
  assert.deepEqual(f101.blockages, ["road_closure"]);
  assert.equal(g202.substitutions_in, 1);
  assert.equal(g202.delivered_groups, 1);
  assert.equal(analysis.employment.length, 2);
  assert.ok(JSON.stringify(analysis).includes("W-01") === false);
});

test("儿童资料访问边界：只有当班时段内的人员放行", async () => {
  const { state } = validateStream(await scenario());
  const onDuty = staffOnDuty(state, "B-501", "2026-10-14T10:00:00+08:00").map((s) => s.staff_id);
  assert.deepEqual(onDuty.sort(), ["I-01", "I-02", "N-09", "T-CONF-01"]);
  assert.deepEqual(staffOnDuty(state, "B-501", "2026-10-14T18:00:00+08:00"), []);
});

// ---------- 信封与载荷结构 ----------

test("未知事件/错误聚合归属被拒绝", () => {
  assert.match(validateEvent({ event_type: "NOPE" }).join(), /未知事件类型/);
  const e = {
    event_id: "x",
    event_type: "FEE_SETTLED",
    aggregate_type: "study_booking",
    aggregate_id: "a",
    occurred_at: "2026-10-14T10:00:00+08:00",
    version: 1,
    summary: "x",
  };
  assert.match(validateEvent(e).join(), /不能归属聚合/);
});

test("预约载荷四维缺任一项即结构非法", () => {
  const errs = validatePayloadShape("RESOURCE_RESERVED", {
    reservation_id: "r",
    booking_id: "b",
    slot_start: "2026-10-14T09:00:00+08:00",
    slot_end: "2026-10-14T16:30:00+08:00",
    checks: { crop: "passed", personnel: "passed", space: "passed" },
    allocations: [],
  });
  assert.ok(errs.some((m) => m.includes("四维必须全部 passed")));
});

test("离线记录缺幂等键被拒绝", () => {
  const errs = validatePayloadShape("ACTIVITY_RECORDED", {
    evidence_id: "e",
    booking_id: "b",
    group_id: "g",
    activity_code: "ACT-PICK",
    resource_id: "F-1",
    started_at: "2026-10-14T09:00:00+08:00",
    ended_at: "2026-10-14T10:00:00+08:00",
    evidence_types: ["photo"],
    recorded_offline: true,
  });
  assert.ok(errs.some((m) => m.includes("client_record_id")));
});

// ---------- 流级负样例 ----------

test("四维之一未过：车辆座位少于全员，安全容量不通过", async () => {
  const events = mutate(await scenario(), "evt-051", (e) => {
    e.payload.allocations.find((a) => a.resource_id === "V-301").capacity_used = 40;
  });
  assert.match(validateStream(events).errors.join("\n"), /安全容量/);
});

test("讲解员跨团队重叠占用触发容量冲突", async () => {
  const events = mutate(await scenario(), "evt-051", (e) => {
    e.payload.allocations.push({
      resource_kind: "instructor",
      resource_id: "I-01",
      activity_code: "ACT-SEED",
      capacity_used: 1,
      capacity_limit: 1,
    });
  });
  assert.match(validateStream(events).errors.join("\n"), /容量冲突/);
});

test("道路阻断未经学校确认替代：原资源判违约", async () => {
  const events = without(await scenario(), "evt-062");
  const errors = validateStream(events).errors.join("\n");
  assert.match(errors, /F-101/);
  assert.match(errors, /阻断/);
});

test("替代方案只能由学校授权确认人接受", async () => {
  const events = mutate(await scenario(), "evt-062", (e) => {
    e.payload.confirmed_by = "T-OUTSIDER";
  });
  assert.match(validateStream(events).errors.join("\n"), /授权确认人/);
});

test("采摘田未成熟：作物维度报成熟窗口错误", async () => {
  let events = mutate(await scenario(), "evt-022", (e) => {
    e.payload.crop_stage = "growing";
  });
  events = without(events, "evt-062"); // 去掉替代豁免
  assert.match(validateStream(events).errors.join("\n"), /成熟窗口/);
});

test("健康提示未经学校确认不得锁定资源", async () => {
  const events = mutate(await scenario(), "evt-031", (e) => {
    e.payload.acknowledged_by_school = false;
  });
  assert.match(validateStream(events).errors.join("\n"), /健康与监护提示/);
});

test("影像证据必须另有 media_usage 同意", async () => {
  const events = without(await scenario(), "evt-040");
  const errors = validateStream(events).errors.join("\n");
  assert.match(errors, /影像用途同意/);
});

test("不能用一次签到给另一组核销：收费行小组与证据不一致即拒付", async () => {
  const events = mutate(await scenario(), "evt-100", (e) => {
    const line = e.payload.delivered.find((l) => l.item_code === "PRICE-PICK");
    line.group_id = "GB"; // 证据 E-GA-PICK 属于 GA
  });
  assert.match(validateStream(events).errors.join("\n"), /不得跨组兑现/);
});

test("争议证据不能作为费用兑现依据", async () => {
  const events = mutate(await scenario(), "evt-071", (e) => {
    e.payload.status = "disputed";
  });
  assert.match(validateStream(events).errors.join("\n"), /没有已核验证据或学校已确认的替代/);
});

test("费用合计必须等于已兑现+未兑现，应付等于已兑现", async () => {
  const events = mutate(await scenario(), "evt-100", (e) => {
    e.payload.charged_amount = 9999;
  });
  const errors = validateStream(events).errors.join("\n");
  assert.match(errors, /不等于已收费/);
});

test("已核验完成的环节不得列入退款", async () => {
  const events = mutate(await scenario(), "evt-100", (e) => {
    e.payload.canceled.push({ item_code: "PRICE-SEED", activity_code: "ACT-SEED", group_id: "GA", amount: 800 });
  });
  assert.match(validateStream(events).errors.join("\n"), /不得列为未兑现退款项/);
});

test("劳务结算：引用被去重的工时记录、金额与工时不符均被拒绝", async () => {
  let events = mutate(await scenario(), "evt-093", (e) => {
    e.payload.lines.push({ labor_record_id: "LR-W01-01-DUP", work_minutes: 120, amount: 60 });
  });
  assert.match(validateStream(events).errors.join("\n"), /不存在或已去重/);

  events = mutate(await scenario(), "evt-094", (e) => {
    e.payload.lines[0].amount = 999;
    e.payload.total_amount = 999;
  });
  assert.match(validateStream(events).errors.join("\n"), /金额应为 60/);
});

test("课程取消后不得再记录实践环节", async () => {
  const events = clone(await scenario());
  events.push({
    event_id: "evt-cancel",
    event_type: "BOOKING_CANCELLED",
    aggregate_type: "study_booking",
    aggregate_id: "B-501",
    occurred_at: "2026-10-14T08:00:00+08:00",
    version: 4,
    summary: "当日早晨取消",
    payload: { booking_id: "B-501", reason: "极端天气", cancelled_at: "2026-10-14T08:00:00+08:00" },
  });
  assert.match(validateStream(events).errors.join("\n"), /课程取消后不得再记录/);
});

test("离线批次引用不存在的幂等键被拒绝", async () => {
  const events = mutate(await scenario(), "evt-081", (e) => {
    e.payload.items[0].client_record_id = "cr-ghost";
  });
  assert.match(validateStream(events).errors.join("\n"), /引用了不存在的/);
});

test("event_id 唯一、聚合版本必须单调递增不复用", async () => {
  let events = mutate(await scenario(), "evt-001", (e) => {
    e.event_id = "evt-010";
  });
  assert.match(validateStream(events).errors.join("\n"), /event_id 重复/);

  events = mutate(await scenario(), "evt-032", (e) => {
    e.version = 1;
  });
  assert.match(validateStream(events).errors.join("\n"), /版本号重复/);
});

test("投影可独立构建，未知预约读模型抛错", async () => {
  const state = buildProjection(await scenario());
  assert.ok(state.bookings.has("B-501"));
  assert.throws(() => groupActivityReport(state, "B-NOPE"), /未知预约/);
});
