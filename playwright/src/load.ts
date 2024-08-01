import * as process from "process";
import { loadTestCasesFromFile } from "./playwrightx/parser";


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
