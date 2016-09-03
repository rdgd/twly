'use strict';
var chalk = require('chalk');

class Message  {
  constructor (docs, type, content) {
    this.docs = docs;
    this.type = type;
    this.content = [content];
  }

  toPlainEnglish () {
    let msg = '';

    if (this.docs.length === 2) {
      msg += `${this.docs[0]} and ${this.docs[1]} `;
    } else {
      this.docs.forEach(function (doc, i) {
          if (i === (this.docs.length - 1)) {
          msg += `and ${this.docs[i]} `;
          } else {
          msg += `${this.docs[i]}, `;
          }
      });
    }

    switch (this.type) {
    case 0: {
      msg += `are ${chalk.red('IDENTICAL')}! ${chalk.bgYellow(chalk.blue('W') + chalk.cyan('T') + chalk.green('F'))} ${chalk.bgRed('!!!')}`;
      return msg;
    }
    case 1: {
      msg += `repeat the following: \n`;
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