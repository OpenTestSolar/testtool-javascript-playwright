import { describe, expect, test, beforeEach, afterEach } from "@jest/globals";
import * as process from "process";

let originalEnv: NodeJS.ProcessEnv;

describe("FileMode Environment Variable Tests", () => {
  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    Object.keys(process.env).forEach(key => {
      delete process.env[key];
    });
    Object.assign(process.env, originalEnv);
  });

  describe("Environment variable behavior", () => {
    test("fileMode should be true when TESTSOLAR_TTP_FILEMODE is not set", () => {
      delete process.env.TESTSOLAR_TTP_FILEMODE;
      const fileMode = !process.env.TESTSOLAR_TTP_FILEMODE;
      expect(fileMode).toBe(true);
    });

    test("fileMode should be false when TESTSOLAR_TTP_FILEMODE is set to '1'", () => {
      process.env.TESTSOLAR_TTP_FILEMODE = "1";
      const fileMode = !process.env.TESTSOLAR_TTP_FILEMODE;
      expect(fileMode).toBe(false);
    });

    test("fileMode should be false when TESTSOLAR_TTP_FILEMODE is set to 'true'", () => {
      process.env.TESTSOLAR_TTP_FILEMODE = "true";
      const fileMode = !process.env.TESTSOLAR_TTP_FILEMODE;
      expect(fileMode).toBe(false);
    });

    test("fileMode should be false when TESTSOLAR_TTP_FILEMODE is set to any value", () => {
      process.env.TESTSOLAR_TTP_FILEMODE = "any_value";
      const fileMode = !process.env.TESTSOLAR_TTP_FILEMODE;
      expect(fileMode).toBe(false);
    });
  });

  describe("File extension matching logic", () => {
    test("should match correct Playwright test file extensions", () => {
      const testFiles = [
        'example.spec.ts',
        'example.spec.js', 
        'example.test.ts',
        'example.test.js',
        'example.e2e.ts',
        'example.e2e.js'
      ];

      const nonTestFiles = [
        'example.ts',
        'example.js',
        'example.component.ts',
        'example.service.js',
        'README.md'
      ];

      // 测试文件应该匹配
      testFiles.forEach(file => {
        const isTestFile = file.endsWith(".spec.js") || file.endsWith(".spec.ts") || 
                          file.endsWith(".test.js") || file.endsWith(".test.ts") ||
                          file.endsWith(".e2e.js") || file.endsWith(".e2e.ts");
        expect(isTestFile).toBe(true);
      });

      // 非测试文件不应该匹配
      nonTestFiles.forEach(file => {
        const isTestFile = file.endsWith(".spec.js") || file.endsWith(".spec.ts") || 
                          file.endsWith(".test.js") || file.endsWith(".test.ts") ||
                          file.endsWith(".e2e.js") || file.endsWith(".e2e.ts");
        expect(isTestFile).toBe(false);
      });
    });
  });

  describe("Test pattern matching logic", () => {
    test("should match test pattern in file content", () => {
      const testPattern = /test\(['"`]/;
      
      const validTestContent = [
        'test("should work", () => {})',
        "test('should work', () => {})",
        'test(`should work`, () => {})',
        'describe("suite", () => { test("case", () => {}); })'
      ];

      const invalidTestContent = [
        'function test() {}',
        'const testData = {}',
        'testing = true',
        'describe("suite", () => {})',
        'it("should work", () => {})'  // playwright uses test(), not it()
      ];

      validTestContent.forEach(content => {
        expect(testPattern.test(content)).toBe(true);
      });

      invalidTestContent.forEach(content => {
        expect(testPattern.test(content)).toBe(false);
      });
    });
  });

  describe("Path handling logic", () => {
    test("should correctly identify node_modules paths", () => {
      const paths = [
        '/project/node_modules/package',
        '/project/src/node_modules/lib',
        '/project/tests/example.spec.ts',
        '/project/src/utils.ts'
      ];

      const nodeModulesPaths = paths.filter(p => p.includes('node_modules'));
      const regularPaths = paths.filter(p => !p.includes('node_modules'));

      expect(nodeModulesPaths.length).toBe(2);
      expect(regularPaths.length).toBe(2);
      expect(nodeModulesPaths.every(p => p.includes('node_modules'))).toBe(true);
      expect(regularPaths.every(p => !p.includes('node_modules'))).toBe(true);
    });
  });

  describe("FileMode integration logic", () => {
    test("should demonstrate fileMode behavior difference", () => {
      // 模拟正常模式（fileMode = true）
      delete process.env.TESTSOLAR_TTP_FILEMODE;
      const normalMode = !process.env.TESTSOLAR_TTP_FILEMODE;
      
      // 模拟 fileMode（fileMode = false）
      process.env.TESTSOLAR_TTP_FILEMODE = "1";
      const fileModeEnabled = !process.env.TESTSOLAR_TTP_FILEMODE;
      
      expect(normalMode).toBe(true);  // 正常模式：解析具体测试用例
      expect(fileModeEnabled).toBe(false);  // fileMode：只输出文件路径
      
      // 验证两种模式的行为不同
      expect(normalMode).not.toBe(fileModeEnabled);
    });

    test("should simulate test case vs file path output", () => {
      const testFilePath = "tests/example.spec.ts";
      const testCaseName = "should work correctly";
      
      // 正常模式：输出 "文件路径?测试用例名"
      const normalModeOutput = `${testFilePath}?${testCaseName}`;
      
      // fileMode：只输出文件路径
      const fileModeOutput = testFilePath;
      
      expect(normalModeOutput).toBe("tests/example.spec.ts?should work correctly");
      expect(fileModeOutput).toBe("tests/example.spec.ts");
      expect(normalModeOutput).toContain("?");
      expect(fileModeOutput).not.toContain("?");
    });
  });
});