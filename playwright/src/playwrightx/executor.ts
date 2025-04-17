import * as fs from "fs";
import * as path from "path";

import Reporter from "testsolar-oss-sdk/src/testsolar_sdk/reporter";
import log from 'testsolar-oss-sdk/src/testsolar_sdk/logger';

import {
    executeCommands,
    createTestResults,
    generateCommands,
    groupTestCasesByPath,
    getTestcasePrefix,
    createRunningTestResults
} from "./utils";

export async function runTestCase(runParamFile: string): Promise<void> {
    log.info("Pipe file: ", runParamFile);
    const fileContent = fs.readFileSync(runParamFile, "utf-8");
    const data = JSON.parse(fileContent);
    log.info(`Pipe file content:\n${JSON.stringify(data, null, 2)}`);
    const testSelectors = data.TestSelectors || [];
    let projPath = data.ProjectPath;
    const taskId = data.TaskId;
  
    const relPath = process.env.TESTSOLAR_TTP_RELPATH || "";
    if (relPath !== "") {
        log.info(`Relative path: ${relPath}`);
        projPath = path.join(projPath, relPath);
        
        // 进入projPath目录
        process.chdir(projPath);
    }
  
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

    const reporter = new Reporter(taskId, data.FileReportPath);
    // 对每个文件生成命令行
    for (const [casePath, testcases] of Object.entries(caseLists)) {
        // 上报用例运行状态
        createRunningTestResults(casePath, testcases, reporter);
    
        // 执行命令并解析用例生成的 JSON 文件
        log.info(`当前进程ID: ${process.pid}`)
        const jsonName = casePath.replace(/\//g, "_") + "_pid_" + process.pid + ".json";
        const { command, testIdentifiers } = generateCommands(casePath, testcases, jsonName);
        const testResults = await executeCommands(
            projPath,
            command,
            testIdentifiers,
            jsonName,
        );
        
        const results = createTestResults(testResults, testIdentifiers);
        for (const result of results) {
            await reporter.reportTestResult(result);
        }
    }
}
