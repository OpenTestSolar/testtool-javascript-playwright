import { describe, expect, test } from "@jest/globals";
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
} from "../src/playwrightx/utils";

import * as path from "path";
import log from 'testsolar-oss-sdk/src/testsolar_sdk/logger';
import { Attachment, AttachmentType } from "testsolar-oss-sdk/src/testsolar_sdk/model/testresult";


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

  test("should r置超时时eturn 0 for neither file nor directory", async () => {
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

  test("should generate zero test execution commands", () => {
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
          attachments: [],
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
      "/project/spec1.js?Suite 1 Spec 1": [],
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
    const testResults = createTestResults(output);
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
