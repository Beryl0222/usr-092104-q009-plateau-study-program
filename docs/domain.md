# 高原研学资源兑现 · 领域模型

面向示范区运营方、学校、讲解员与承包方农户，约定一日研学（高原种业观察、无土栽培、采摘等）从**订课**到**结算**全过程的对象身份、事件顺序与不变量。事件是跨主体同步的唯一事实来源；读模型（教师报告、农户台账、园区分析）全部由事件投影得到。

## 1. 为什么需要这些事件

出发前才发现试验田禁入、果实未熟、讲解员被别的团队占用；临时改成参观却说不清课程目标和已收费用如何兑现；农户工资散落在不同承包方表格里。模型用四类机制解决：

1. **资源窗口 + 四维同事务校验**：预约要么整体成立，要么整体拒绝并给出失败维度，不允许先锁资源后发现问题。
2. **替代方案等值说明 + 学校授权确认**：道路中断、农事变化触发替代，必须逐学段目标说明等值、经学校授权人确认后才生效。
3. **环节级证据**：每个小组、每个实践环节各自留证并核验，一次签到不能核销全部环节。
4. **按真实兑现结算**：费用每行必须追溯到已核验证据或已确认替代；未提供的环节退款；离线回传幂等去重，课时与工资不重复计算。

## 2. 聚合与事件

| 聚合 | 事件 |
| --- | --- |
| `curriculum_revision` 课程版本 | `PROGRAM_PUBLISHED`、`PROGRAM_BOOKED`（遗留） |
| `personnel_profile` 人员资质 | `INSTRUCTOR_QUALIFIED` |
| `study_booking` 学校团队 | `BOOKING_REQUESTED`、`STAFF_DUTY_ASSIGNED`、`HEALTH_GUIDANCE_ISSUED`、`BOOKING_CANCELLED` |
| `resource_window` 田块/场馆/车辆/讲解员 | `RESOURCE_WINDOW_DECLARED`、`RESOURCE_BLOCKED` |
| `resource_reservation` 预约事务 | `RESOURCE_RESERVED`、`RESERVATION_REJECTED` |
| `privacy_consent` 隐私同意 | `CONSENT_RECORDED` |
| `substitution` 替代方案 | `SUBSTITUTION_PROPOSED`、`SUBSTITUTION_ACCEPTED`、`SUBSTITUTION_REJECTED` |
| `activity_evidence` 环节证据 | `ACTIVITY_RECORDED`、`OFFLINE_BATCH_SYNCHRONIZED`、`ACTIVITY_VERIFIED` |
| `labor_settlement` 农户劳务 | `LABOR_RECORDED`、`LABOR_SETTLED` |
| `fee_settlement` 费用结算 | `FEE_SETTLED` |

版本语义：同一聚合 `version` 从 1 开始、随 `occurred_at` 单调递增且不复用；`event_id` 全局唯一。事件类型与枚举只能追加，不能改写既有含义（见 `contracts/domain.schema.json`）。

## 3. 核心不变量（由 `validateStream` 强制）

**预约（同一事务）**
- `checks` 中作物、人员、空间、安全四维必须全部 `passed`，任一不通过只能发 `RESERVATION_REJECTED`，资源不锁定。
- 健康与监护提示须经学校知悉确认（`acknowledged_by_school=true`）后才能锁定资源。
- 作物：禁入阶段（`accessible=false`）不可约；采摘必须落在 `crop_stage=ripe` 与成熟窗口内。
- 人员：讲解员资质在活动当日有效且覆盖该环节类型；同一讲解员时段重叠不可被两个团队重复占用。
- 空间：使用时段必须落在资源开放窗口内；同资源时段重叠占用合计不得超过 `capacity_per_slot`。
- 安全：车辆座位不得少于师生监护全员人数。
- 阻断（`RESOURCE_BLOCKED`，如道路中断）与预约时段重叠即判失败，必须先走替代流程。

**替代方案**
- 提议必须给出 `objective_codes`（逐学段目标）与 `equivalence_note`（等值说明，含费用差额预览）。
- 只能由 `BOOKING_REQUESTED.authorized_confirmer_ids` 中的学校人员接受；接受前对学校不产生兑现义务，接受后原资源的禁入/阻断不再判违约，但费用只能沿替代后的实际证据兑现。
- 替代资源自身必须可进入、当日开放。
- 同一替代不能既被接受又被拒绝。

**环节证据**
- 证据按 `booking × group × activity` 分别留存；核验必须指向真实存在的记录且三者一致。
- 含照片（`photo`）的证据必须另有 `media_usage` 且用途含 `activity_evidence` 的同意。
- 课程取消后不得再记录实践环节；取消不影响取消前已完成并核验的环节。

**离线回传**
- 离线记录必须带 `client_record_id`；重复回传按该键丢弃，不重复计课时或工资。`OFFLINE_BATCH_SYNCHRONIZED` 中引用的键必须真实存在，`duplicate` 仅作告知。

**劳务**
- 工时×单价必须等于行金额；合计必须等于明细之和；同一工时记录不得跨结算单重复结算。
- 工人以 `worker_id` 归一，与承包方表格来源解耦，农户可跨承包方核对自己的台账。

**费用**
- `已兑现合计 + 未兑现合计 = 已收费`；应付=已兑现，退款=未兑现。
- 每个已兑现行必须有**已核验**的环节证据或**学校已确认**的替代为依据；按组收费的行，证据的活动与小组必须一致（防止用一组签到给另一组核销）。
- 已有核验完成证据的活动/小组不得再列入退款。

## 4. 隐私边界

- 事件流只保存人数、小组与当班排班，**不保存任何学生身份或健康明细**；儿童资料存储在事件之外。
- `child_data_on_duty` 同意把访问范围限定为当班人员（`staffOnDuty(state, bookingId, at)` 给出时点放行名单）。
- 影像用途逐项授权：`activity_evidence`、`school_report`、`marketing` 分开；未取得 `marketing` 授权时，学生影像与个体表现不得用于营销。
- 园区分析（`capacityAnalysis`）只输出资源利用率、拒绝次数、阻断原因与分承包方就业收益等聚合数字，不含学生个体。

## 5. 三个终端读模型

- 教师：`groupActivityReport(state, bookingId)` — 每组对照学段目标的 `completed / missing / disputed` 实践。
- 农户：`workerLedger(state, workerId)` — 本人跨承包方的工时、单价金额与是否已结算。
- 园区：`capacityAnalysis(state)` — 资源承载瓶颈与就业收益聚合。

## 6. 联调样例

`data/scenario.json` 是一条完整事件流：首个排产因试验田禁入/未成熟被四维拒绝 → 重排通过 → 当日道路中断触发等值替代（温室采摘）并由校长确认 → 田间弱网离线记录回传（含重复丢弃）→ 一组完成替代采摘、二组采摘缺失 → 两户农户跨承包方工时结算 → 费用按真实提供的五个小组环节+交通结算、二组采摘退款 1200 元。
