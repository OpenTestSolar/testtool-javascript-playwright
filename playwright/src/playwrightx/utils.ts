import * as process from "process";
import * as child_process from "child_process";
import * as util from "util";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createHash } from 'crypto';
import { parseISO, addMilliseconds } from "date-fns";
import { zonedTimeToUtc } from "date-fns-tz";
import { TestCase } from "testsolar-oss-sdk/src/testsolar_sdk/model/test";
import log from 'testsolar-oss-sdk/src/testsolar_sdk/logger';
import {
  TestResult,
  TestCaseStep,
  TestCaseLog,
  LogLevel,
  ResultType,
  AttachmentType,
  Attachment,
} from "testsolar-oss-sdk/src/testsolar_sdk/model/testresult";

import Reporter from "testsolar-oss-sdk/src/testsolar_sdk/reporter";
import {
  LoadError,
} from "testsolar-oss-sdk/src/testsolar_sdk/model/load";

const exec = util.promisify(child_process.exec);

interface ResultError {
  message: string;
}

interface OutInfo {
  text: string
}

interface AttachmentInfo {
  name: string;
  path: string;
  contentType: string;
}

interface Result {
  startTime: string;
  duration: number;
  status: string;
  error?: ResultError;
  errors?: ResultError[];
  stdout?: OutInfo[];
  stderr?: OutInfo[];
  attachments?: AttachmentInfo[];
}

interface Annotations {
  owner: string;
  description: string;
}

interface Test {
  annotations: Annotations[] | null;
  projectId: string;
  results: Result[];
}

interface Spec {
  title: string;
  file: string;
  tests?: Test[];
}

interface Suite {
  title: string;
  file: string;
  suites?: Suite[];
  specs: Spec[];
}

interface Data {
  config: {
    rootDir: string;
  };
  suites: Suite[];
}

interface Location {
  file: string;
  line: number;
  column: number;
}

interface Error {
  message: string;
  stack: string;
  location: Location;
  snippet: string;
}

interface Stats {
  startTime: string;
  duration: number;
}

interface JsonData {
  stats: Stats;
  suites: Suite[];
  errors: Error[];
}

interface SpecResult {
  projectID: string | null;
  result: string;
  duration: number;
  startTime: number;
  endTime: number;
  message: string;
  content: string;
  owner: string | null;
  description: string | null;
  attachments?: Attachment[];
}

