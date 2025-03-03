import * as process from "process";
import * as fs from "fs";
import * as path from "path";
import {
  executeCommand,
  parseTestcase,
  filterTestcases,
  getTestcasePrefix
} from "./utils";

import {
  LoadError,
  LoadResult,
} from "testsolar-oss-sdk/src/testsolar_sdk/model/load";
import log from 'testsolar-oss-sdk/src/testsolar_sdk/logger';
import { TestCase } from "testsolar-oss-sdk/src/testsolar_sdk/model/test";

import Reporter from "testsolar-oss-sdk/src/testsolar_sdk/reporter";


// 定义JSON数据的类型接口
interface PlaywrightReport {
  config: any;
  suites: any[];
  errors: Array<{
    message: string;
    stack: string;
    location: {
      file: string;
      column: number;
      line: number;
    };
    snippet: string;
  }>;
  stats: {
    startTime: string;
    duration: number;
    expected: number;
    skipped: number;
    unexpected: number;
    flaky: number;
  };
}


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

    const newDirPath = path.join(projPath, "attachments");
    if (!fs.existsSync(newDirPath)) {
      fs.mkdirSync(newDirPath, { recursive: true });
    }
    const filePath = path.join(newDirPath, "load.json");


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

export function parsePlaywrightReport(jsonData: string): LoadError[] {
  try {
    const report = JSON.parse(jsonData) as PlaywrightReport;
    const loadErrors: LoadError[] = [];
    
    // 处理错误信息
    if (report.errors.length > 0) {
      report.errors.forEach((error) => {
        const errorMessage = error.message.split('\n')[0];
        let solution = "";
        
        // 提取建议的解决方案
        if (error.message.includes('Instead change')) {
          solution = error.message.split('\n')[1].trim();
        }
        
        // 创建错误名称和完整消息
        const errorName = `${error.location.file}:${error.location.line}:${error.location.column}`;
        const fullErrorMessage = solution 
          ? `${errorMessage}\n解决方案: ${solution}` 
          : errorMessage;
        
        const loadError = new LoadError(
          errorName,       // Name属性
          fullErrorMessage // Message属性
        );
        
        loadErrors.push(loadError);
      });
    }
    
    // 如果没有测试运行，添加一个通用错误
    if (report.stats.expected === 0 && report.errors.length > 0) {
      loadErrors.push(
        new LoadError(
          "playwright-test-load-error",
          "由于导入错误，没有测试用例被扫描。请先修复以上错误。"
        )
      );
    }
    
    return loadErrors;
    
  } catch (e) {
    // 解析JSON失败时返回一个错误
    const parseError = new LoadError(
      "playwright-json-parse-error",
      `解析JSON数据失败: ${e instanceof Error ? e.message : String(e)}`
    );
    
    return [parseError];
  }
}
