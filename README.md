# Introduction

## Setup and Usage
1. Clone the repo
2. Install dependencies
```bash
npm i
```
3. Copy the environment variables from the `.env.example` file to `.env` and update the variables

4. Run the tests
```bash
npm run tests -- <name-of-yml-config> <directory-name>
```
## Examples
- Run the test `personal-designs.yml` in the `dev.artistly.ai` directory
```bash
npm run tests -- personal-designs dev.artistly.ai
```
- You can also partially match the directory name
```bash
npm run tests -- personal-designs dev
```

## Reports
Reports are automatically generated in the in the `reports` directory in each test directory with the test name as the filename.
## Extension
You may add additional tests in a subdirectory
