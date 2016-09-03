#!/usr/bin/env node
'use strict';

var fs = require('fs');
var chalk = require('chalk');
var towelie = require('./towelie');
var glob = require('glob');
var path = require('path');
var Message = require('./message.js');

init();

function init () {
  console.log(chalk.green(towelie));

  // The procedure is to (1) read (2) compare the contents and (3) report towlie's findings
  read(process.argv[2].toString())
    .then(function (docs){ return compare(docs); })
    .then(function (messages){ return report(messages); })
    .catch(function (err) { throw err; });
}

function read (pathsToRead) {
  // Reading in all documents and only beginning the comparison once all have been read into memory
  return new Promise(function (resolve, reject){
    var docs = [];
    glob(path.join(process.cwd(), pathsToRead), function (err, paths){
      paths.forEach(function (p, i) {
        fs.readFile(p, function (err, data) {
          if (err) { throw err; }
          docs.push({ content: data.toString(), filePath: p, pi: i });
          if (docs.length === paths.length) {
            resolve(docs);
          }
        });
      });
    });
  });
}

function compare (docs) {
  var messages = [];
  // i represents the "root document"
  for (var i = 0; i < docs.length; i++) {
    var iPOriginal = removeEmpty(docs[i].content.split('\n\n'));
    var iP = normalize(iPOriginal);
    // x represents the "comparison document"
    for (var x = 0; x < docs.length; x++) {
      var xPOriginal = removeEmpty(docs[x].content.split('\n\n'));
      var xP = normalize(xPOriginal);

      if (i === x) { continue; }
      // First let's check for total equality. If equal, then no reason to compare at a deeper level.
      if (docs[i].content === docs[x].content) {
        messages.push(new Message([docs[i].filePath, docs[x].filePath], 0));
        continue;
      }

      /*
        Check for paragraph-level equality by iterating over the "root document" paragraphs (y), 
        and for each paragraph iterating over the current "comparison document" paragraphs (z)
      */
      for (let y = 0; y < iP.length; y++) {
        let matches = iPOriginal[y].match(/\n/g);
        if(!matches || matches && matches.length < 3) { continue; }
        for (let z = 0; z < xP.length; z++) {
          if (iP[y] === xP[z]) {
            var isRepeat = -1;
            var isDupe = false;
            messages.forEach(function (msg, ind) {
              if (msg.docs.indexOf(docs[i].filePath) > -1 && msg.docs.indexOf(docs[x].filePath) > -1) {
                isRepeat = ind;
                isDupe = msg.content.indexOf(iPOriginal[y]) !== -1;
              }
            });

           if (isDupe) {
             continue;
           } else if (isRepeat !== -1) {
             messages[isRepeat].content.push(iPOriginal[y]);
           } else {
              messages.push(new Message([docs[i].filePath, docs[x].filePath], 1, iPOriginal[y]));
            }
          }
        }
      }
    }
  }

  return messages;
}

function report (messages) {
  messages.forEach(function (msg) { console.log(msg.toPlainEnglish()); });
  chalk.green(`Towelie says, don't forget your towel when you get out of the pool`);
  chalk.red(`Towelie found ${messages.length} violations!`);
}

function normalize (arr) {
  return removeEmpty(arr).map(function (s) { return s.replace(/\s/g, ''); });
}

function removeEmpty (arr) {
  return arr.filter(function (arr) { return arr !== ''; });
}