'use strict';
var chalk = require('chalk');

class Message  {
  constructor (docs, type, content, hash) {
    this.docs = docs;
    this.type = type;
    content = content ? content : '';
    this.content = [content];
  }

  toPlainEnglish () {
    let msg = '';

    if (this.docs.length === 2) {
      msg += `${chalk.yellow(this.docs[0])} and ${chalk.yellow(this.docs[1])} `;
    } else {
      this.docs.forEach(function (doc, i) {
        if (i === (this.docs.length + 1)) {
          msg += `and ${chalk.yellow(this.docs[i])} `;
        } else {
          msg += `${chalk.yellow(this.docs[i])}, `;
        }
      }, this);
    }

    switch (this.type) {
      case 0: {
        msg += `are ${chalk.red('IDENTICAL')} ${chalk.bgRed(chalk.blue('W') + chalk.yellow('T') + chalk.green('F') + '!!!')} \n`;
        return msg;
      }
      case 1: {
        msg += `repeat the following: \n`;
        break;
      }
      case 2: {
        msg += `repeats the following within the file: \n`;
        break;
      }
      default: {}
    }

    this.content.forEach(function (content, ind) {
      msg += `${ind + 1}.)\n\t ${chalk.red(content)} \n`;
    }, this);

    return msg;
  }
}

module.exports = Message;