import * as process from "process";
import { loadTestCasesFromFile } from "./playwrightx/parser";
import log from 'testsolar-oss-sdk/src/testsolar_sdk/logger';

// 从命令行参数中获取文件路径
const loadParamFile = process.argv[2];

// 定义一个用于加载测试用例的函数
async function main() {
  try {
    await loadTestCasesFromFile(loadParamFile);
    log.info("Load result reported successfully");
  } catch (error) {
    log.error("Failed to load test cases:", error);
  }
}

// 使脚本可以直接通过 Node.js 运行
if (require.main === module) {
  main();
}