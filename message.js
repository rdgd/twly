'use strict';
var chalk = require('chalk');
let wtf = chalk.bgRed(chalk.blue('W') + chalk.yellow('T') + chalk.green('F'));
const typeMessages = new Map([
  ['identical file', `are ${chalk.red('IDENTICAL')} ${wtf} !!! \n`],
  ['inter-file duplicate', 'repeat the following: \n'],
  ['intra-file duplicate', 'repeats the following within the file: \n']    
]);

class Message  {
  constructor (docs, type, hashes, content = '') {
    this.docs = docs;
    this.type = type;
    this.hashes = [hashes];
    this.content = [content];
  }

  toPlainEnglish () {
    return this._makeMessageTitle() + this._makeMessageContent();
  }

  _makeMessageTitle () {
    let msg = '';

    if (this.docs.length === 2) {
      msg += `${chalk.yellow(this.docs[0])} and ${chalk.yellow(this.docs[1])} `;
    } else {
      this.docs.forEach((doc, i) => {
        let lastDoc = i === (this.docs.length + 1);
        let docName = chalk.yellow(this.docs[i]);
        lastDoc ? msg += `and ${docName}` : msg += `${docName}, `; 
      });
    }

    msg += typeMessages.get(this.type);

    return msg;
  }

  _makeMessageContent () {
    return this.content.map((content, ind) => {
      if (content) { return `${ind + 1}.)\n\t ${chalk.red(content)} \n`; }
    }).join('');
  }
}

module.exports = Message;