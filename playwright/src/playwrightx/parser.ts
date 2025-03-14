import * as process from "process";
import * as fs from "fs";
import * as path from "path";
import {
  executeCommand,
  parseTestcase,
  filterTestcases,
  getTestcasePrefix,
  parsePlaywrightReport,
} from "./utils";

import {
  LoadError,
  LoadResult,
} from "testsolar-oss-sdk/src/testsolar_sdk/model/load";
import log from 'testsolar-oss-sdk/src/testsolar_sdk/logger';
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
    log.info(`Current directory: ${process.cwd()}`);

    const attachmentPath = path.join(projPath, "attachments");
    if (!fs.existsSync(attachmentPath)) {
      fs.mkdirSync(attachmentPath, { recursive: true });
    }
    const filePath = path.join(projPath, "load.json");


    // 执行命令获取output.json文件内容
    const command = `npx playwright test --list --reporter=json > ${filePath}`;
    log.info("Run Command: ", command);
    const { stdout, stderr } = await executeCommand(command);
    log.info("stdout:", stdout);
    log.info("stderr:", stderr);

    //TODO 解析output.json文件内容, 待完善，重跑用例加上数据驱动
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const testData = JSON.parse(fileContent);

    // 解析所有用例
    const loadCaseResult = parseTestcase(projPath, testData);
    log.info("PlayWright testtool parse all testcases: \n", loadCaseResult);

    // 如果用例为空，则通过解析json来获取错误信息
    if (loadCaseResult.length === 0) {
      const errors = parsePlaywrightReport(fileContent);
      result.LoadErrors.push(...errors); // 使用LoadResult中定义的属性名
    }

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
    log.info("filter testcases: ", filterResult);

    const testcasePrefix = getTestcasePrefix();

    // 提取用例数据
    filterResult.forEach((filteredTestCase: string) => {
      const [path, descAndName] = filteredTestCase.split("?");
      const test = new TestCase(`${testcasePrefix}${path}?${descAndName}`, {});
      result.Tests.push(test);
    });
  } catch (error: unknown) {
    // 直接抛出异常并退出
    const errorMessage =
      (error as Error).message ||
      "Parse json file error, please check the file content!";
    log.error(errorMessage);
  }

  return result;
}

export async function loadTestCasesFromFile(filePath: string): Promise<void> {
  log.info("Pipe file: ", filePath);

  // 读取文件并解析 JSON
  const fileContent = fs.readFileSync(filePath, "utf-8");
  const data = JSON.parse(fileContent);
  log.info(`Pipe file content:\n${JSON.stringify(data, null, 2)}`);
  const testSelectors = data.TestSelectors || [];
  const projPath = data.ProjectPath;
  const taskId = data.TaskId;

  log.info("generate demo load result");
  const loadResults: LoadResult = await collectTestCases(
    projPath,
    testSelectors,
  );

  const reporter = new Reporter(taskId, data.FileReportPath);
  await reporter.reportLoadResult(loadResults);
}

