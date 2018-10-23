# Contributing
## Automated Builds
* A build for the project is run in Jenkins every hour
* You can view the latest build [here](https://ciserver.me/job/twly-test)

## Code Style and Tests... automate it
* `npm run install:hooks`
* This will install a precommit hook that will run lint and tests every time you make a commit

## Introducing Changes
* Cut a branch off of develop, name it whatever you want
* Try to keep the number of changes introduced in a branch to a reasonably defined scope
* Make sure the tests pass
* Write tests for any new pure functions you create
* Make a PR with `develop` as the merge target
* I schedule releases on a discretionary basis

## Issues
* If you notice any issues with the library, post in the issues section with as clear and detailed a report as possible
* If you address any open issues in a PR, please note it in the commit which fixes it and/or the PR body

## Understanding Key Data Structures
`allBlockHashes` is an object with `blockHash` as key and the value is is an object with a `docIndexes` array for looking up the corresponding documents which contain that block in the `docs` array and `msgInd` for looking up the corresponding message in the `messages` array.

`fullDocHashes` is an object with `docHash` as a key and the value is an object with `docInd` for looking up the corresponding document in the `docs` array and `msgInd` for looking up the corresponding message in the `messages` array.

