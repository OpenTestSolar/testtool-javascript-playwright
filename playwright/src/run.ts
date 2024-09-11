import * as process from "process";
import { runTestCase } from "./playwrightx/executor";
import log from 'testsolar-oss-sdk/src/testsolar_sdk/logger';

// 从命令行参数中获取文件路径
const runParamFile = process.argv[2];

// 定义一个用于运行测试用例的函数
async function main() {
  try {
    await runTestCase(runParamFile);
    log.info("Run result reported successfully");
  } catch (error) {
    log.error("Failed to run test cases:", error);
  }
}

// 使脚本可以直接通过 Node.js 运行
if (require.main === module) {
  main();
}