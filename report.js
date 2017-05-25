const chalk = require('chalk');
require('console.table');

class Report {
  constructor (state = {}, messages = [], threshold = 100) {
    this.score = (100 - ((state.dupedLines / state.totalLines) *  100)).toFixed(2);
    this.messages = this.buildMessages(messages);
    this.threshold = threshold;
    this.summary = this.summarize(state);
    this.pass = this.score >= threshold;
  }

  buildMessages (messages) {
    return messages.sort((a, b) => {
      if (a.type > b.type) { return -1; }
      if (a.type < b.type) { return 1; }
      return 0;
    }).map((msg) => msg.toPlainEnglish());
  }

  summarize (state) {
    return {
      'Files Analyzed': state.totalFiles,
      'Duplicate Files': state.numFileDupes,
      'Lines Analyzed': state.totalLines,
      'Duplicate Lines': state.dupedLines,
      'Duplicate Blocks': state.numBlockDupes,
      'Duplicate Blocks Within Files': state.numBlockDupesInFile
    };
  }

  log (exitOnFailure) {
    this.messages.forEach((m) => console.log(m));
    console.table([this.summary]);
    if (!this.pass) {
      console.log(chalk.bgRed(`You failed your threshold of ${this.threshold}% with a score of ${this.score}%`));
      if (exitOnFailure) { process.exitCode = 1; }
    } else {
      console.log(chalk.bgGreen(`You passed your threshold of ${this.threshold}% with a score of ${this.score}%`));
    }
  }
}

module.exports = Report;