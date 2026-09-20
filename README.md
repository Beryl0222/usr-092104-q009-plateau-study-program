# 高原研学资源兑现

本仓库保存高原研学资源兑现的领域词汇、事件约定与基础校验代码，供相关单位统一对象身份、事件顺序和版本语义。

## 目录

- `contracts/domain.schema.json`：领域事件信封与稳定枚举。
- `data/sample.json`：一条中文联调样例。
- `src/`：事件基础字段校验。
- `tests/`：领域资料一致性检查。

当前核心对象为curriculum_revision、resource_window、activity_evidence、labor_settlement，已登记事件为PROGRAM_BOOKED、RESOURCE_RESERVED、SUBSTITUTION_ACCEPTED、ACTIVITY_VERIFIED、LABOR_SETTLED。这些资料描述基础交换边界，后续服务应保持事件兼容性。

## 本地检查

```bash
npm test
```
