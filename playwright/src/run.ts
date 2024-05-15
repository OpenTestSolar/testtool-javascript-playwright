import * as fs from "fs";

import {
  executeCommands,
  generateCommands,
  groupTestCasesByPath,
  createTestResults,
} from "./playwrightx/utils";

import Reporter from "testsolar-oss-sdk/src/testsolar_sdk/reporter";

async function runTestCase(runParamFile: string): Promise<void> {
  console.log("Pipe file: ", runParamFile);
  const fileContent = fs.readFileSync(runParamFile, "utf-8");
  const data = JSON.parse(fileContent);
  console.log(`Pipe file content:\n${JSON.stringify(data, null, 2)}`);
  const testSelectors = data.TestSelectors || [];
  const projPath = data.ProjectPath;
  const taskId = data.TaskId;

  // 按照文件对用例进行分组
  const caseLists = groupTestCasesByPath(testSelectors);

  // 对每个文件生成命令行
  for (const [path, testcases] of Object.entries(caseLists)) {
    const { command, testIdentifiers } = generateCommands(path, testcases);
    // 执行命令，解析用例生成的 JSON 文件，上报结果

    const jsonName = path.replace(/\//g, "_");
    process.env.PLAYWRIGHT_JSON_OUTPUT_NAME = jsonName;

    const testResults = await executeCommands(
      projPath,
      command,
      testIdentifiers,
    );
    // console.log("Parse json results:\n", testResults);
    const results = createTestResults(testResults);
    const reporter = new Reporter(taskId);
    for (const result of results) {
      await reporter.reportTestResult(result);
    }
  }
}

// 从命令行参数中获取文件路径
const runParamFile = process.argv[2];

// 执行加载测试用例的函数
runTestCase(runParamFile)
  .then(() => {
    console.log("Run result reported successfully");
  })
  .catch((error) => {
    console.error("Failed to run test cases:", error);
  });

// 使脚本可以直接通过 Node.js 运行
if (require.main === module) {
  runTestCase(runParamFile);
}
