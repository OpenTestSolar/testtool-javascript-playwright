#! /bin/bash

set -exu -o pipefail

TOOL_ROOT=$(realpath "$0" | xargs dirname | xargs dirname | xargs dirname)
echo "${TOOL_ROOT}"

echo "${TESTSOLAR_WORKSPACE}"

/usr/local/bin/testtools_sdk version

/usr/local/bin/testtools_sdk serve --tool playwright --file-report-mode
