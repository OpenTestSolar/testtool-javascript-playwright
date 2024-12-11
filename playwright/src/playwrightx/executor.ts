import * as fs from "fs";
import * as path from "path";

import Reporter from "testsolar-oss-sdk/src/testsolar_sdk/reporter";
import log from 'testsolar-oss-sdk/src/testsolar_sdk/logger';

import {
    executeCommands,
    createTestResults,
    generateCommands,
    groupTestCasesByPath,
    getTestcasePrefix
} from "./utils";

export async function runTestCase(runParamFile: string): Promise<void> {
    log.info("Pipe file: ", runParamFile);
    const fileContent = fs.readFileSync(runParamFile, "utf-8");
    const data = JSON.parse(fileContent);
    log.info(`Pipe file content:\n${JSON.stringify(data, null, 2)}`);
    const testSelectors = data.TestSelectors || [];
    const projPath = data.ProjectPath;
    const taskId = data.TaskId;
  
    const testcasePrefix = getTestcasePrefix();

    // 新的 selector 列表
    const newSelectors: string[] = [];

    // 遍历 testSelectors
    testSelectors.forEach((selector: string) => {
        if (testcasePrefix && selector) {
            // 去掉前缀
            const newSelector = selector.replace(new RegExp(`^${testcasePrefix}`), "");
            newSelectors.push(newSelector);
        } else {
            // 如果前缀为空或 selector 为空，直接添加到新的列表中
            newSelectors.push(selector);
        }
    });

    // 按照文件对用例进行分组
    const caseLists = groupTestCasesByPath(newSelectors);
  
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
            caseJsonFile,
        );
        
        const results = createTestResults(testResults);
        const reporter = new Reporter(taskId, data.FileReportPath);
        for (const result of results) {
            await reporter.reportTestResult(result);
        }
    }
}
