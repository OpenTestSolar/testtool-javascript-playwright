#! /bin/bash

set -exu -o pipefail

# 修改为COS地址，后续增加域名
curl -Lk https://testsolar-1321258242.cos.ap-guangzhou.myqcloud.com/cli/install/stable/install.sh | bash


TOOL_ROOT=$(dirname $(dirname $(dirname $(readlink -fm $0))))
echo ${TOOL_ROOT}

cd ${TOOL_ROOT}

npm config set registry https://mirrors.tencent.com/npm/

npm install

npm install @tencent/testsolar_sdk@latest

npm install typescript

npx tsc
