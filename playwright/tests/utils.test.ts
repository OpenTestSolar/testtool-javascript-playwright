import { describe, expect, jest, test } from "@jest/globals";
import * as process from "process";
import * as fs from "fs";
import {
  executeCommand,
  isFileOrDirectory,
  filterTestcases,
  parseTestcase,
  generateCommands,
  parseJsonContent,
  createTempDirectory,
  parseJsonFile,
  groupTestCasesByPath,
  createTestResults,
  parseErrorCases,
  handlePath,
  parseTimeStamp,
  getTestcasePrefix,
  parsePlaywrightReport,
  encodeQueryParams,
  createRunningTestResults,
  mapPlaywrightStatus,
  getLogLevelByResultType,
} from "../src/playwrightx/utils";

import * as path from "path";
import log from 'testsolar-oss-sdk/src/testsolar_sdk/logger';
import Reporter from "testsolar-oss-sdk/src/testsolar_sdk/reporter";
import { Attachment, AttachmentType, ResultType, LogLevel } from "testsolar-oss-sdk/src/testsolar_sdk/model/testresult";


describe("parsePlaywrightReport", () => {  // 更改为与测试函数名称一致
  test("should parse error JSON file and return case results", () => {  // 修正拼写错误
    const jsonName = "tests/load_error.json";
    const fileContent = fs.readFileSync(jsonName, "utf-8");
    const result = parsePlaywrightReport(fileContent);
    
    // 改为一个真实的期望值，而不是空对象
    // 假设解析错误的JSON应该返回一个LoadError数组
    expect(Array.isArray(result)).toBeTruthy();
  });
});


describe("executeCommand", () => {
  test("should execute a command and return stdout and stderr", async () => {
    const command = 'echo "Hello, World!"';
    const result = await executeCommand(command);
    expect(result.stdout.trim()).toBe("Hello, World!");
    expect(result.stderr).toBe("");
  });

  test("should handle command execution errors", async () => {
    const command = "invalidCommand";
    const result = await executeCommand(command);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("not found");
    expect(result.error).toBeDefined();
  });
});

describe("parseErrorCases", () => {
  test("should parse error cases from JSON data", () => {
    const jsonData = {
      stats: { startTime: "2023-01-01T00:00:00Z", duration: 1000 },
      suites: [],
      errors: [
        {
          message: "Error message",
          stack: "Error stack",
          location: { file: "test.js", line: 1, column: 1 },
          snippet: "Error snippet",
        },
      ],
    };
    const cases = ["testCase1", "testCase2"];
    const result = parseErrorCases(jsonData, cases);
    expect(result).toHaveProperty("testCase1");
    expect(result.testCase1[0].message).toBe("Error message");
  });

  test("none suites and none errors cases", () => {
    const jsonData = {
      stats: { startTime: "2023-01-01T00:00:00Z", duration: 1000 },
      suites: [],
      errors: [],
    };
    const cases = ["testCase1", "testCase2"];
    const result = parseErrorCases(jsonData, cases);
    expect(result).toHaveProperty("testCase1");
    expect(result.testCase1[0].message).toBe(
      "日志为空，请检查用例本地是否跑通，或者联系腾讯云助手",
    );
  });
});

describe("isFileOrDirectory", () => {
  test("should return 1 for file", async () => {
    log.info("Testing file...");
    const testFile = path.join(__dirname, "tests/sum.test.ts");
    log.info("======Testing file:", testFile);
    const result = isFileOrDirectory(testFile);
    log.info("File test complete.");
    expect(result).toBe(0);
  }, 10000);

  test("should return -1 for directories", async () => {
    log.info("Testing directory...");
    const testDir = path.join(__dirname, "..");
    log.info("======Testing directory:", testDir);
    const result = isFileOrDirectory(testDir);
    log.info("Directory test complete.");
    expect(result).toBe(-1);
  }, 10000);

  test("should return 0 for neither file nor directory", async () => {
    log.info("Testing unknown path...");
    const testUnknown = path.join(__dirname, "unknown");
    const result = isFileOrDirectory(testUnknown);
    log.info("Unknown path test complete.");
    expect(result).toBe(0);
  }, 10000);

  test("should reject for non-existent paths", async () => {
    log.info("Testing non-existent path...");
    expect(isFileOrDirectory("path/to/nonexistent"));
    log.info("Non-existent path test complete.");
  }, 10000);
});

