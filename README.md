# 高原研学资源兑现

本仓库保存高原研学资源**履约服务**的领域词汇、事件约定与零依赖校验代码，供运营方、学校、讲解员、承包方农户等主体统一对象身份、事件顺序、容量与结算语义。事件流是跨主体同步的唯一事实来源。

## 目录

- `contracts/domain.schema.json`：领域事件信封、事件↔聚合归属与各事件载荷的 JSON Schema。
- `src/domain.ts`：TypeScript 领域类型（枚举、载荷、读模型）。
- `src/validator.js`：信封校验、事件流不变量校验（四维容量、替代确认、环节证据、离线去重、劳务与费用真实性）与读模型投影。
- `data/sample.json`：遗留的信封级中文样例（`PROGRAM_BOOKED`）。
- `data/scenario.json`：一日研学全生命周期联调样例（禁入拒绝、道路中断替代、离线回传去重、环节缺失、按真实兑现结算）。
- `docs/domain.md`：聚合、事件、不变量与隐私边界说明。
- `tests/contract.test.js`：正样例与关键负样例一致性检查。

## 领域对象与事件

聚合：`curriculum_revision`（课程版本与学段目标）、`personnel_profile`（导师资质）、`study_booking`（学校团队、监护与健康提示）、`resource_window`（田块生长窗口、场馆车辆容量）、`resource_reservation`（同事务四维校验）、`privacy_consent`（儿童资料与影像同意）、`substitution`（等值替代与学校确认）、`activity_evidence`（分组分环节证据）、`labor_settlement`（农户劳务）、`fee_settlement`（费用结算）。

已登记事件：`PROGRAM_PUBLISHED`、`PROGRAM_BOOKED`、`INSTRUCTOR_QUALIFIED`、`BOOKING_REQUESTED`、`STAFF_DUTY_ASSIGNED`、`HEALTH_GUIDANCE_ISSUED`、`RESOURCE_WINDOW_DECLARED`、`RESOURCE_BLOCKED`、`RESOURCE_RESERVED`、`RESERVATION_REJECTED`、`CONSENT_RECORDED`、`SUBSTITUTION_PROPOSED`、`SUBSTITUTION_ACCEPTED`、`SUBSTITUTION_REJECTED`、`ACTIVITY_RECORDED`、`OFFLINE_BATCH_SYNCHRONIZED`、`ACTIVITY_VERIFIED`、`LABOR_RECORDED`、`LABOR_SETTLED`、`BOOKING_CANCELLED`、`FEE_SETTLED`。事件只能追加，不得改写既有语义。

关键边界：

- 预约在同一事务校验**作物、人员、空间、安全**四维，任一不过即整体拒绝；
- 道路中断或农事变化触发带**逐目标等值说明**的替代方案，须学校授权人确认；
- 每个小组、每个环节分别留证，**不能用一次签到证明全部环节**；
- 儿童资料只向当班人员开放，影像按用途另行同意，学生个体表现不得用于营销；
- 离线田间记录按 `client_record_id` 幂等去重，课程取消只结算**真实提供**的资源。

## 本地检查

```bash
npm test
```