// 定义JSON数据的类型接口
interface PlaywrightReport {
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

export function encodeQueryParams(url: string): string {
  // 查找问号位置
  const questionMarkIndex = url.indexOf('?');
  
  // 如果没有问号，直接返回原字符串
  if (questionMarkIndex === -1) {
    return url;
  }
  
  // 分割URL为基础部分和查询参数部分
  const baseUrl = url.substring(0, questionMarkIndex);
  const queryString = url.substring(questionMarkIndex + 1);
  
  // 对查询参数部分进行编码
  const encodedQueryString = encodeURIComponent(queryString);
  
  // 重新拼接返回结果
  return `${baseUrl}?${encodedQueryString}`;
}

// 执行命令并返回结果
export async function executeCommand(
  command: string,
): Promise<{ stdout: string; stderr: string; error?: Error }> {
  try {
    const { stdout, stderr } = await exec(command);
    return { stdout, stderr };
  } catch (error) {
    const typedError = error as Error & { stdout: string; stderr: string }; // 类型断言
    // log.error(
    //   `Error executing command: ${command}\nError stdout: ${typedError.stdout}\nError stderr: ${typedError.stderr}, please check testcase's log`,
    // );
    return {
      stdout: typedError.stdout,
      stderr: typedError.stderr,
      error: typedError,
    };
  }
}

export function parseErrorCases(
  jsonData: JsonData,
  cases: string[],
): Record<string, SpecResult[]> {
  const caseResults: Record<string, SpecResult[]> = {};

  // 获取统计信息
  const startTime = jsonData.stats.startTime;
  const duration = jsonData.stats.duration;
  const [specStartTime, specEndTime, specDuration] = parseTimeStamp(
    startTime,
    duration,
  );

  // 检查 suites 是否为空
  if (jsonData.suites.length === 0) {
    if (jsonData.errors.length > 0) {
      // 处理存在的错误
      for (const error of jsonData.errors) {
        const errorMessage = error.message;
        const errorStack = error.stack;
        const errorLocation = `${error.location.file}:${error.location.line}:${error.location.column}`;
        const errorSnippet = error.snippet;

        // 构建错误信息的结构
        const errorResult = {
          projectID: null, // 根据实际情况设置或从 error 对象中获取
          result: "failed",
          duration: specDuration, // 从统计信息中获取耗时
          startTime: specStartTime, // 从统计信息中获取启动时间
          endTime: specEndTime, // 计算结束时间
          message: errorMessage,
          content: `${errorStack}\nLocation: ${errorLocation}\nSnippet:\n${errorSnippet}`,
          owner: null, // 根据实际情况设置或从 error 对象中获取
          description: null, // 根据实际情况设置或从 error 对象中获取
        };

        // 遍历 cases，为每个 case 添加错误信息
        for (const testCase of cases) {
          caseResults[testCase] = [errorResult];
        }
      }
    } else {
      // 当 suites 和 errors 都为空时，添加特殊消息
      const message = "日志为空，请检查用例本地是否跑通，或者联系腾讯云助手";
      for (const testCase of cases) {
        caseResults[testCase] = [
          {
            projectID: null,
            result: "failed",
            duration: specDuration,
            startTime: specStartTime,
            endTime: specEndTime,
            message: message,
            content: message,
            owner: null,
            description: null,
          },
        ];
      }
    }
  }

  return caseResults;
}

// 判断路径是文件还是目录
export const isFileOrDirectory = (filePath: string) => {
  try {
    const stats = fs.statSync(filePath);
    if (stats.isFile()) {
      return 1; // 文件
    } else if (stats.isDirectory()) {
      return -1; // 目录
    } else {
      return 0; // 其他类型
    }
  } catch (err) {
    return 0; // 其他类型
  }
};

// 根据选择器过滤测试用例
export const filterTestcases = async (
  testSelectors: string[],
  parsedTestcases: string[],
  exclude: boolean = false,
): Promise<string[]> => {
  if (testSelectors.length === 0) {
    return parsedTestcases;
  }
  const filteredTestcases: string[] = [];

  for (const testCase of parsedTestcases) {
    let matched = false;

    for (const selector of testSelectors) {
      const fileType = isFileOrDirectory(selector);
      if (fileType === -1) {
        // 如果selector是目录路径，检查testCase是否包含selector + '/' 避免文件名与用例名重复
        if (testCase.includes(selector + "/")) {
          matched = true;
          break;
        }
      } else {
        if (testCase.includes(encodeQueryParams(selector))) {
          matched = true;
          break;
        }
      }
    }

    // 根据 exclude 参数，确定是否将匹配的测试用例包含在结果中
    if (exclude && !matched) {
      filteredTestcases.push(testCase);
    } else if (!exclude && matched) {
      filteredTestcases.push(testCase);
    }
  }

  return filteredTestcases;
};

// 解析测试用例
export const parseTestcase = (
  projPath: string,
  data: Data,
  rootDir: string | null = null,
): string[] => {
  let testcases: string[] = [];
  const rootPath = rootDir ? rootDir : data.config.rootDir;

  data.suites.forEach((suite: Suite) => {
    let casePath = (rootPath + "/" + suite.file).replace(`${projPath}/`, "");
    if (suite.suites) {
      const cases = parseTestcase(
        projPath,
        { config: data.config, suites: suite.suites },
        rootPath,
      );
      testcases = testcases.concat(cases);
    } else {
      let desc = "";
      if (suite.title === suite.file) {
        desc = "";
        casePath = (rootPath + "/" + suite.file).replace(`${projPath}/`, "");
      } else {
        desc = suite.title;
      }

      suite.specs.forEach((spec: Spec) => {
        const caseName = spec.title;
        const testcase =
          casePath + "?" + (desc ? `${desc} ${caseName}` : caseName);
        testcases.push(encodeQueryParams(testcase));
      });
    }
  });

  return Array.from(new Set(testcases));
};

/// 生成运行测试用例的命令
export function generateCommands(
  casePath: string,
  testCases: string[],
  jsonName: string,
): { command: string; testIdentifiers: string[] } {
  const testIdentifiers: string[] = [];

  // 从环境变量中获取 TESTSOLAR_TTP_EXTRAARGS 值
  const extraArgs = process.env.TESTSOLAR_TTP_EXTRAARGS || "";
  
  // 默认启用环境变量JSON文件，除非明确设置为"0"才禁用
  const useEnvJsonFile = process.env.TESTSOLAR_TTP_ENVJSONFILE !== "0";
  
  // 默认启用trace，只有当明确设置TESTSOLAR_TTP_TRACE为"0"时才关闭
  const disableTrace = process.env.TESTSOLAR_TTP_TRACE === "0";
  const traceOption = disableTrace ? "--trace off" : "--trace on";
  
  // 读取工作进程数量配置
  const workCounts = process.env.TESTSOLAR_TTP_WORKCOUNTS;
  // 如果指定了工作进程数量，则添加 --workers 参数
  const workersOption = workCounts ? `--workers=${workCounts}` : "";

  // 创建基于测试路径和测试用例的哈希值
  const input = `${casePath}-${testCases.join('-')}-${Date.now()}-${Math.random()}`;
  const hash = createHash('md5').update(input).digest('hex').substring(0, 10);
  const outputOption = `--output=test-results-${hash}`;
  
  // 检查是否为 fileMode
  const fileMode = process.env.TESTSOLAR_TTP_FILEMODE == "1";
  
  // 获取 grep 模式（在 fileMode 下不使用 grep）
  let grepPattern = "";
  if (testCases.length > 0 && !fileMode) {
    grepPattern = `--grep="${decodeURIComponent(testCases.join("|"))}"`;
  }

  let command;
  
  if (useEnvJsonFile) {
    // 使用环境变量设置 JSON 输出
    if (testCases.length === 0) {
      // 在 fileMode 下，即使没有具体测试用例，也要指定文件路径
      if (fileMode) {
        command = `export PLAYWRIGHT_JSON_OUTPUT_NAME=${jsonName} && npx playwright test ${casePath} --reporter=json ${traceOption} ${workersOption} ${outputOption} ${extraArgs}`;
      } else {
        command = `export PLAYWRIGHT_JSON_OUTPUT_NAME=${jsonName} && npx playwright test --reporter=json ${traceOption} ${workersOption} ${outputOption} ${extraArgs}`;
      }
    } else {
      command = `export PLAYWRIGHT_JSON_OUTPUT_NAME=${jsonName} && npx playwright test ${casePath} ${grepPattern} --reporter=json ${traceOption} ${workersOption} ${outputOption} ${extraArgs}`;
    }
  } else {
    // 使用原始的重定向方式
    if (testCases.length === 0) {
      // 在 fileMode 下，即使没有具体测试用例，也要指定文件路径
      if (fileMode) {
        command = `npx playwright test ${casePath} --reporter=json ${traceOption} ${workersOption} ${outputOption} ${extraArgs} > ${jsonName}`;
      } else {
        command = `npx playwright test --reporter=json ${traceOption} ${workersOption} ${outputOption} ${extraArgs} > ${jsonName}`;
      }
    } else {
      command = `npx playwright test ${casePath} ${grepPattern} --reporter=json ${traceOption} ${workersOption} ${outputOption} ${extraArgs} > ${jsonName}`;
    }
  }

  // 生成测试标识符
  for (const testcase of testCases) {
    testIdentifiers.push(`${casePath}?${testcase}`);
  }

  log.info(`Generated command for test cases: ${command}`);
  return { command, testIdentifiers };
}

// 处理文件路径，移除项目路径前缀
export function handlePath(projPath: string, filePath: string): string {
  return filePath.replace(`${projPath}/`, "");
}

// 解析时间戳，返回开始时间、结束时间和持续时间
export function parseTimeStamp(
  startTime: string,
  duration: number,
): [number, number, number] {
  const startDate = zonedTimeToUtc(parseISO(startTime), "UTC");
  const endDate = addMilliseconds(startDate, duration);
  const startTimestamp = startDate.getTime() / 1000;
  const endTimestamp = endDate.getTime() / 1000;
  return [startTimestamp, endTimestamp, duration / 1000];
}

// 解析 JSON 内容并返回用例结果
export function parseJsonContent(
  projPath: string,
  data: Data,
  rootDir: string | null = null,
): Record<string, SpecResult[]> {
  log.info("开始解析 JSON 内容...");
  const rootPath = data.config.rootDir || rootDir;
  log.info(`使用根路径: ${rootPath}`);
  const caseResults: Record<string, SpecResult[]> = {};

  // 解析 suites 数组并处理用例结果
  const parseSuites = (suites: Suite[], currentRootPath: string | null) => {
    log.info(`正在解析 suites。suites 数量: ${suites.length}`);
    for (const suite of suites) {
      const desc = suite.title === suite.file ? "" : suite.title;
      log.info(`正在处理 suite: ${suite.title}`);

      if (suite.specs) {
        log.info(`发现 specs。specs 数量: ${suite.specs.length}`);
        for (const spec of suite.specs) {
          const specTitle = spec.title;
          log.info(`正在处理 spec: ${specTitle}`);
          const specFile = handlePath(
            projPath,
            `${currentRootPath}/${spec.file}`,
          );
          const specName = `${specFile}?${desc ? desc + " " : ""}${specTitle}`;
          log.info(`Spec 名称: ${specName}`);
          let specResult: SpecResult | null = null;

          if (spec.tests) {
            log.info(`发现 tests。tests 数量: ${spec.tests.length}`);
            for (const test of spec.tests) {
              let owner: string | null = null;
              let description: string | null = null;

              if (test.annotations) {
                for (const annotation of test.annotations) {
                  if (annotation.owner) {
                    owner = annotation.owner;
                  }
                  if (annotation.description) {
                    description = annotation.description;
                  }
                }
              }

              const results = test.results;
              const specProjectId = test.projectId;
              for (const result of results) {
                const [specStartTime, specEndTime, duration] = parseTimeStamp(
                  result.startTime,
                  result.duration,
                );
                const specErrorMsg = result.error ? result.error.message : "";
                let specErrorCtx = "";

                // 处理标准输出信息，将其添加到content中
                if (result.stdout && result.stdout.length > 0) {
                  log.info(`发现 stdout。stdout 数量: ${result.stdout.length}`);
                  specErrorCtx += "\n==== 标准输出 ====\n";
                  for (const output of result.stdout) {
                    specErrorCtx += output.text;
                  }
                }

                // 处理标准错误输出信息，也添加到content中
                if (result.stderr && result.stderr.length > 0) {
                  log.info(`发现 stderr。stderr 数量: ${result.stderr.length}`);
                  specErrorCtx += "\n==== 标准错误输出 ====\n";
                  for (const errOutput of result.stderr) {
                    specErrorCtx += errOutput.text;
                  }
                }

                // 处理错误信息
                if (result.errors) {
                  log.info(
                    `发现 errors。errors 数量: ${result.errors.length}`,
                  );
                  if (result.status !== "passed") {
                    specErrorCtx += "\n==== 错误信息 ====\n";
                  }
                  for (const error of result.errors) {
                    specErrorCtx += error.message + "\n";
                  }


                // 处理附件
                const testcaseAttachments: Attachment[] = [];
                if (result.attachments && result.attachments.length > 0) {
                  console.log(`发现 attachments 数量: ${result.attachments.length}`);
                  
                  // 直接使用系统临时目录
                  const targetDir = os.tmpdir();
                  console.log(`使用系统临时目录: ${targetDir}`);
                
                  for (const attachment of result.attachments) {
                    const attachmentName = attachment.name;
                    const attachmentPath = attachment.path;
                    
                    if (["screenshot", "video", "trace"].includes(attachmentName) && attachmentPath) {
                      try {
                        // 获取原始文件名和扩展名
                        const originalName = path.basename(attachmentPath);
                        const ext = path.extname(originalName);
                        const nameWithoutExt = path.basename(originalName, ext);
                        
                        // 添加时间戳创建新文件名，确保唯一性
                        const timestamp = new Date().getTime();
                        const fileName = `${nameWithoutExt}_${timestamp}${ext}`;
                        
                        // 构建新的文件路径
                        const newPath = path.join(targetDir, fileName);
                        
                        // 复制文件到临时目录
                        fs.copyFileSync(attachmentPath, newPath);
                        
                        // 使用新的文件路径创建 Attachment 对象
                        testcaseAttachments.push(
                          new Attachment(fileName, newPath, AttachmentType.FILE)
                        );
                        
                        console.log(`成功复制文件 ${fileName} 到 ${newPath}`);
                      } catch (error) {
                        const message = error instanceof Error ? error.message : "Unknown error";
                        log.error(`复制文件 ${attachmentPath} 失败: ${message}`);
                      }
                    }
                  }
                }
                
                  specResult = {
                    projectID: specProjectId,
                    result: result.status,
                    duration: duration,
                    startTime: specStartTime,
                    endTime: specEndTime,
                    message: specErrorMsg,
                    content: specErrorCtx, // 现在包含错误、stdout和stderr
                    owner: owner,
                    description: description,
                    attachments: testcaseAttachments,
                  };
                }
              }
            }

            if (!caseResults[specName]) {
              log.info(`为 ${specName} 添加新的 spec 结果`);
              caseResults[specName] = specResult ? [specResult] : [];
            } else {
              if (specResult) {
                log.info(`为 ${specName} 追加 spec 结果`);
                caseResults[specName].push(specResult);
              }
            }
          }
        }

        if (suite.suites) {
          log.info(`正在处理 suite 的嵌套 suites: ${suite.title}`);
          parseSuites(suite.suites, currentRootPath);
        }
      }
    };
  }
  parseSuites(data.suites, rootPath);

  log.info("完成 JSON 内容解析。");
  return caseResults;
}

// 解析 JSON 文件并返回用例结果
export function parseJsonFile(
  projPath: string,
  jsonFile: string,
  cases: string[],
): Record<string, SpecResult[]> {
  log.info(
    `function parseJsonFile: ${process.env.PLAYWRIGHT_JSON_OUTPUT_NAME}`,
  );
  const data = JSON.parse(fs.readFileSync(jsonFile, "utf-8"));
  const result = parseJsonContent(projPath, data);

  log.info(`Parse result from json: ${JSON.stringify(result, null, 2)}`);
  if (result && Object.keys(result).length > 0) {
    return result;
  } else {
    // 如果 result 为空，则调用 parseErrorCases 方法
    const testErrorResults = parseErrorCases(data, cases);
    log.info(`Parse result from error info: ${testErrorResults}`);
    return testErrorResults;
  }
}

export function createTempDirectory(): string {
  const prefix = "caseOutPut";
  const tempDirectory = path.join(os.homedir(), `${prefix}-${Date.now()}`);

  try {
    fs.mkdirSync(tempDirectory);
    log.info(`Temporary directory created: ${tempDirectory}`);
    return tempDirectory;
  } catch (error) {
    // 这里我们假设捕获的错误是 Error 类型的实例
    const message = error instanceof Error ? error.message : "Unknown error";
    log.error(`Failed to create temporary directory: ${message}`);
    throw error;
  }
}

// 执行命令列表并上报结果
export async function executeCommands(
  projPath: string,
  command: string,
  cases: string[],
  jsonFile: string,  // 接收jsonFile作为参数
  attachmentsPath: string,
): Promise<Record<string, SpecResult[]>> {
  const results: Record<string, SpecResult[]> = {};

  const { stdout, stderr } = await executeCommand(command);
  log.info(
    `Run cmdline: ${command} \n Run stdout: ${stdout}\nRun stderr: ${stderr}`,
  );


  // 检查 JSON 文件是否存在
  if (!fs.existsSync(jsonFile)) {
    console.error(`用例json文件不存在: ${jsonFile}`);
  } else {
    // 定义目标文件路径
    const targetFilePath = path.join(attachmentsPath, path.basename(jsonFile));

    // 复制文件
    fs.copyFileSync(jsonFile, targetFilePath);
    console.log(`文件已复制到: ${targetFilePath}`);
  }

  // 解析 JSON 文件并处理结果
  const testResults = parseJsonFile(projPath, jsonFile, cases);
  Object.assign(results, testResults);
  return testResults;
}

export function groupTestCasesByPath(
  testcases: string[],
): Record<string, string[]> {
  const groupedTestCases: Record<string, string[]> = {};

  testcases.forEach((testcase) => {
    let path: string;
    let name: string = "";

    // 检查测试用例是否包含问号
    const questionMarkIndex = testcase.indexOf("?");
    if (questionMarkIndex !== -1) {
      // 如果有问号，分割路径和名称
      path = testcase.substring(0, questionMarkIndex);
      name = testcase.substring(questionMarkIndex + 1);
    } else {
      // 如果没有问号，路径是整个测试用例，名称为空字符串
      path = testcase;
    }

    // 如果路径不存在，则初始化一个空数组
    if (!groupedTestCases[path]) {
      groupedTestCases[path] = [];
    }

    // 将测试用例名称添加到对应路径的数组中
    groupedTestCases[path].push(name);
  });

  log.info("Grouped test cases by path: ", groupedTestCases);

  return groupedTestCases;
}

export function createTestResults(
  output: Record<string, SpecResult[]>,
  testIdentifiers: string[],
): TestResult[] {
  const testResults: TestResult[] = [];
  const casePrefix = getTestcasePrefix();
  
  // 检查是否为 fileMode
  const fileMode = process.env.TESTSOLAR_TTP_FILEMODE == "1";
  
  // 首先找出参考失败用例（output中的key不在testIdentifiers中的）
  let referenceFailedTest: TestResult | null = null;
  
  // 处理output中的所有测试用例
  for (const [testCase, results] of Object.entries(output)) {
    // 构建完整的测试路径
    const fullTestPath = `${casePrefix}${testCase}`;
    
    // 判断当前测试用例是否在testIdentifiers中
    let isInTestIdentifiers = testIdentifiers.includes(testCase);
    
    // 在 fileMode 下，需要检查测试用例是否属于指定的文件
    if (fileMode && !isInTestIdentifiers) {
      // 提取测试用例的文件路径部分（问号之前的部分）
      const testFilePath = testCase.split('?')[0];
      isInTestIdentifiers = testIdentifiers.includes(testFilePath);
    }
    
    // 处理每个结果
    for (const result of results) {
      const testPath = encodeQueryParams(fullTestPath);
      const test = new TestCase(testPath, { "owner": result.owner || "", "description": result.description || "" });
      
      const startTime = new Date(result.startTime * 1000).toISOString();
      const endTime = new Date(result.endTime * 1000).toISOString();
      const resultType = result.result === "passed" ? ResultType.SUCCEED : ResultType.FAILED;
      const message = result.message || "";
      const content = result.content || "";
      const attachments = result.attachments || [];

      const testLog = new TestCaseLog(
        startTime,
        result.result === "passed" ? LogLevel.INFO : LogLevel.ERROR,
        content,
        attachments,
        undefined,
        undefined,
      );

      const testStep = new TestCaseStep(
        startTime,
        endTime,
        "Step title",
        resultType,
        [testLog],
      );

      const testResult = new TestResult(
        test,
        startTime,
        endTime,
        resultType,
        message,
        [testStep],
      );
      
      // 如果该测试不在testIdentifiers中且结果是失败的，将其作为参考失败用例
      if (!isInTestIdentifiers && resultType === ResultType.FAILED && !referenceFailedTest) {
        referenceFailedTest = testResult;
      }
      
      // 如果该测试在testIdentifiers中，将结果添加到testResults
      if (isInTestIdentifiers) {
        testResults.push(testResult);
      }
    }
  }

  // 确保每个testIdentifier都有对应的测试结果
  for (const identifier of testIdentifiers) {
    // 检查是否已经在结果中
    const hasResult = testResults.some(result => {
      // 去除casePrefix，然后解码比较
      const decodedPath = decodeURIComponent(result.Test.Name.replace(casePrefix, ''));
      return decodedPath === identifier;
    });
    
    // 如果没有结果并且有参考失败用例，则创建一个相应的失败结果
    if (!hasResult && referenceFailedTest) {
      // 创建一个新的TestCase，使用identifier作为path
      const fullIdentifierPath = encodeQueryParams(`${casePrefix}${identifier}`);
      const newTest = new TestCase(fullIdentifierPath, {
        owner: referenceFailedTest.Test.Attributes.owner,
        description: referenceFailedTest.Test.Attributes.description
      });
      
      // 创建一个新的TestResult，复制参考失败测试的其他属性
      const newResult = new TestResult(
        newTest,
        referenceFailedTest.StartTime,
        referenceFailedTest.EndTime,
        ResultType.FAILED, // 确保是失败状态
        `No test results found for this identifier: ${identifier}`, // 自定义消息
        referenceFailedTest.Steps.slice() // 复制steps数组
      );
      
      // 添加到结果数组
      testResults.push(newResult);
    }
  }

  return testResults;
}


export function getTestcasePrefix() {
  const testcasePrefix = process.env.TESTSOLAR_TTP_TESTCASE_PREFIX || "";
  if (testcasePrefix === "") {
    return "";
  }
  const normalizedTestcasePrefix = testcasePrefix.endsWith('/') ? testcasePrefix : testcasePrefix + '/';
  return normalizedTestcasePrefix;
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

// 扫描目录中的Playwright测试文件（排除node_modules）
export function scanPlaywrightTestFiles(directory: string): string[] {
  const testCases: string[] = [];
  // 匹配Playwright测试文件的模式
  const testPattern = /test\(['"`]/;

  function readDirRecursive(dir: string) {
    // 如果路径中包含node_modules，则跳过该目录
    if (dir.includes("node_modules")) {
      return;
    }

    try {
      const files = fs.readdirSync(dir);

      files.forEach((file) => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          readDirRecursive(fullPath);
        } else if (file.endsWith(".spec.js") || file.endsWith(".spec.ts") || 
                   file.endsWith(".test.js") || file.endsWith(".test.ts") ||
                   file.endsWith(".e2e.js") || file.endsWith(".e2e.ts")) {
          const content = fs.readFileSync(fullPath, "utf-8");
          if (testPattern.test(content)) {
            testCases.push(fullPath);
          }
        }
      });
    } catch (error) {
      console.error(`Error reading directory ${dir}:`, error);
    }
  }

  readDirRecursive(directory);
  return testCases;
}

export async function createRunningTestResults(
  path: string,
  names: string[],
  reporter: Reporter,
): Promise<void>{
  const testResults: TestResult[] = [];
  const casePrefix = getTestcasePrefix();
  const currentTime = new Date().toISOString();
  
  // 遍历每个测试名称
  for (const name of names) {
    // 构建完整测试用例路径
    const fullTestCase = name ? `${path}?${name}` : path;
    
    // 创建TestCase实例
    const test = new TestCase(
      encodeQueryParams(`${casePrefix}${fullTestCase}`), 
      {}
    );
    
    // 创建测试日志
    const testLog = new TestCaseLog(
      currentTime,
      LogLevel.INFO,
      "",
      [], // 无附件
      undefined, // 无断言错误
      undefined, // 无运行时错误
    );
    
    // 创建测试步骤
    const testStep = new TestCaseStep(
      currentTime, // 开始时间
      undefined, // 结束时间设为相同值，因为测试仍在运行
      "",
      ResultType.RUNNING,
      [testLog],
    );
    
    // 创建测试结果
    const testResult = new TestResult(
      test,
      currentTime, // 开始时间
      currentTime, // 结束时间设为相同值，因为测试仍在运行
      ResultType.RUNNING, // 结果类型设为RUNNING
      "", // 状态消息
      [testStep],
    );
    
    // 添加到结果数组
    testResults.push(testResult);
  }
  for (const result of testResults) {
    await reporter.reportTestResult(result);
  }
}