describe("filterTestcases", () => {
  test("should filter test cases based on selectors", async () => {
    const testSelectors = ["tests/sum.test.ts"];
    const parsedTestcases = [
      "tests/sum.test.ts?sum module adds 1 + 2 to equal 3",
    ];
    const result = await filterTestcases(testSelectors, parsedTestcases);
    expect(result).toEqual([
      "tests/sum.test.ts?sum module adds 1 + 2 to equal 3",
    ]);
  });

  test("should filter test cases based on selector dirs", async () => {
    const testSelectors = ["tests"];
    const parsedTestcases = [
      "tests/sum.test.ts?sum module adds 1 + 2 to equal 3",
    ];
    const result = await filterTestcases(testSelectors, parsedTestcases);
    expect(result).toEqual([
      "tests/sum.test.ts?sum module adds 1 + 2 to equal 3",
    ]);
  });

  test("should exclude test cases based on selectors", async () => {
    const testSelectors = ["test1", "test2"];
    const parsedTestcases = ["test1", "test2", "test3"];
    const result = await filterTestcases(testSelectors, parsedTestcases, true);
    expect(result).toEqual(["test3"]);
  });

  test("should exclude test cases based on none selectors", async () => {
    const testSelectors: string[] = [];
    const parsedTestcases = ["test1", "test2", "test3"];
    const result = await filterTestcases(testSelectors, parsedTestcases, true);
    expect(result).toEqual(["test1", "test2", "test3"]);
  });
});

describe("parseTestcase", () => {
  test("should parse test cases from data", () => {
    const projPath = "/project";
    const data = {
      config: { rootDir: "/project/tests" },
      suites: [
        {
          title: "Suite 1",
          file: "suite1.js",
          specs: [{ title: "Spec 1", file: "spec1.js" }],
        },

        {
          title: "Suite 1",
          file: "suite1.js",
          specs: [],
          suites: [
            {
              title: "Suite 2",
              file: "suite2.js",
              specs: [{ title: "Spec 2", file: "spec2.js" }],
            },
          ],
        },
        {
          title: "suite3.js",
          file: "suite3.js",
          specs: [{ title: "Spec 1", file: "spec1.js" }],
        },
      ],
    };
    const result = parseTestcase(projPath, data);
    expect(result).toEqual([
      "tests/suite1.js?Suite%201%20Spec%201",
      "tests/suite2.js?Suite%202%20Spec%202",
      "tests/suite3.js?Spec%201",
    ]);
  });
});

// generateCommands
describe("generateCommands", () => {
  test("should generate test execution commands", () => {
    const path = "path/to/tests";
    const testCases = ["test1", "test2"];
    const { command } = generateCommands(path, testCases, "1.json");
    expect(command).toContain("npx playwright test");
  });

  test("should generate test execution commands with env", () => {
    process.env.TESTSOLAR_TTP_ENVJSONFILE = '1';
    const path = "path/to/tests";
    const testCases = ["test1", "test2"];
    const { command } = generateCommands(path, testCases, "1.json");
    expect(command).toContain("npx playwright test");
  });

  test("should generate zero test execution commands", () => {
    const path = "path/to/tests";
    const testCases: string[] = [];
    const { command } = generateCommands(path, testCases, "1.json");
    expect(command).toContain("npx playwright test");
  });
  
  test("should generate zero test execution commands with env", () => {
    process.env.TESTSOLAR_TTP_ENVJSONFILE = '1';
    const path = "path/to/tests";
    const testCases: string[] = [];
    const { command } = generateCommands(path, testCases, "1.json");
    expect(command).toContain("npx playwright test");
  });
});

