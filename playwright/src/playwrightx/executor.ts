import * as fs from "fs";
import * as path from "path";

import Reporter from "testsolar-oss-sdk/src/testsolar_sdk/reporter";
import log from 'testsolar-oss-sdk/src/testsolar_sdk/logger';

import {
    executeCommands,
    createTestResults,
    generateCommands,
    groupTestCasesByPath,
} from "./utils";

export async function runTestCase(runParamFile: string): Promise<void> {
    log.info("Pipe file: ", runParamFile);
    const fileContent = fs.readFileSync(runParamFile, "utf-8");
    const data = JSON.parse(fileContent);
    log.info(`Pipe file content:\n${JSON.stringify(data, null, 2)}`);
    const testSelectors = data.TestSelectors || [];
    const projPath = data.ProjectPath;
    const taskId = data.TaskId;
  
    // 按照文件对用例进行分组
    const caseLists = groupTestCasesByPath(testSelectors);
  
    // 创建附件目录
    const attachmentsPath = path.join(projPath, "attachments");
    if (!fs.existsSync(attachmentsPath)) {
      fs.mkdirSync(attachmentsPath, { recursive: true });
    }

    // 对每个文件生成命令行
    for (const [casePath, testcases] of Object.entries(caseLists)) {
        // 执行命令并解析用例生成的 JSON 文件
        const jsonName = casePath.replace(/\//g, "_") + ".json";
        const caseJsonFile = path.join(attachmentsPath, jsonName);
        const { command, testIdentifiers } = generateCommands(casePath, testcases, caseJsonFile);
        const testResults = await executeCommands(
            projPath,
            command,
            testIdentifiers,
            jsonName,  // 将jsonName传递给executeCommands函数
        );
        
        const results = createTestResults(testResults);
        const reporter = new Reporter(taskId, data.FileReportPath);
        for (const result of results) {
            await reporter.reportTestResult(result);
        }
    }
}
