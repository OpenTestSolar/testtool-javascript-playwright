# 使用文档

本文档描述如何在 TestSolar 中使用 `playwright` 测试工具。

## TestContainer 配置

```yaml
testTool:
  use: git.woa.com/TestSolar/TestTool/javascript@master:playwright
```

我们提供`git`和`http`两种使用方式。

| **访问协议** | **访问地址**                                                                                      | **说明** |
| ------------ | ------------------------------------------------------------------------------------------------- | -------- |
| `git`        | `git.woa.com/TestSolar/TestTool/javascript@master:playwright`                                     |          |
| `http`       | `https://mirrors.tencent.com/repository/generic/testsolar/testtools/javascript@master:playwright` |          |

### 分支/tag切换

当临时使用到特殊版本的测试工具时，可切换到对应的分支或者tag。

格式：`git.woa.com/TestSolar/TestTool/javascript@{BRANCH_OR_TAG}:playwright`

```yaml
testTool: # 测试工具相关配置
  use: git.woa.com/TestSolar/TestTool/javascript@3.12_promote:playwright
```

## 基础镜像

默认使用的基础镜像为：`mirrors.tencent.com/testsolar-base/javascript:node18`

如果要修改使用自己的基础镜像，可以在 `.testsolar/testcontainer.yaml` 设置 `baseImage`：

```yaml
schemaVersion: 1.0
baseImage: mirrors.tencent.com/testsolar-base/javascript:node18
testTool:
  use: git.woa.com/TestSolar/TestTool/javascript@master:playwright
```

## 配置参数

通过在`testTool`下的`with`字段，可以指定测试工具的相关配置参数。

```yaml
testTool:
  use: git.woa.com/TestSolar/TestTool/javascript@master:playwright
  with:
    extraArgs: ""
```

> 注意：所有配置参数类型全部为**字符串**，请使用引号将值括起来，避免类型解析错误。

| **参数名称** | **默认值** | **参数含义**       | **说明** |
| ------------ | ---------- | ------------------ | -------- |
| `extraArgs`  |            | playwright额外参数 |          |
