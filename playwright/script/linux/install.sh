#! /bin/bash

set -exu -o pipefail

# 使用COS上的安装脚本安装uniSDK，后续修改为testsolar的独立域名
curl -Lk https://testsolar-1321258242.cos.ap-guangzhou.myqcloud.com/cli/testtools_sdk-install/stable/install.sh | bash

TOOL_ROOT=$(dirname $(dirname $(dirname $(readlink -fm $0))))
echo ${TOOL_ROOT}

cd ${TOOL_ROOT}

npm install pnpm -g

pnpm install

pnpm install typescript

npx tsc

