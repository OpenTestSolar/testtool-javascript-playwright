#! /bin/bash

set -e

TOOL_ROOT=$(dirname $(dirname $(dirname $(readlink -fm $0))))
echo ${TOOL_ROOT}

cd ${TOOL_ROOT}
echo ${TESTSOLAR_WORKSPACE}

export PLAYWRIGHT_BROWSERS_PATH=/tmp/playwright_ms_browser