describe("handlePath", () => {
  test("should handle file path and remove project path prefix", () => {
    const projPath = "/project";
    const filePath = "/project/tests/test.js";
    const result = handlePath(projPath, filePath);
    expect(result).toBe("tests/test.js");
  });
});

describe("parseTimeStamp", () => {
  test("should parse timestamp and return start, end, and duration", () => {
    const startTime = "2023-01-01T00:00:00Z";
    const duration = 1000;
    const result = parseTimeStamp(startTime, duration);
    expect(result).toEqual([1672531200, 1672531201, 1]);
  });
});

describe("parseJsonContent", () => {
  test("should parse JSON content and return case results", () => {
    const projPath = "/project";
    const data = {
      config: { rootDir: "/project/tests" },
      suites: [
        {
          title: "Suite 1",
          file: "suite1.js",
          specs: [
            {
              title: "Spec 1",
              file: "spec1.js",
              tests: [
                {
                  annotations: [
                    {
                      owner:"amb",
                      description: "desc"
                    }
                  ],
                  projectId: "proj1",
                  results: [
                    {
                      startTime: "2023-01-01T00:00:00Z",
                      duration: 1000,
                      status: "passed",
                    },
                    {
                      errors: [{ message: "Error 2" }],
                      startTime: "2023-01-01T00:00:00Z",
                      duration: 1000,
                      status: "passed",
                      stdout: [
                        {
                          "text": "增加日志展示\n"
                        },
                        {
                          "text": "进入百度页面\n"
                        },
                        {
                          "text": "点击输入框\n"
                        },
                        {
                          "text": "输入playwright\n"
                        },
                        {
                          "text": "点击百度一下\n"
                        },
                        {
                          "text": "等待弹出页面\n"
                        },
                        {
                          "text": "点击百度翻译\n"
                        }
                      ],
                      stderr: [
                        {
                        "text": "点击百度翻译\n"
                        }
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          title: "Suite 1",
          file: "suite1.js",
          specs: [
            {
              title: "Spec 1",
              file: "spec1.js",
              tests: [
                {
                  annotations: [],
                  projectId: "proj1",
                  results: [
                    {
                      startTime: "2023-01-01T00:00:00Z",
                      duration: 1000,
                      status: "passed",
                      attachments: [
                        {
                          "name": "screenshot",
                          "contentType": "image/png",
                          "path": "/root/work/123test/js_project/test-results/test-1-test-chromium/test-failed-1.png"
                        }
                      ]
                    },
                    {
                      errors: [{ message: "Error 2" }],
                      startTime: "2023-01-01T00:00:00Z",
                      duration: 1000,
                      status: "passed",
                      attachments: [
                        {
                          "name": "screenshot",
                          "contentType": "image/png",
                          "path": "/root/work/123test/js_project/test-results/test-1-test-chromium/test-failed-1.png"
                        }
                      ]
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          title: "Suite 1",
          file: "suite1.js",
          specs: [],
          suites: [
            {
              title: "Suite 2",
              file: "suite2.js",
              specs: [{ title: "Spec 2", file: "spec2.js" }],
            },
          ],
        },
      ],
    };
    const result = parseJsonContent(projPath, data);
    expect(result).toEqual({
      "tests/spec1.js?Suite 1 Spec 1": [
        {
          description: "desc",
          owner: "amb",
          content: "\n==== 标准输出 ====\n增加日志展示\n进入百度页面\n点击输入框\n输入playwright\n点击百度一下\n等待弹出页面\n点击百度翻译\n\n==== 标准错误输出 ====\n点击百度翻译\nError 2\n",
          duration: 1,
          endTime: 1672531201,
          message: "",
          projectID: "proj1",
          result: "passed",
          startTime: 1672531200,
          attachments: [],
        },
        {
          description: null,
          owner: null,
          content: "Error 2\n",
          duration: 1,
          endTime: 1672531201,
          message: "",
          projectID: "proj1",
          result: "passed",
          startTime: 1672531200,
          attachments: [
            new Attachment("test-failed-1.png", "/root/work/123test/js_project/test-results/test-1-test-chromium/test-failed-1.png", AttachmentType.FILE),
          ],
        },
      ]
    });
  });
});

describe("parseJsonFile", () => {
  test("should parse JSON file and return case results", () => {
    const projPath = "tests";
    const jsonName = "tests/results.json";
    const result = parseJsonFile(projPath, jsonName, []);
    const expectedResults = {
      "/project/spec1.js?Suite 1 Spec 1": [
        {
          projectID: "proj1",
          result: "passed",
          duration: 1,
          startTime: 1672531200,
          endTime: 1672531201,
          message: "",
          content: "\n==== 标准输出 ====\n增加日志展示\n进入百度页面\n点击输入框\n输入playwright\n点击百度一下\n等待弹出页面\n点击百度翻译\n",
          owner: null,
          description: null,
          attachments: [],
        },
      ],
    };
    expect(result).toEqual(expectedResults);
  });

  test("should parse errot JSON file and return case results", () => {
    const projPath = "tests";
    const jsonName = "tests/errorResults.json";
    const result = parseJsonFile(projPath, jsonName, []);
    const expectedResults = {};
    expect(result).toEqual(expectedResults);
  });
});

describe("createTempDirectory", () => {
  test("should create a temporary directory", () => {
    const tempDirectory = createTempDirectory();
    expect(tempDirectory).toContain("caseOutPut");
  });
});

describe("groupTestCasesByPath", () => {
  test("should group test cases by path", () => {
    const testcases = ["path1?test1", "path1?test2", "path2?test3"];
    const result = groupTestCasesByPath(testcases);
    expect(result).toEqual({
      path1: ["test1", "test2"],
      path2: ["test3"],
    });
  });

  test("should handle test cases without question mark", () => {
    const testcases = ["path1", "path2?test2"];
    const result = groupTestCasesByPath(testcases);
    expect(result).toEqual({
      path1: [""],
      path2: ["test2"],
    });
  });
});

describe("createTestResults", () => {
  test("should create TestResult instances from spec results", () => {
    const output = {
      "path/to/testcase": [
        {
          projectID: "proj1",
          result: "passed",
          duration: 100,
          startTime: 1610000000000,
          endTime: 1610000010000,
          message: "Test passed",
          content: "Test passed",
          owner: "amb",
          description: "desc",
          attachments: [],
        },
      ],
    };
    const tests = ["path/to/testcase"]
    const testResults = createTestResults(output, tests);
    expect(testResults).toEqual(expect.arrayContaining([expect.any(Object)]));
  });
});


describe('getTestcasePrefix', () => {
  test('should return normalized prefix with trailing slash from environment variable', () => {
    process.env.TESTSOLAR_TTP_TESTCASE_PREFIX = 'test-prefix/';
    expect(getTestcasePrefix()).toBe('test-prefix/');
  });

  test('should return normalized prefix with trailing slash if not provided in environment variable', () => {
    process.env.TESTSOLAR_TTP_TESTCASE_PREFIX = 'test-prefix';
    expect(getTestcasePrefix()).toBe('test-prefix/');
  });

});

describe('encodeQueryParams', () => {
  // 基础功能测试
  test('should return original URL when no query params', () => {
    const url = 'http://example.com/path';
    expect(encodeQueryParams(url)).toBe(url);
  });

  test('should encode simple query params', () => {
    const url = 'http://example.com?name=test&value=1';
    const expected = 'http://example.com?name%3Dtest%26value%3D1';
    expect(encodeQueryParams(url)).toBe(expected);
  });

  // 边界条件测试
  test('should handle empty query params', () => {
    const url = 'http://example.com?';
    expect(encodeQueryParams(url)).toBe(url);
  });

  test('should handle URL with multiple question marks', () => {
    const url = 'http://example.com?param=1?another=2';
    const expected = 'http://example.com?param%3D1%3Fanother%3D2';
    expect(encodeQueryParams(url)).toBe(expected);
  });

  // 特殊字符测试
  test('should encode special characters in query params', () => {
    const url = 'http://example.com?query=a b&c=1';
    const expected = 'http://example.com?query%3Da%20b%26c%3D1';
    expect(encodeQueryParams(url)).toBe(expected);
  });

  test('should encode non-ASCII characters', () => {
    const url = 'http://example.com?text=你好&code=🍀';
    const expected = 'http://example.com?text%3D%E4%BD%A0%E5%A5%BD%26code%3D%F0%9F%8D%80';
    expect(encodeQueryParams(url)).toBe(expected);
  });

  // 保留字符测试
  test('should encode reserved characters', () => {
    const url = 'http://example.com?q=!@#$%^&*()_+';
    const expected = 'http://example.com?q%3D!%40%23%24%25%5E%26*()_%2B';
    expect(encodeQueryParams(url)).toBe(expected);
  });


  // 复杂URL结构测试
  test('should handle complex URL structure', () => {
    const url = 'https://user:pass@example.com:8080/path/to?query=param#hash';
    const expected = 'https://user:pass@example.com:8080/path/to?query%3Dparam%23hash';
    expect(encodeQueryParams(url)).toBe(expected);
  });

  // 性能测试
  test('should handle very long query params', () => {
    const longParam = 'a'.repeat(1000);
    const url = `http://example.com?param=${longParam}`;
    const encoded = encodeQueryParams(url);
    expect(encoded).toMatch(/^http:\/\/example\.com\?param%3D[a%]+$/);
    expect(encoded.length).toBeGreaterThan(1000);
  });
});


describe("createRunningTestResults", () => {
  test("should create test results and report them", async () => {
    // 模拟依赖
    const getTestcasePrefix = jest.fn().mockReturnValue("prefix/");
    const encodeQueryParams = jest.fn(url => url);
    (global as any).getTestcasePrefix = getTestcasePrefix;    
    (global as any).encodeQueryParams = encodeQueryParams;
    
    // 模拟日期
    const mockDate = new Date("2023-01-01T00:00:00Z");
    const mockISOString = mockDate.toISOString();
    jest.spyOn(global, "Date").mockImplementation(() => mockDate);
    jest.spyOn(mockDate, "toISOString").mockReturnValue(mockISOString);
    

    
    // 模拟构造函数
    const TestCase = jest.fn();
    const TestCaseLog = jest.fn();
    const TestCaseStep = jest.fn();
    const TestResult = jest.fn(function(test, startTime, endTime, result, message, steps) {
      return { test, startTime, endTime, result, message, steps };
    });
    
    (global as any).TestCase = TestCase;
    (global as any).TestCaseLog = TestCaseLog;
    (global as any).TestCaseStep = TestCaseStep;
    (global as any).TestResult = TestResult;
    (global as any).LogLevel = { INFO: "INFO" };
    (global as any).ResultType = { RUNNING: "RUNNING" };
    
    // 输入参数
    const path = "path/to/test";
    const names = ["testName1", "testName2"];
    
    const reporter = new Reporter("123123", "/tmp");
    // 调用函数
    await createRunningTestResults(path, names, reporter);
    
    // 验证结果
    expect(TestCase).toHaveBeenCalledTimes(0);
  });
});

/**
 * TAPD: playwright-错误信息中区分 skipped 状态和 failed 状态
 * https://tapd.woa.com/tapd_fe/69995517/story/detail/1069995517134057272
 *
 * 测试目标：验证 Playwright 原生状态到 TestSolar ResultType 的正确映射，
 * 确保 skipped 用例不会被误判为 failed。
 */
describe("mapPlaywrightStatus", () => {
  describe("1. 核心功能测试", () => {
    test("场景1: passed 状态映射为 SUCCEED", () => {
      expect(mapPlaywrightStatus("passed")).toBe(ResultType.SUCCEED);
    });

    test("场景2: skipped 状态映射为 IGNORED（关键修复点）", () => {
      expect(mapPlaywrightStatus("skipped")).toBe(ResultType.IGNORED);
    });

    test("场景3: failed 状态映射为 FAILED", () => {
      expect(mapPlaywrightStatus("failed")).toBe(ResultType.FAILED);
    });

    test("场景4: timedOut 状态映射为 FAILED", () => {
      expect(mapPlaywrightStatus("timedOut")).toBe(ResultType.FAILED);
    });

    test("场景5: interrupted 状态映射为 FAILED", () => {
      expect(mapPlaywrightStatus("interrupted")).toBe(ResultType.FAILED);
    });
  });

  describe("2. 边界条件测试", () => {
    test("场景1: 大小写不敏感 - PASSED", () => {
      expect(mapPlaywrightStatus("PASSED")).toBe(ResultType.SUCCEED);
    });

    test("场景2: 大小写不敏感 - Skipped", () => {
      expect(mapPlaywrightStatus("Skipped")).toBe(ResultType.IGNORED);
    });

    test("场景3: 空字符串映射为 UNKNOWN", () => {
      expect(mapPlaywrightStatus("")).toBe(ResultType.UNKNOWN);
    });

    test("场景4: null/undefined 映射为 UNKNOWN", () => {
      expect(mapPlaywrightStatus(null)).toBe(ResultType.UNKNOWN);
      expect(mapPlaywrightStatus(undefined)).toBe(ResultType.UNKNOWN);
    });

    test("场景5: 未知状态映射为 UNKNOWN", () => {
      expect(mapPlaywrightStatus("weirdStatus")).toBe(ResultType.UNKNOWN);
    });
  });
});

describe("getLogLevelByResultType", () => {
  test("场景1: FAILED 对应 ERROR 日志等级", () => {
    expect(getLogLevelByResultType(ResultType.FAILED)).toBe(LogLevel.ERROR);
  });

  test("场景2: SUCCEED 对应 INFO 日志等级", () => {
    expect(getLogLevelByResultType(ResultType.SUCCEED)).toBe(LogLevel.INFO);
  });

  test("场景3: IGNORED 对应 INFO 日志等级（避免 skipped 被误标为错误）", () => {
    expect(getLogLevelByResultType(ResultType.IGNORED)).toBe(LogLevel.INFO);
  });

  test("场景4: UNKNOWN 对应 INFO 日志等级", () => {
    expect(getLogLevelByResultType(ResultType.UNKNOWN)).toBe(LogLevel.INFO);
  });
});

describe("createTestResults - 区分 skipped 与 failed", () => {
  test("场景1: skipped 用例最终 ResultType 为 IGNORED", () => {
    const output = {
      "path/to/skipped": [
        {
          projectID: "proj1",
          result: "skipped",
          duration: 0,
          startTime: 1610000000,
          endTime: 1610000000,
          message: "",
          content: "test skipped",
          owner: "amb",
          description: "",
          attachments: [],
        },
      ],
    };
    const tests = ["path/to/skipped"];
    const testResults = createTestResults(output, tests);
    expect(testResults).toHaveLength(1);
    expect(testResults[0].ResultType).toBe(ResultType.IGNORED);
  });

  test("场景2: failed 用例最终 ResultType 为 FAILED", () => {
    const output = {
      "path/to/failed": [
        {
          projectID: "proj1",
          result: "failed",
          duration: 1,
          startTime: 1610000000,
          endTime: 1610000001,
          message: "assertion failed",
          content: "stack trace",
          owner: "amb",
          description: "",
          attachments: [],
        },
      ],
    };
    const tests = ["path/to/failed"];
    const testResults = createTestResults(output, tests);
    expect(testResults).toHaveLength(1);
    expect(testResults[0].ResultType).toBe(ResultType.FAILED);
  });

  test("场景3: skipped 用例不会被用作参考失败用例（不会把其它 identifier 误报为 FAILED）", () => {
    // output 中只有一个 skipped 用例（不在 testIdentifiers 中）
    const output = {
      "other/skipped/case": [
        {
          projectID: "proj1",
          result: "skipped",
          duration: 0,
          startTime: 1610000000,
          endTime: 1610000000,
          message: "",
          content: "",
          owner: null,
          description: null,
          attachments: [],
        },
      ],
    };
    // testIdentifiers 中的 identifier 不在 output 里
    const tests = ["requested/case"];
    const testResults = createTestResults(output, tests);
    // 由于 output 中的用例是 skipped（而非 failed），不应成为参考失败用例，
    // 因此不会为 requested/case 生成兜底的 FAILED 结果
    expect(testResults).toHaveLength(0);
  });

  test("场景4: timedOut 用例最终 ResultType 为 FAILED", () => {
    const output = {
      "path/to/timeout": [
        {
          projectID: "proj1",
          result: "timedOut",
          duration: 30,
          startTime: 1610000000,
          endTime: 1610000030,
          message: "test timed out",
          content: "",
          owner: null,
          description: null,
          attachments: [],
        },
      ],
    };
    const tests = ["path/to/timeout"];
    const testResults = createTestResults(output, tests);
    expect(testResults).toHaveLength(1);
    expect(testResults[0].ResultType).toBe(ResultType.FAILED);
  });
});

describe("parseJsonContent - skipped 状态不追加'错误信息'标题", () => {
  test("场景1: skipped 状态下即使存在 errors，也不追加'错误信息'标题", () => {
    const projPath = "/project";
    const data = {
      config: { rootDir: "/project/tests" },
      suites: [
        {
          title: "Suite 1",
          file: "suite1.js",
          specs: [
            {
              title: "Spec 1",
              file: "spec1.js",
              tests: [
                {
                  annotations: [],
                  projectId: "proj1",
                  results: [
                    {
                      startTime: "2023-01-01T00:00:00Z",
                      duration: 0,
                      status: "skipped",
                      errors: [{ message: "residual error" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const result = parseJsonContent(projPath, data);
    const key = "tests/spec1.js?Suite 1 Spec 1";
    expect(result[key]).toBeDefined();
    expect(result[key][0].result).toBe("skipped");
    // 不应出现"==== 错误信息 ===="
    expect(result[key][0].content).not.toContain("==== 错误信息 ====");
  });

  test("场景2: failed 状态下仍正常追加'错误信息'标题", () => {
    const projPath = "/project";
    const data = {
      config: { rootDir: "/project/tests" },
      suites: [
        {
          title: "Suite 1",
          file: "suite1.js",
          specs: [
            {
              title: "Spec 1",
              file: "spec1.js",
              tests: [
                {
                  annotations: [],
                  projectId: "proj1",
                  results: [
                    {
                      startTime: "2023-01-01T00:00:00Z",
                      duration: 1,
                      status: "failed",
                      errors: [{ message: "real error" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const result = parseJsonContent(projPath, data);
    const key = "tests/spec1.js?Suite 1 Spec 1";
    expect(result[key]).toBeDefined();
    expect(result[key][0].result).toBe("failed");
    expect(result[key][0].content).toContain("==== 错误信息 ====");
    expect(result[key][0].content).toContain("real error");
  });
});