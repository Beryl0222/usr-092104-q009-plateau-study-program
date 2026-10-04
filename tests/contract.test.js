import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import { AGGREGATE_TYPES, EVENT_AGGREGATE, EVENT_TYPES, validateEvent } from "../src/validator.js";

const root = new URL("..", import.meta.url);

async function readJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, root), "utf8"));
}

async function listSampleFiles() {
  const entries = ["data/sample.json"];
  const dir = await readdir(new URL("data/samples", root));
  for (const name of dir.filter((name) => name.endsWith(".json")).sort()) {
    entries.push(`data/samples/${name}`);
  }
  return entries;
}

test("全部样例符合领域约定", async () => {
  for (const path of await listSampleFiles()) {
    const sample = await readJson(path);
    assert.deepEqual(validateEvent(sample), [], `${path} 应通过校验`);
  }
});

test("校验器拒绝非法事件", () => {
  const base = {
    event_id: "e-1",
    event_type: "PROGRAM_BOOKED",
    aggregate_type: "curriculum_revision",
    aggregate_id: "a-1",
    occurred_at: "2026-10-01T08:00:00+08:00",
    version: 1,
    summary: "基准事件",
  };
  assert.deepEqual(validateEvent(base), []);

  const cases = [
    [{ ...base, event_type: "SIGN_IN_ONCE" }, /未登记的事件类型/],
    [{ ...base, aggregate_type: "marketing_lead" }, /未登记的聚合类型/],
    [{ ...base, aggregate_type: "activity_evidence" }, /应挂载聚合/],
    [{ ...base, occurred_at: "昨天" }, /occurred_at/],
    [{ ...base, version: 0 }, /version/],
    [{ ...base, summary: "" }, /summary/],
    [{ ...base, event_id: "" }, /event_id/],
  ];
  for (const [record, pattern] of cases) {
    assert.ok(validateEvent(record).some((message) => pattern.test(message)), JSON.stringify(record));
  }

  const { summary, ...missing } = base;
  assert.ok(validateEvent(missing).includes("缺少字段：summary"));
});

test("事件与聚合挂载关系完整", () => {
  for (const eventType of EVENT_TYPES) {
    assert.ok(EVENT_AGGREGATE[eventType], `${eventType} 缺少挂载聚合`);
    assert.ok(AGGREGATE_TYPES.includes(EVENT_AGGREGATE[eventType]), `${eventType} 挂载了未登记聚合`);
  }
});

test("契约与代码登记保持一致", async () => {
  const schema = await readJson("contracts/domain.schema.json");
  assert.deepEqual([...schema.properties.event_type.enum].sort(), [...EVENT_TYPES].sort());
  assert.deepEqual([...schema.properties.aggregate_type.enum].sort(), [...AGGREGATE_TYPES].sort());

  const domainSource = await readFile(new URL("src/domain.ts", root), "utf8");
  for (const literal of [...EVENT_TYPES, ...AGGREGATE_TYPES]) {
    assert.ok(domainSource.includes(`"${literal}"`), `domain.ts 缺少 ${literal}`);
  }
});
