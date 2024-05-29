import * as process from "process";
import * as fs from "fs";
import * as path from "path";
import {
  createTempDirectory,
  isFileOrDirectory,
  executeCommand,
  parseTestcase,
  filterTestcases,
} from "./playwrightx/utils";

import {
  LoadError,
  LoadResult,
} from "testsolar-oss-sdk/src/testsolar_sdk/model/load";
import { TestCase } from "testsolar-oss-sdk/src/testsolar_sdk/model/test";

import Reporter from "testsolar-oss-sdk/src/testsolar_sdk/reporter";

export async function collectTestCases(
  projPath: string,
  testSelectors: string[],
): Promise<LoadResult> {
  const test: TestCase[] = [];
  const loadError: LoadError[] = [];
  const result = new LoadResult(test, loadError);

  try {
    // 进入projPath目录
    process.chdir(projPath);
    console.log(`Current directory: ${process.cwd()}`);

    // 避免镜像中依赖目录被覆盖并且playwright版本不是最新，采用动态安装依赖和浏览器
    const installCommand =
      "npm cache clean --force && npm install -g pnpm && pnpm install @playwright/test  && pnpm install && pnpm list && npx playwright install";
    console.log("Run Command: ", installCommand);
    const { stdout, stderr } = await executeCommand(installCommand);
    console.log("stdout:", stdout);
    console.log("stderr:", stderr);

    const tempDirectory = createTempDirectory();
    const filePath = path.join(tempDirectory, "testSolarOutput.json");

    // 执行命令获取output.json文件内容
    const fileType = await isFileOrDirectory(filePath).catch((err) => {
      console.error(err);
      return 0;
    });
    if (fileType !== 1) {
      const command = `npx playwright test --list --reporter=json | tee ${filePath}`;
      console.log("Run Command: ", command);
      const { stdout, stderr } = await executeCommand(command);
      console.log("stdout:", stdout);
      console.log("stderr:", stderr);
    }

    //TODO 解析output.json文件内容, 待完善，重跑用例加上数据驱动

    const fileContent = fs.readFileSync(filePath, "utf-8");
    const testData = JSON.parse(fileContent);

    // 解析所有用例
    const loadCaseResult = parseTestcase(projPath, testData);
    console.log("PlayWright testtool parse all testcases: \n", loadCaseResult);

    // 过滤用例
    let filterResult;
    if (testSelectors && testSelectors.length > 0) {
      // 检查 testSelectors 是否只包含一个 "."
      if (testSelectors.length === 1 && testSelectors[0] === ".") {
        // 如果 testSelectors 只包含一个 "."，则直接返回 loadCaseResult
        filterResult = loadCaseResult;
      } else {
        // 如果 testSelectors 不为空且不只是 "."，则调用 filterTestcases 函数
        filterResult = await filterTestcases(
          testSelectors,
          loadCaseResult,
          false,
        );
      }
    } else {
      // 如果 testSelectors 为空，则直接使用 loadCaseResult
      filterResult = loadCaseResult;
    }
    console.log("filter testcases: ", filterResult);

    // 提取用例数据
    filterResult.forEach((filteredTestCase: string) => {
      const [path, descAndName] = filteredTestCase.split("?");
      const test = new TestCase(`${path}?${descAndName}`, {});
      result.Tests.push(test);
    });
  } catch (error: unknown) {
    // 直接抛出异常并退出
    const errorMessage =
      (error as Error).message ||
      "Parse json file error, please check the file content!";
    console.error(errorMessage);
  }

  return result;
}

export async function loadTestCasesFromFile(filePath: string): Promise<void> {
  console.log("Pipe file: ", filePath);

  // 读取文件并解析 JSON
  const fileContent = fs.readFileSync(filePath, "utf-8");
  const data = JSON.parse(fileContent);
  console.log(`Pipe file content:\n${JSON.stringify(data, null, 2)}`);
  const testSelectors = data.TestSelectors || [];
  const projPath = data.ProjectPath;
  const taskId = data.TaskId;

  console.log("generate demo load result");
  const loadResults: LoadResult = await collectTestCases(
    projPath,
    testSelectors,
  );

  const reporter = new Reporter(taskId);
  await reporter.reportLoadResult(loadResults);
}

// 从命令行参数中获取文件路径
const loadParamFile = process.argv[2];

// 执行加载测试用例的函数
loadTestCasesFromFile(loadParamFile)
  .then(() => {
    console.log("Load result reported successfully");
  })
  .catch((error) => {
    console.error("Failed to load test cases:", error);
  });

// 使脚本可以直接通过 Node.js 运行
if (require.main === module) {
  loadTestCasesFromFile(loadParamFile);
}
