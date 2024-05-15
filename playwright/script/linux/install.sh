#! /bin/bash

set -exu -o pipefail

# 使用COS上的安装脚本安装uniSDK，后续修改为testsolar的独立域名
curl -Lk https://testsolar-1321258242.cos.ap-guangzhou.myqcloud.com/cli/testtools_sdk-install/stable/install.sh | bash

TOOL_ROOT=$(dirname $(dirname $(dirname $(readlink -fm $0))))
echo ${TOOL_ROOT}

cd ${TOOL_ROOT}

npm install

npm install typescript

npx tsc

# 设置环境变量
export PLAYWRIGHT_BROWSERS_PATH=/tmp/playwright_ms_browser

# 安装浏览器
npx playwright install-deps
npx playwright install
