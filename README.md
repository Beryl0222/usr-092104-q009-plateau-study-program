# 高原研学资源兑现

本仓库保存高原研学资源兑现的领域词汇、事件约定与基础校验代码，供示范区运营方、学校、承包方等相关单位统一对象身份、事件顺序和版本语义，支撑课程版本、学段目标、学校团队、监护与健康提示、田块生长窗口、场馆与车辆容量、导师资质、农户劳务、活动证据、费用与结算之间的跨主体同步。

## 目录

- `contracts/domain.schema.json`：领域事件信封与稳定枚举。
- `data/sample.json`、`data/samples/`：中文联调样例。
- `src/`：事件基础字段校验与类型登记。
- `tests/`：领域资料一致性检查。

## 核心对象

| aggregate_type | 含义 |
| --- | --- |
| curriculum_revision | 课程版本及其学段目标，研学项目的预订与取消载体 |
| school_team | 学校团队：学段、人数、监护与健康提示、儿童资料访问范围 |
| resource_window | 田块生长窗口与可预约时段，含禁入阶段与农事变化 |
| capacity_pool | 场馆、车辆与安全容量 |
| mentor_assignment | 导师（讲解员）指派与资质核验 |
| substitution_proposal | 替代方案：等值说明与学校确认 |
| activity_evidence | 分环节、分小组的实际活动证据 |
| offline_sync_batch | 离线田间记录回传批次，按幂等键去重 |
| fee_settlement | 面向学校的费用结算 |
| labor_settlement | 农户劳务工时与款项结算 |
| consent_record | 影像用途同意 |

## 事件目录

| event_type | 挂载聚合 | 含义 |
| --- | --- | --- |
| PROGRAM_BOOKED | curriculum_revision | 学校团队按课程版本预订研学项目 |
| TEAM_REGISTERED | school_team | 登记团队学段、人数与监护、健康提示 |
| WINDOW_UPDATED | resource_window | 生长窗口发布或变更（禁入、农事变化） |
| RESOURCE_RESERVED | resource_window | 资源预约成功（见规则1） |
| CAPACITY_ADJUSTED | capacity_pool | 场馆、车辆或安全容量调整 |
| MENTOR_ASSIGNED | mentor_assignment | 按资质指派导师 |
| SUBSTITUTION_PROPOSED | substitution_proposal | 道路中断或农事变化时提出替代方案（见规则2） |
| SUBSTITUTION_ACCEPTED | substitution_proposal | 学校确认接受替代方案 |
| SUBSTITUTION_DECLINED | substitution_proposal | 学校拒绝替代方案 |
| ACTIVITY_VERIFIED | activity_evidence | 单个环节、单个小组的活动证据核验（见规则3） |
| OFFLINE_RECORD_SYNCED | offline_sync_batch | 离线田间记录回传（见规则4） |
| PROGRAM_CANCELLED | curriculum_revision | 课程取消，进入按实结算（见规则5） |
| FEE_SETTLED | fee_settlement | 学校费用结算 |
| LABOR_SETTLED | labor_settlement | 农户劳务结算 |
| CONSENT_GRANTED | consent_record | 取得影像用途同意（见规则6） |
| CONSENT_REVOKED | consent_record | 影像用途同意撤回 |

## 业务规则

1. **预约原子校验**：`RESOURCE_RESERVED` 仅在作物窗口、人员资质、空间容量、安全容量于同一事务中全部通过时产生；任一不满足不得部分预约，负载 `checks` 记录四项结果。
2. **替代方案须等值并经确认**：道路中断或农事变化先产生 `SUBSTITUTION_PROPOSED`，负载必带 `equivalence_note`（等值说明）与受影响的 `affected_segments`；学校确认（`SUBSTITUTION_ACCEPTED`）后方可执行，拒绝则记 `SUBSTITUTION_DECLINED`。
3. **分环节证据**：`ACTIVITY_VERIFIED` 按 `segment_id` × `group_id` 逐条核验，单次签到不构成全部环节完成的证明；教师据此对照学段目标查看每组已完成与缺失的实践。
4. **离线幂等**：`OFFLINE_RECORD_SYNCED` 必带 `idempotency_key`，重复回传不得重复计算课时或农户工资。
5. **取消按实结算**：`PROGRAM_CANCELLED` 之后的 `FEE_SETTLED` 与 `LABOR_SETTLED` 只覆盖已核验环节与真实提供的资源，结算行项应引用对应证据事件。
6. **儿童资料与影像**：儿童资料仅向当班人员开放；影像使用须先取得注明用途的 `CONSENT_GRANTED`，撤回后不得继续使用；学生个体表现不得用于营销。
7. **读侧视图**：教师目标对照、农户工时与款项核对、园区承载瓶颈与就业收益分析均为读侧视图，由上述事件派生，不新增写事件。

## 兼容性

既有对象（curriculum_revision、resource_window、activity_evidence、labor_settlement）与既有事件（PROGRAM_BOOKED、RESOURCE_RESERVED、SUBSTITUTION_ACCEPTED、ACTIVITY_VERIFIED、LABOR_SETTLED）语义不变，本次仅新增对象与事件。后续服务应保持事件兼容性：只增不改，字段废弃须先登记替代事件。

## 本地检查

```bash
npm test
```
