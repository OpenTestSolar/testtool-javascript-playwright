import { runTestCase } from "./playwrightx/executor";

// 从命令行参数中获取文件路径
const runParamFile = process.argv[2];

// 执行加载测试用例的函数
runTestCase(runParamFile)
  .then(() => {
    console.log("Run result reported successfully");
  })
  .catch((error) => {
    console.error("Failed to run test cases:", error);
  });

// 使脚本可以直接通过 Node.js 运行
if (require.main === module) {
  runTestCase(runParamFile);
}
