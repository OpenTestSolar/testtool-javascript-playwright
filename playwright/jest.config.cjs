/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: [
        "**/tests/**/*.ts",
    ],
    coverageThreshold: {
        global: {
            lines: 80,
        },
    },
};